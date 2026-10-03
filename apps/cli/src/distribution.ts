/**
 * Distribution commands of the standalone `yolo` executable: `version`, `doctor`, `runtime ...`,
 * `upgrade`, `uninstall`. They manage the installation under the yolo home
 * (`~/.yolo`: bin/, runtime/, packages/runtime/, templates/, crates/, VERSION), see docs/DISTRIBUTION.md.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  hostTarget,
  loadArtifact,
  runtimeHome,
  verifyArtifact,
} from "../../../packages/runtime/src/artifact";
import { install, list, rollback } from "../../../packages/runtime/src/release";
import { yoloHome, yoloVersion } from "./home";

export const DEFAULT_REPO = "aphrody-labs/yolo";

const ok = (text: string): void => console.log(`  \x1b[32m✔\x1b[0m ${text}`);
const warn = (text: string): void => console.log(`  \x1b[33m!\x1b[0m ${text}`);
const bad = (text: string): void => console.log(`  \x1b[31m✘\x1b[0m ${text}`);

export function runVersion(): number {
  console.log(`yolo ${yoloVersion()} (${hostTarget()}, Bun ${Bun.version})`);
  return 0;
}

export {
  collectDoctorReport,
  renderDoctorMarkdown,
  type DoctorComponent,
  type DoctorReport,
} from "../../../packages/core/src/sys/doctor";
import { collectDoctorReport, renderDoctorMarkdown } from "../../../packages/core/src/sys/doctor";

/** Checks the installation; returns 1 if something required is missing. */
export function runDoctor(args: readonly string[] = []): number {
  const report = collectDoctorReport();

  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  if (args.includes("--md")) {
    console.log(renderDoctorMarkdown(report));
    return report.ok ? 0 : 1;
  }

  console.log(`\x1b[1myolo doctor\x1b[0m  home ${report.home}`);
  ok(`version ${report.yoloVersion}, target ${report.hostTarget}, Bun ${report.bunVersion}`);

  for (const tool of report.tools) {
    if (tool.found) ok(`${tool.name} on PATH (yolo infra|ops|workflow|ship)`);
    else warn(`${tool.name} not on PATH (Aphrody control plane commands unavailable)`);
  }

  for (const comp of report.components) {
    if (comp.exists) ok(comp.label);
    else if (comp.required) bad(`${comp.label} missing (${comp.path})`);
    else warn(`${comp.label} not installed: \`yolo create --with desktop\` needs it`);
  }

  if (report.runtime.installed && !report.runtime.error) {
    ok(
      `runtime ${report.runtime.version} (ABI ${report.runtime.abi}, ${report.runtime.active}) verified and loadable`,
    );
    ok(`capabilities: ${(report.runtime.capabilities ?? []).join(", ")}`);
    if (!report.runtime.panicRecovery) warn("runtime built without panic recovery");
  } else {
    bad(`runtime: ${report.runtime.error ?? "not installed"}`);
  }

  if (report.rollbackAvailable) ok(`rollback available: ${report.rollbackAvailable}`);
  const bin = join(report.home, "bin");
  if (report.binOnPath) ok(`${bin} is on PATH`);
  else warn(`${bin} is not on PATH`);

  warn(
    report.ghFound
      ? "gh found (private release downloads)"
      : "gh not found (public releases and GITHUB_TOKEN only)",
  );

  return report.ok ? 0 : 1;
}

export async function runRuntimeCommand(args: readonly string[]): Promise<number> {
  const [command = "list", argument] = args;
  switch (command) {
    case "install": {
      if (argument === undefined) throw new Error("usage: yolo runtime install <artifact-dir>");
      console.log(
        `Installed ${install(resolve(argument))} in ${join(runtimeHome(), hostTarget())}`,
      );
      return 0;
    }
    case "rollback": {
      const result = rollback();
      console.log(`Rolled back: current=${result.current} previous=${result.previous ?? "-"}`);
      return 0;
    }
    case "list":
      for (const e of list()) console.log(`${e.current ? "*" : e.previous ? "-" : " "} ${e.name}`);
      return 0;
    case "verify": {
      const current = list().find((e) => e.current);
      if (current === undefined) throw new Error("No installed artifact");
      const manifest = verifyArtifact(join(runtimeHome(), hostTarget(), current.name));
      console.log(`OK ${manifest.name} ${manifest.version} ABI ${manifest.abi} (${current.name})`);
      return 0;
    }
    case "info": {
      using runtime = loadArtifact(join(runtimeHome(), hostTarget(), "current"));
      console.log(
        JSON.stringify(
          { build: runtime.buildInfo(), capabilities: runtime.capabilities() },
          null,
          2,
        ),
      );
      return 0;
    }
    default:
      console.error("usage: yolo runtime install <dir> | list | verify | rollback | info");
      return 1;
  }
}

