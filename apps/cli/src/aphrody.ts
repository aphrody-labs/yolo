/**
 * Native bridge to the Aphrody control plane, so that yolo is one workflow with it:
 *
 *   yolo infra|ops|workspace|workflow|git|ssh ...   pass-through to the installed owner CLIs
 *   yolo ship [--apply] [--sha X] [--detach]         build all of yolo on the build factory host
 *   yolo ship status|log [--sha X]                   follow a build
 *   yolo hooks install|uninstall                     run `ship` automatically on `git push` to main/dev
 *
 * Owners stay owners: `aphrody-infra` (host matrix, SSH, workflow stages, git audit), `aphrody-ops` /
 * `aphrody-workspace` (workspace gates). Heavy builds run on the host declared in the Aphrody
 * `config/build-factory.json`, behind its heavy lock; secrets stay on that host.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const PASSTHROUGH: Readonly<Record<string, readonly string[]>> = {
  infra: ["aphrody-infra"],
  ops: ["aphrody-ops"],
  workspace: ["aphrody-workspace"],
  workflow: ["aphrody-infra", "workflow"],
  git: ["aphrody-infra", "git"],
  ssh: ["aphrody-infra", "ssh"],
};

export const APHRODY_COMMANDS = [...Object.keys(PASSTHROUGH), "ship", "hooks"] as const;

export function aphrodyRoot(): string {
  return resolve(process.env["YOLO_APHRODY_ROOT"] ?? join(homedir(), "aphrody"));
}

function onPath(bin: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }).status === 0;
}

function run(cmd: readonly string[], cwd: string, env: NodeJS.ProcessEnv = {}): number {
  const [bin, ...rest] = cmd as [string, ...string[]];
  const result = spawnSync(bin, rest, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  return result.status ?? 1;
}

interface Factory {
  readonly target: string;
  readonly workspaceRoot: string;
  readonly artifactRoot: string;
  readonly lockPath: string;
}

function loadFactory(): Factory {
  const file = join(aphrodyRoot(), "config/build-factory.json");
  if (!existsSync(file)) throw new Error(`Build factory config not found: ${file}`);
  const raw = JSON.parse(readFileSync(file, "utf8")) as Factory & { enabled?: boolean };
  if (raw.enabled === false) throw new Error("The Aphrody build factory is disabled");
  return raw;
}

const git = (cwd: string, ...args: string[]): string =>
  spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();

export function remotePaths(factory: Factory, sha: string) {
  // sibling of the other first-party workspaces: <workspaces>/yolo
  const workspace = join(resolve(factory.workspaceRoot, ".."), "yolo").replaceAll("\\", "/");
  const artifacts = `${factory.artifactRoot}/yolo/${sha}`;
  return { workspace, artifacts, lock: factory.lockPath };
}

/** The remote command: detached, serialized behind the heavy lock, status and log kept next to the artifacts. */
export function remoteCommand(factory: Factory, sha: string): string {
  const p = remotePaths(factory, sha);
  return [
    `mkdir -p '${p.artifacts}'`,
    `echo queued > '${p.artifacts}/STATUS'`,
    `(nohup flock '${p.lock}' bash '${p.workspace}/scripts/ship_remote.sh' '${sha}' '${p.workspace}' '${p.artifacts}' > '${p.artifacts}/ship.log' 2>&1 < /dev/null &)`,
    "echo started",
  ].join(" && ");
}

function ssh(host: string, command: string, timeoutSecs = 120): number {
  return run(["aphrody-infra", "ssh", "exec", "--host", host, "--cmd", command], aphrodyRoot(), {
    APHRODY_SSH_COMMAND_TIMEOUT_SECS: String(timeoutSecs),
  });
}

