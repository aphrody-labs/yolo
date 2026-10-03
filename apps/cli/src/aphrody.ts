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

export function onPath(bin: string): boolean {
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

/** The build factory as the Aphrody config declares it, or null when absent/disabled (used by `yolo host`). */
export function buildFactoryInfo(): (Factory & { cacheRoot?: string }) | null {
  try {
    return loadFactory() as Factory & { cacheRoot?: string };
  } catch {
    return null;
  }
}

const git = (cwd: string, ...args: string[]): string =>
  spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();

export function remotePaths(factory: Factory, sha: string) {
  // sibling of the other first-party workspaces: <workspaces>/yolo
  const workspace = join(resolve(factory.workspaceRoot, ".."), "yolo").replaceAll("\\", "/");
  const artifacts = `${factory.artifactRoot}/yolo/${sha}`;
  return { workspace, artifacts, lock: factory.lockPath };
}

/** tmux session (and systemd unit) name of one build: stable per commit so it can be attached, queried and stopped. */
export function sessionName(sha: string): string {
  return `yolo-ship-${sha.slice(0, 12)}`;
}

/**
 * The remote command: a detached tmux session on the build host (survives any ssh disconnect) that runs the
 * commit's own `ship_unit.sh`, copied next to the artifacts first so a later checkout can never rewrite the script
 * while bash reads it. The unit script takes the heavy lock, checks the commit out and runs the build as a transient
 * systemd unit with the cgroup ceilings lifted. A build already running for this commit is left alone unless forced.
 */
export function remoteCommand(factory: Factory, sha: string, force = false): string {
  const p = remotePaths(factory, sha);
  const name = sessionName(sha);
  const start = [
    `mkdir -p '${p.artifacts}'`,
    `git -C '${p.workspace}' show '${sha}:scripts/release/ship_unit.sh' > '${p.artifacts}/ship_unit.sh'`,
    `echo queued > '${p.artifacts}/STATUS'`,
    `tmux new-session -d -s '${name}' -c '${p.workspace}' "bash '${p.artifacts}/ship_unit.sh' '${sha}' '${p.workspace}' '${p.artifacts}' '${p.lock}'"`,
    "echo started",
  ].join(" && ");
  if (force) return `${stopCommand(sha)} >/dev/null; ${start}`;
  return `if tmux has-session -t '${name}' 2>/dev/null; then echo "already running: ${name} (yolo ship attach|stop, or --force)"; else ${start}; fi`;
}

/** Stop one build: the tmux session and its systemd unit (the whole cgroup, so no stray cargo/rustc survives). */
export function stopCommand(sha: string): string {
  const name = sessionName(sha);
  return `(tmux kill-session -t '${name}' 2>/dev/null || true); (sudo -n systemctl stop '${name}.service' 2>/dev/null || true); echo stopped ${name}`;
}

/** Block on the build host until the build of `sha` ends; exits 0 only when it ended `ok`. */
export function waitCommand(factory: Factory, sha: string): string {
  const p = remotePaths(factory, sha);
  return [
    `[ -f '${p.artifacts}/STATUS' ] || { echo no-build-for-${sha}; exit 2; }`,
    `until grep -qE '^(ok|failed|stopped)' '${p.artifacts}/STATUS'; do sleep 20; done`,
    `tail -n 40 '${p.artifacts}/ship.log'`,
    `echo; echo "STATUS: $(cat '${p.artifacts}/STATUS')"`,
    `grep -qx ok '${p.artifacts}/STATUS'`,
  ].join("\n");
}

/** HTTPS form of the origin remote (the build host authenticates with `gh`, not with this machine's ssh aliases). */
export function originUrl(cwd: string): string {
  const raw = git(cwd, "remote", "get-url", "origin");
  return raw
    .replace(/^git@[^:]+:/, "https://github.com/")
    .replace(/^ssh:\/\/git@[^/]+\//, "https://github.com/");
}

/**
 * Transport is git and gh only: clone the repository on the build host once, then fetch the pushed commit and the
 * tags through HTTPS. The commit may still be in flight when the pre-push hook starts this, so the fetch retries for
 * a while. The working tree is not touched here: the checkout happens under the heavy lock (`ship_unit.sh`), so a
 * build in progress never sees its sources change.
 */
export function remoteSyncCommand(factory: Factory, sha: string, url: string): string {
  const p = remotePaths(factory, sha);
  const ws = `'${p.workspace}'`;
  return [
    "set -e",
    "gh auth setup-git",
    `git config --global --get-all url."https://github.com/".insteadOf | grep -qxF 'git@github-dev:' || git config --global --add url."https://github.com/".insteadOf 'git@github-dev:'`,
    `mkdir -p "$(dirname ${ws})"`,
    `[ -d ${ws}/.git ] || git clone --filter=blob:none --no-checkout '${url}' ${ws}`,
    `cd ${ws}`,
    "git fetch --prune --tags --filter=blob:none origin",
    `i=0; until git cat-file -e '${sha}^{commit}' 2>/dev/null; do sleep 15; git fetch --prune --tags --filter=blob:none origin || true; i=$((i+1)); [ $i -ge 40 ] && { echo "commit ${sha} not on origin"; exit 1; }; done`,
    "command -v tmux >/dev/null || sudo -n apt-get install -y -qq tmux",
    "echo synced",
  ].join("\n");
}

function ssh(host: string, command: string, timeoutSecs = 120): number {
  return run(["aphrody-infra", "ssh", "exec", "--host", host, "--cmd", command], aphrodyRoot(), {
    APHRODY_SSH_COMMAND_TIMEOUT_SECS: String(timeoutSecs),
  });
}

export interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const RC_MARK = "@@yolo-rc=";

/**
 * `aphrody-infra ssh exec` fails the whole call (and drops stdout) on a non-zero remote exit. Running the
 * command in a subshell and printing its status keeps stdout, stderr and the real exit code.
 */
export function withExitSentinel(command: string): string {
  return `(${command}\n); printf '\\n${RC_MARK}%s\\n' "$?"`;
}

export function splitExitSentinel(stdout: string): { stdout: string; code: number | null } {
  const i = stdout.lastIndexOf(`\n${RC_MARK}`);
  if (i < 0) return { stdout, code: null };
  const code = Number.parseInt(stdout.slice(i + 1 + RC_MARK.length), 10);
  return { stdout: stdout.slice(0, i), code: Number.isNaN(code) ? null : code };
}

async function captureAphrody(argv: readonly string[], timeoutSecs: number): Promise<Captured> {
  const root = aphrodyRoot();
  const proc = Bun.spawn([...argv], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      APHRODY_INFRA_ROOT: root,
      APHRODY_SSH_COMMAND_TIMEOUT_SECS: String(timeoutSecs),
    },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

/** Run a command on an `aphrody-infra` host through `ssh exec --json` and return its real output. */
export async function sshCapture(
  host: string,
  command: string,
  timeoutSecs = 120,
): Promise<Captured> {
  const r = await captureAphrody(
    ["aphrody-infra", "ssh", "exec", "--host", host, "--json", "--cmd", withExitSentinel(command)],
    timeoutSecs,
  );
  if (r.code !== 0) return { code: 255, stdout: "", stderr: (r.stderr || r.stdout).trim() };
  try {
    const j = JSON.parse(r.stdout) as { stdout?: string; stderr?: string };
    const split = splitExitSentinel(j.stdout ?? "");
    return { code: split.code ?? 255, stdout: split.stdout, stderr: j.stderr ?? "" };
  } catch {
    return {
      code: 255,
      stdout: "",
      stderr: `unparseable aphrody-infra output: ${r.stdout.slice(0, 200)}`,
    };
  }
}

/** Query or mutate one systemd unit through the owner (`stop`/`disable` carry --confirm). */
export function sshServiceArgs(host: string, unit: string, action: string): string[] {
  const confirm = action === "stop" || action === "disable" ? ["--confirm"] : [];
  return ["aphrody-infra", "ssh", "service", "--host", host, "--action", action, ...confirm, unit];
}

export async function sshService(host: string, unit: string, action: string): Promise<Captured> {
  const r = await captureAphrody(sshServiceArgs(host, unit, action), 60);
  return r;
}

/** Owner tuning report/application (`aphrody-infra ssh tune`), JSON. */
export async function sshTune(host: string, apply: boolean): Promise<Captured> {
  return captureAphrody(
    ["aphrody-infra", "ssh", "tune", "--host", host, "--json", ...(apply ? ["--apply"] : [])],
    120,
  );
}

async function waitFor(host: string, factory: Factory, sha: string): Promise<number> {
  const r = await sshCapture(host, waitCommand(factory, sha), 86_400);
  process.stdout.write(r.stdout);
  if (r.stderr.trim() !== "") process.stderr.write(`${r.stderr.trim()}\n`);
  return r.code;
}

async function runShip(args: readonly string[], yoloRoot: string): Promise<number> {
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const apply = args.includes("--apply");
  const detach = args.includes("--detach");
  const force = args.includes("--force");
  const wait = args.includes("--wait");
  const factory = loadFactory();
  const host = flag("--host") ?? factory.target;
  const sha = flag("--sha") ?? git(yoloRoot, "rev-parse", "HEAD");
  const p = remotePaths(factory, sha);
  const sub = args[0];

  if (sub === "stop") return ssh(host, stopCommand(sha));
  if (sub === "wait") return waitFor(host, factory, sha);
  if (sub === "attach") {
    return run(["ssh", "-t", host, "tmux", "attach", "-t", sessionName(sha)], yoloRoot);
  }
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
  console.log(
    `  1. git (gh auth) on ${host}  fetch ${sha.slice(0, 12)} and tags -> ${p.workspace}`,
  );
  console.log(
    `  2. tmux ${sessionName(sha)}  heavy lock -> checkout + submodules -> systemd unit (no CPU/RAM/swap ceiling) -> ${p.artifacts}`,
  );
  if (!apply) {
    console.log("\nPlan only. Re-run with --apply to fetch the pushed commit and start the build.");
    return 0;
  }
  if (git(yoloRoot, "status", "--porcelain") !== "")
    console.log(
      "  note: uncommitted changes are not shipped; the remote checks out the pushed commit",
    );
  let code = ssh(host, remoteSyncCommand(factory, sha, originUrl(yoloRoot)), 3600);
  if (code !== 0) return code;
  code = ssh(host, remoteCommand(factory, sha, force));
  if (code !== 0) return code;
  if (wait) return waitFor(host, factory, sha);
  console.log(`  follow: yolo ship status|log|wait|attach|stop --sha ${sha.slice(0, 12)}`);
  return 0;
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
