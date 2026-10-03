/**
 * `yolo scan`: Fast, parallel, recursive repository and directory scanner.
 * Powered 100% by native Bun: Bun.Glob, Bun.file, Bun.nanoseconds, and Bun.hash.wyhash.
 * Eliminates ad-hoc shell one-liners (find | xargs wc -l, python -c, bun -e).
 *
 * Agent-First: Outputs structured JSON (schema `yolo.scan/1`) or Markdown tables with --json / --md.
 */

import { existsSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { limiter } from "./host-space";

export interface ExtensionStat {
  readonly ext: string;
  readonly count: number;
  readonly bytes: number;
  readonly lines: number;
}

export interface FileEntry {
  readonly path: string;
  readonly bytes: number;
  readonly lines: number;
  readonly hash: string;
}

export interface ScanReport {
  readonly schema: "yolo.scan/1";
  readonly target: string;
  readonly scannedAt: string;
  readonly elapsedMs: number;
  readonly totalFiles: number;
  readonly totalBytes: number;
  readonly totalLines: number;
  readonly treeFingerprint: string;
  readonly byExtension: readonly ExtensionStat[];
  readonly largestFiles: readonly FileEntry[];
}

export interface ScanOptions {
  readonly target?: string | undefined;
  readonly exts?: readonly string[] | undefined;
  readonly exclude?: readonly string[] | undefined;
  readonly parallel?: number | undefined;
  readonly maxFiles?: number | undefined;
}

const DEFAULT_EXCLUDES = [".git", "node_modules", "target", "dist", ".cache", ".cargo", "var"];

/**
 * Recursively scans a directory in parallel, computing line counts, byte sizes,
 * per-extension metrics, and a composite tree wyhash fingerprint.
 */
export async function scanDirectory(
  targetDir: string,
  options: ScanOptions = {},
): Promise<ScanReport> {
  const t0 = Bun.nanoseconds();
  const absTarget = resolve(targetDir);
  if (!existsSync(absTarget)) {
    throw new Error(`Target path does not exist: ${absTarget}`);
  }

  const extsFilter = options.exts?.map((e) => (e.startsWith(".") ? e : `.${e}`).toLowerCase());
  const excludes = new Set(options.exclude ?? DEFAULT_EXCLUDES);
  const parallel = options.parallel ?? 16;
  const limit = limiter(parallel);

  const glob = new Bun.Glob("**/*");
  const candidates: string[] = [];

  for (const relPath of glob.scanSync({ cwd: absTarget, onlyFiles: true, dot: false })) {
    const parts = relPath.split("/");
    if (parts.some((p) => excludes.has(p))) continue;

    if (extsFilter && extsFilter.length > 0) {
      const ext = extname(relPath).toLowerCase();
      if (!extsFilter.includes(ext)) continue;
    }

    candidates.push(relPath);
    if (options.maxFiles && candidates.length >= options.maxFiles) break;
  }

  // Sort candidates for deterministic tree fingerprint
  candidates.sort();

  const entries: FileEntry[] = [];
  const extMap = new Map<string, { count: number; bytes: number; lines: number }>();

  const scanFile = async (relPath: string): Promise<FileEntry | null> => {
    try {
      const fullPath = resolve(absTarget, relPath);
      const file = Bun.file(fullPath);
      const text = await file.text();
      const bytes = file.size;
      const lines = text.length === 0 ? 0 : text.split("\n").length;
      const hash = Bun.hash.wyhash(text).toString(16);

      return { path: relPath, bytes, lines, hash };
    } catch {
      return null;
    }
  };

  const tasks = candidates.map((rel) =>
    limit(async () => {
      const entry = await scanFile(rel);
      if (entry) {
        entries.push(entry);
        const ext = extname(entry.path).toLowerCase() || "(no-ext)";
        const current = extMap.get(ext) ?? { count: 0, bytes: 0, lines: 0 };
        extMap.set(ext, {
          count: current.count + 1,
          bytes: current.bytes + entry.bytes,
          lines: current.lines + entry.lines,
        });
      }
    }),
  );

  await Promise.all(tasks);

  let totalBytes = 0;
  let totalLines = 0;
  for (const e of entries) {
    totalBytes += e.bytes;
    totalLines += e.lines;
  }

  // Calculate composite wyhash fingerprint of sorted (path:hash) entries
  const manifestPayload = entries
    .map((e) => `${e.path}:${e.hash}`)
    .sort()
    .join("\n");
  const treeFingerprint = Bun.hash.wyhash(manifestPayload).toString(16);

  const byExtension: ExtensionStat[] = Array.from(extMap.entries())
    .map(([ext, s]) => ({ ext, count: s.count, bytes: s.bytes, lines: s.lines }))
    .sort((a, b) => b.bytes - a.bytes);

  const largestFiles = [...entries].sort((a, b) => b.bytes - a.bytes).slice(0, 10);

  const elapsedMs = Number(((Bun.nanoseconds() - t0) / 1_000_000).toFixed(2));

  return {
    schema: "yolo.scan/1",
    target: absTarget,
    scannedAt: new Date().toISOString(),
    elapsedMs,
    totalFiles: entries.length,
    totalBytes,
    totalLines,
    treeFingerprint,
    byExtension,
    largestFiles,
  };
}

export function renderScanMarkdown(report: ScanReport): string {
  const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(2) + " MB";
  const kb = (bytes: number): string => (bytes / 1024).toFixed(1) + " KB";

  const lines = [
    `# yolo scan: ${relative(process.cwd(), report.target) || "."}`,
    "",
    `- **Files:** ${report.totalFiles.toLocaleString()}`,
    `- **Total Size:** ${mb(report.totalBytes)} (${report.totalBytes.toLocaleString()} bytes)`,
    `- **Total Lines:** ${report.totalLines.toLocaleString()}`,
    `- **Tree Fingerprint:** \`wyhash:0x${report.treeFingerprint}\``,
    `- **Elapsed:** ${report.elapsedMs} ms`,
    "",
    "## Breakdown by Extension",
    "",
    "| Extension | Files | Lines | Size |",
    "| :--- | ---: | ---: | ---: |",
  ];

  for (const s of report.byExtension) {
    lines.push(
      `| \`${s.ext}\` | ${s.count.toLocaleString()} | ${s.lines.toLocaleString()} | ${kb(s.bytes)} |`,
    );
  }

  lines.push(
    "",
    "## Top 10 Largest Files",
    "",
    "| File | Lines | Size | Checksum |",
    "| :--- | ---: | ---: | :--- |",
  );

  for (const f of report.largestFiles) {
    lines.push(
      `| \`${f.path}\` | ${f.lines.toLocaleString()} | ${kb(f.bytes)} | \`${f.hash.slice(0, 8)}\` |`,
    );
  }

  return lines.join("\n");
}

export function renderScanTerminal(report: ScanReport): string {
  const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(2) + " MB";
  const kb = (bytes: number): string => (bytes / 1024).toFixed(1) + " KB";

  const out = [
    `\x1b[1m\x1b[36m=== YOLO Recursive Scan ===\x1b[0m`,
    `  Target:      ${report.target}`,
    `  Files:       ${report.totalFiles.toLocaleString()}`,
    `  Total Size:  ${mb(report.totalBytes)} (${report.totalBytes.toLocaleString()} bytes)`,
    `  Total Lines: ${report.totalLines.toLocaleString()}`,
    `  Fingerprint: wyhash:0x${report.treeFingerprint}`,
    `  Speed:       ${report.elapsedMs} ms`,
    `\n  \x1b[1mBy Extension:\x1b[0m`,
  ];

  for (const s of report.byExtension.slice(0, 8)) {
    out.push(
      `    \x1b[33m${s.ext.padEnd(12)}\x1b[0m ${String(s.count).padStart(5)} files  ${String(s.lines).padStart(7)} lines  ${kb(s.bytes).padStart(10)}`,
    );
  }

  out.push(`\n  \x1b[1mLargest Files:\x1b[0m`);
  for (const f of report.largestFiles.slice(0, 5)) {
    out.push(`    - ${f.path} (${kb(f.bytes)}, ${f.lines} lines)`);
  }

  return out.join("\n");
}

export async function runScanCommand(
  args: readonly string[],
  root: string,
  out: (s: string) => void = console.log,
): Promise<number> {
  const has = (flag: string): boolean => args.includes(flag);
  const getOpt = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  let target = root;
  for (const arg of args) {
    if (!arg.startsWith("-")) {
      target = resolve(process.cwd(), arg);
      break;
    }
  }

  const extsOpt = getOpt("--exts");
  const exts = extsOpt ? extsOpt.split(",").map((s) => s.trim()) : undefined;
  const excludeOpt = getOpt("--exclude");
  const exclude = excludeOpt ? excludeOpt.split(",").map((s) => s.trim()) : undefined;
  const parallelOpt = getOpt("--parallel");
  const parallel = parallelOpt ? parseInt(parallelOpt, 10) : undefined;

  try {
    const report = await scanDirectory(target, { exts, exclude, parallel });
    if (has("--json")) {
      out(JSON.stringify(report, null, 2));
    } else if (has("--md")) {
      out(renderScanMarkdown(report));
    } else {
      out(renderScanTerminal(report));
    }
    return 0;
  } catch (err) {
    console.error(`yolo scan error: ${(err as Error).message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runScanCommand(process.argv.slice(2), process.cwd());
}