async function githubToken(): Promise<string | undefined> {
  const fromEnv = process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"];
  if (fromEnv) return fromEnv;
  if (!Bun.which("gh")) return undefined;
  const proc = Bun.spawn(["gh", "auth", "token"], { stdout: "pipe", stderr: "ignore" });
  const out = (await new Response(proc.stdout).text()).trim();
  return (await proc.exited) === 0 && out !== "" ? out : undefined;
}

interface ReleaseAsset {
  readonly name: string;
  readonly url: string;
}

async function latestRelease(repo: string): Promise<{ tag: string; assets: ReleaseAsset[] }> {
  const token = await githubToken();
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "yolo-cli",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`cannot read the latest release of ${repo}: HTTP ${response.status}`);
  const json = (await response.json()) as {
    tag_name: string;
    assets: { name: string; url: string }[];
  };
  return { tag: json.tag_name, assets: json.assets };
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, "")
      .split(/[.+-]/)
      .slice(0, 3)
      .map((n) => Number(n) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/**
 * `yolo upgrade [--check] [--repo owner/name] [--version vX.Y.Z]`: re-runs the release's installer.
 * Known limitation, not fixed here (untestable without a Windows host): on win32 the installer replaces
 * `bin/yolo.exe` while this very process is that executable, which Windows can refuse (the running file is
 * locked). install.ps1 replaces it the same `.new` + rename way install.sh does, which helps, but a locked
 * executable specifically still needs a detached helper that waits for this process to exit first.
 */
export async function runUpgrade(args: readonly string[]): Promise<number> {
  let repo = process.env["YOLO_REPO"] ?? DEFAULT_REPO;
  let checkOnly = false;
  let wanted: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--check") checkOnly = true;
    else if (arg === "--repo") repo = args[++i] ?? repo;
    else if (arg === "--version") wanted = args[++i];
    else throw new Error(`Unknown option ${arg}`);
  }
  const release = await latestRelease(repo);
  const tag = wanted ?? release.tag;
  const current = yoloVersion();
  console.log(`installed ${current}, available ${tag}`);
  if (checkOnly) return compareVersions(tag, current) > 0 ? 10 : 0;
  if (wanted === undefined && compareVersions(tag, current) <= 0) {
    console.log("Already up to date.");
    return 0;
  }
  // Windows has no `sh`: re-run install.ps1 under PowerShell (pwsh if present, else the built-in powershell.exe).
  const installerName = process.platform === "win32" ? "install.ps1" : "install.sh";
  const asset = release.assets.find((a) => a.name === installerName);
  if (asset === undefined) throw new Error(`release ${release.tag} has no ${installerName} asset`);
  const token = await githubToken();
  const script = await fetch(asset.url, {
    headers: {
      accept: "application/octet-stream",
      "user-agent": "yolo-cli",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!script.ok) throw new Error(`cannot download ${installerName}: HTTP ${script.status}`);
  const env = { ...process.env, YOLO_VERSION: tag, YOLO_REPO: repo, YOLO_HOME: yoloHome() };
  const command =
    process.platform === "win32"
      ? [Bun.which("pwsh") ?? "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "-"]
      : ["sh", "-s", "--"];
  const proc = Bun.spawn(command, {
    stdin: new Response(await script.text()),
    stdout: "inherit",
    stderr: "inherit",
    env,
  });
  return await proc.exited;
}

/** `yolo uninstall [--yes]`: removes the installation directory (never anything else). */
export function runUninstall(args: readonly string[]): number {
  const home = yoloHome();
  const guarded = new Set([resolve("/"), resolve(homedir()), resolve(homedir(), "..")]);
  if (guarded.has(home) || !existsSync(join(home, "VERSION")) || !existsSync(join(home, "bin"))) {
    console.error(`Refusing to remove ${home}: it does not look like a yolo installation`);
    return 1;
  }
  const entries = readdirSync(home);
  if (!args.includes("--yes")) {
    console.log(
      `This removes ${home} (${entries.join(", ")}), including installed runtime artifacts.`,
    );
    console.log(
      "Re-run with --yes to confirm. Remove the PATH line from your shell profile afterwards.",
    );
    return 1;
  }
  rmSync(home, { recursive: true, force: true });
  console.log(`Removed ${home}. Remove the PATH line from your shell profile.`);
  return 0;
}