async function runShip(args: readonly string[], yoloRoot: string): Promise<number> {
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const apply = args.includes("--apply");
  const detach = args.includes("--detach");
  const factory = loadFactory();
  const host = flag("--host") ?? factory.target;
  const sha = flag("--sha") ?? git(yoloRoot, "rev-parse", "HEAD");
  const p = remotePaths(factory, sha);
  const sub = args[0];

  if (sub === "status" || sub === "log") {
    const file = sub === "status" ? "STATUS" : "ship.log";
    return ssh(host, `tail -n 60 '${p.artifacts}/${file}' 2>&1 || echo no-build-for-${sha}`);
  }
  if (detach) {
    // used by the pre-push hook: never block the push, keep a local log
    const logDir = join(yoloRoot, "var/ship");
    mkdirSync(logDir, { recursive: true });
    const fd = openSync(join(logDir, `${sha.slice(0, 12)}.log`), "a");
    const child = spawn(
      process.execPath,
      [...process.argv.slice(1).filter((a) => a !== "--detach"), "--apply", "--sha", sha],
      { cwd: yoloRoot, detached: true, stdio: ["ignore", fd, fd] },
    );
    child.unref();
    console.log(`yolo ship ${sha.slice(0, 12)} started in the background (var/ship)`);
    return 0;
  }

  console.log(`\x1b[1myolo ship\x1b[0m ${sha.slice(0, 12)} -> ${host}:${p.workspace}`);
  console.log(`  1. aphrody-infra ssh sync   ${yoloRoot} -> ${p.workspace}`);
  console.log(`  2. remote (heavy lock)      scripts/ship_remote.sh -> ${p.artifacts}`);
  if (!apply) {
    console.log("\nPlan only. Re-run with --apply to sync and start the build.");
    return 0;
  }
  const dirty = git(yoloRoot, "status", "--porcelain");
  if (dirty !== "")
    console.log("  note: the working tree has uncommitted changes; they are synced as-is");
  let code = run(
    [
      "aphrody-infra",
      "ssh",
      "sync",
      "--host",
      host,
      "--source",
      yoloRoot,
      "--destination",
      p.workspace,
      "--apply",
    ],
    aphrodyRoot(),
    // rclone remote defined from the environment: transport is the user's own `ssh <alias>`, no stored secret
    {
      [`RCLONE_CONFIG_${host.toUpperCase()}_TYPE`]: "sftp",
      [`RCLONE_CONFIG_${host.toUpperCase()}_SSH`]: `ssh ${host}`,
    },
  );
  if (code !== 0) return code;
  code = ssh(host, remoteCommand(factory, sha));
  if (code === 0)
    console.log(`  follow: yolo ship status --sha ${sha.slice(0, 12)}  |  yolo ship log`);
  return code;
}

const HOOK_MARK = "# yolo-ship";

function runHooks(args: readonly string[], yoloRoot: string): number {
  const dir = join(yoloRoot, ".githooks");
  const hook = join(dir, "pre-push");
  if (args[0] === "install") {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      hook,
      `#!/bin/sh\n${HOOK_MARK}\n# Starts the full yolo build on the build factory for pushes to main/dev (non-blocking).\nwhile read -r _ local_sha _ remote_ref; do\n  case "$remote_ref" in\n    refs/heads/main|refs/heads/dev)\n      [ "$local_sha" = "0000000000000000000000000000000000000000" ] && continue\n      (cd "$(git rev-parse --show-toplevel)" && bun run cli ship --detach --sha "$local_sha" >/dev/null 2>&1 || true)\n      ;;\n  esac\ndone\nexit 0\n`,
      { mode: 0o755 },
    );
    const code = run(["git", "config", "core.hooksPath", ".githooks"], yoloRoot);
    if (code === 0)
      console.log("Installed .githooks/pre-push: pushes to main/dev start `yolo ship`.");
    return code;
  }
  if (args[0] === "uninstall") {
    return run(["git", "config", "--unset", "core.hooksPath"], yoloRoot);
  }
  console.error("Usage: yolo hooks install|uninstall");
  return 1;
}

export async function runAphrodyCommand(
  command: string,
  args: readonly string[],
  yoloRoot: string,
): Promise<number> {
  if (command === "ship") return runShip(args, yoloRoot);
  if (command === "hooks") return runHooks(args, yoloRoot);
  const base = PASSTHROUGH[command];
  if (base === undefined) throw new Error(`Unknown Aphrody command ${command}`);
  if (!onPath(base[0] as string)) {
    console.error(`\`${base[0]}\` is not on PATH (Aphrody install: ${aphrodyRoot()})`);
    return 127;
  }
  const root = aphrodyRoot();
  return run([...base, ...args], root, { APHRODY_INFRA_ROOT: root, YOLO_ROOT: yoloRoot });
}

/** For `yolo doctor`: which Aphrody owners are reachable. */
export function aphrodyTools(): { name: string; found: boolean }[] {
  return ["aphrody-infra", "aphrody-ops", "aphrody-workspace"].map((name) => ({
    name,
    found: onPath(name),
  }));
}
