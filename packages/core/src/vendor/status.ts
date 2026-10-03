/**
 * Monorepo submodules, vendor.lock tracking, and Cargo workspace status inspector.
 */
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { yoloHome } from "../vfs/home";
import { readWorkspaceCargo, type WorkspaceCargoSummary } from "./cargo";

export interface SubmoduleStatus {
  readonly name: string;
  readonly path: string;
  readonly exists: boolean;
  readonly headCommit?: string | undefined;
  readonly filesCount?: number | undefined;
  readonly hash?: string | undefined;
}

export interface VendorSourceStatus {
  readonly name: string;
  readonly lockedSha: string;
  readonly headSha: string | undefined;
  readonly inSync: boolean;
}

export interface StatusReport {
  readonly schema: "yolo.status/1";
  readonly timestamp: string;
  readonly root: string;
  readonly packages: readonly SubmoduleStatus[];
  readonly vendor: { crates: number; sources: readonly VendorSourceStatus[] } | null;
  readonly cargo: WorkspaceCargoSummary | null;
}

/** The git directory of a checkout: `.git` is a directory, or a `gitdir:` file for a submodule. */
export async function resolveGitDir(worktree: string): Promise<string> {
  const dotGit = resolve(worktree, ".git");
  if (!existsSync(dotGit)) return dotGit;
  if (!statSync(dotGit).isFile()) return dotGit;
  const pointer = (await Bun.file(dotGit).text()).trim().replace(/^gitdir:\s*/, "");
  return resolve(worktree, pointer);
}

/**
 * Inspect monorepo submodules and forks using Bun file I/O & wyhash checksums.
 */
export async function inspectPackages(vendorDir?: string): Promise<readonly SubmoduleStatus[]> {
  const vDir = vendorDir ?? resolve(yoloHome(), "vendor");
  const pkgs = [
    "bun",
    "obscura",
    "tauri",
    "plugins-workspace",
    "create-tauri-app",
    "wry",
    "tao",
    "next",
  ];
  const results: SubmoduleStatus[] = [];

  for (const name of pkgs) {
    const pkgPath = resolve(vDir, name);
    const exists = existsSync(pkgPath);
    if (!exists) {
      results.push({ name, path: pkgPath, exists: false });
      continue;
    }

    let headCommit: string | undefined;
    try {
      const gitDir = await resolveGitDir(pkgPath);
      const headFile = resolve(gitDir, "HEAD");
      if (existsSync(headFile)) {
        const headContent = (await Bun.file(headFile).text()).trim();
        if (headContent.startsWith("ref:")) {
          const refFile = Bun.file(resolve(gitDir, headContent.replace("ref:", "").trim()));
          if (await refFile.exists()) headCommit = (await refFile.text()).trim();
        } else {
          headCommit = headContent;
        }
      }
    } catch {
      // Fallback if git dir is not reachable
    }

    let filesCount: number | undefined;
    try {
      const glob = new Bun.Glob("**/*");
      let count = 0;
      for (const _ of glob.scanSync({ cwd: pkgPath, onlyFiles: true, dot: false })) {
        count++;
        if (count > 250) break;
      }
      filesCount = count;
    } catch {
      // Ignore counting failure
    }

    results.push({
      name,
      path: pkgPath,
      exists: true,
      headCommit: headCommit?.slice(0, 10),
      filesCount,
    });
  }

  return results;
}

/** Compares `vendor.lock` with the current HEAD of each vendored submodule. */
export async function readVendorStatus(rootDir: string = yoloHome()): Promise<{
  crates: number;
  sources: readonly VendorSourceStatus[];
} | null> {
  const lockFile = Bun.file(resolve(rootDir, "vendor.lock"));
  if (!(await lockFile.exists())) return null;
  const lock = (await lockFile.json()) as {
    sources: { name: string; sha: string }[];
    crates: unknown[];
  };
  const pkgs = await inspectPackages(resolve(rootDir, "vendor"));
  return {
    crates: lock.crates.length,
    sources: lock.sources.map((source) => {
      const headSha = pkgs.find((p) => p.name === source.name)?.headCommit;
      return {
        name: source.name,
        lockedSha: source.sha,
        headSha,
        inSync: headSha !== undefined && source.sha.startsWith(headSha),
      };
    }),
  };
}

export async function collectStatusReport(rootDir: string = yoloHome()): Promise<StatusReport> {
  const [packages, vendor, cargo] = await Promise.all([
    inspectPackages(resolve(rootDir, "vendor")),
    readVendorStatus(rootDir),
    readWorkspaceCargo(rootDir),
  ]);
  return {
    schema: "yolo.status/1",
    timestamp: new Date().toISOString(),
    root: rootDir,
    packages,
    vendor,
    cargo,
  };
}

export function renderStatusMarkdown(report: StatusReport): string {
  const lines = [
    `# yolo status`,
    "",
    `**Root:** \`${report.root}\``,
    "",
    "## Submodule Forks (`vendor/`)",
    "",
    "| Submodule | Status | Commit | Files |",
    "| :--- | :--- | :--- | ---: |",
  ];

  for (const p of report.packages) {
    const status = p.exists ? "✔ loaded" : "✘ missing";
    const commit = p.headCommit ? `\`${p.headCommit}\`` : "-";
    const count = p.filesCount !== undefined ? `~${p.filesCount}+` : "-";
    lines.push(`| \`vendor/${p.name}\` | ${status} | ${commit} | ${count} |`);
  }

  if (report.vendor) {
    lines.push(
      "",
      "## Vendored Crates (`vendor.lock`)",
      "",
      `- **Total Crates:** ${report.vendor.crates} imported into \`crates/aphrody-*\``,
      "",
      "| Source | Locked SHA | Status |",
      "| :--- | :--- | :--- |",
    );
    for (const s of report.vendor.sources) {
      const syncStatus = s.inSync ? "✔ in sync" : "⚠ drift";
      lines.push(`| \`${s.name}\` | \`${s.lockedSha.slice(0, 10)}\` | ${syncStatus} |`);
    }
  }

  if (report.cargo) {
    lines.push(
      "",
      "## Cargo Workspace Config",
      "",
      `- **Resolver:** v${report.cargo.resolver}`,
      `- **Members:** ${report.cargo.members.join(", ")}`,
      `- **Release Profile:** opt-level=${String(report.cargo.releaseProfile["opt-level"] ?? "z")}, strip=${String(report.cargo.releaseProfile["strip"] ?? true)}`,
    );
  }

  return lines.join("\n");
}
