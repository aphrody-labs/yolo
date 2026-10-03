/**
 * Mass, rule-based renamer for git repositories (zero dependencies, native Bun).
 *
 * - File discovery via `git ls-files -z` (fast, honours .gitignore, skips untracked noise)
 * - Concurrent zero-copy I/O (Bun.file / Bun.write), cheap `includes` prefilter before any regex
 * - Boundary-aware rules: a match must not be glued to an identifier character on its left
 * - Binary files, lockfile-excluded globs and history files (CHANGELOG, LICENSE) are skipped
 * - Dry-run by default; --apply writes, and a JSONL journal (path, hashes, counts) is saved
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface RenameRule {
  readonly from: string;
  readonly to: string;
}

export interface RenameOptions {
  readonly cwd: string;
  readonly rules: readonly RenameRule[];
  readonly apply: boolean;
  readonly paths: boolean;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly concurrency: number;
  readonly journalDir: string;
}

export interface FileChange {
  readonly path: string;
  readonly replacements: number;
  readonly before: string;
  readonly after: string;
}

export interface RenameReport {
  readonly cwd: string;
  readonly scanned: number;
  readonly skippedBinary: number;
  readonly changedFiles: number;
  readonly replacements: number;
  readonly renamedPaths: number;
  readonly applied: boolean;
  readonly elapsedMs: number;
  readonly journal?: string | undefined;
}

export const DEFAULT_EXCLUDES: readonly string[] = [
  "**/CHANGELOG*",
  "**/LICENSE*",
  "**/node_modules/**",
  "**/audits/**",
  "**/.changes/*.md",
];

/** Built-in rule presets. `aphrody` moves every upstream npm scope to @aphrody. */
export const PRESETS: Record<string, readonly RenameRule[]> = {
  aphrody: [{ from: "@tauri-apps/", to: "@aphrody/" }],
};

const IDENT = /[A-Za-z0-9_$-]/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces `rule.from` where it is not preceded by an identifier character. */
export function applyRules(
  input: string,
  rules: readonly RenameRule[],
): { output: string; count: number } {
  let output = input;
  let count = 0;
  for (const rule of rules) {
    if (!output.includes(rule.from)) continue;
    const re = new RegExp(escapeRegExp(rule.from), "g");
    output = output.replace(re, (match, offset: number, whole: string) => {
      const prev = offset > 0 ? whole[offset - 1] : undefined;
      if (prev !== undefined && IDENT.test(prev)) return match;
      count++;
      return rule.to;
    });
  }
  return { output, count };
}

function isBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, 8192);
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true;
  return false;
}

async function listFiles(cwd: string): Promise<string[]> {
  const proc = Bun.spawn(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error(`git ls-files failed in ${cwd}`);
  return out.split("\0").filter(Boolean);
}

async function pool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function renameRepo(options: RenameOptions): Promise<RenameReport> {
  const started = Bun.nanoseconds();
  const globs = options.exclude.map((pattern) => new Bun.Glob(pattern));
  const includes = options.include.map((pattern) => new Bun.Glob(pattern));
  const files = (await listFiles(options.cwd)).filter(
    (f) =>
      !globs.some((g) => g.match(f)) && (includes.length === 0 || includes.some((g) => g.match(f))),
  );
  const needles = options.rules.map((r) => r.from);

  const changes: FileChange[] = [];
  let skippedBinary = 0;

  await pool(files, options.concurrency, async (rel) => {
    const abs = resolve(options.cwd, rel);
    const file = Bun.file(abs);
    if (file.size === 0) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isBinary(bytes)) {
      skippedBinary++;
      return;
    }
    const text = new TextDecoder().decode(bytes);
    if (!needles.some((n) => text.includes(n))) return;
    const { output, count } = applyRules(text, options.rules);
    if (count === 0) return;
    changes.push({
      path: rel,
      replacements: count,
      before: Bun.hash.wyhash(bytes).toString(16),
      after: Bun.hash.wyhash(output).toString(16),
    });
    if (options.apply) await Bun.write(abs, output);
  });

  changes.sort((a, b) => a.path.localeCompare(b.path));

  let renamedPaths = 0;
  if (options.paths) {
    const { renameSync, existsSync } = await import("node:fs");
    // Deepest paths first so parents are renamed after their children.
    const candidates = files
      .map((f) => ({ from: f, to: applyRules(f, options.rules) }))
      .filter((c) => c.to.count > 0)
      .sort((a, b) => b.from.length - a.from.length);
    for (const { from, to } of candidates) {
      const dest = resolve(options.cwd, to.output);
      if (existsSync(dest)) continue;
      renamedPaths++;
      if (options.apply) {
        mkdirSync(dirname(dest), { recursive: true });
        renameSync(resolve(options.cwd, from), dest);
      }
    }
  }

  let journal: string | undefined;
  if (options.apply && changes.length > 0) {
    mkdirSync(options.journalDir, { recursive: true });
    journal = resolve(
      options.journalDir,
      `rename-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
    );
    const lines = changes.map((c) => JSON.stringify(c)).join("\n");
    await Bun.write(journal, `${lines}\n`);
  }

  return {
    cwd: options.cwd,
    scanned: files.length,
    skippedBinary,
    changedFiles: changes.length,
    replacements: changes.reduce((n, c) => n + c.replacements, 0),
    renamedPaths,
    applied: options.apply,
    elapsedMs: (Bun.nanoseconds() - started) / 1e6,
    journal,
  };
}

/** `yolo rename [--preset aphrody] [--from X --to Y] [--apply] [--paths] <dir...>` */
export async function runRenameCommand(args: readonly string[], rootDir: string): Promise<number> {
  const rules: RenameRule[] = [];
  const targets: string[] = [];
  const exclude: string[] = [...DEFAULT_EXCLUDES];
  const include: string[] = [];
  let apply = false;
  let paths = false;
  let from: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const value = (): string => {
      const v = args[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };
    if (arg === "--apply") apply = true;
    else if (arg === "--paths") paths = true;
    else if (arg === "--preset") {
      const name = value();
      const preset = PRESETS[name];
      if (!preset)
        throw new Error(`Unknown preset "${name}" (available: ${Object.keys(PRESETS).join(", ")})`);
      rules.push(...preset);
    } else if (arg === "--from") from = value();
    else if (arg === "--to") {
      if (from === undefined) throw new Error("--to must follow --from");
      rules.push({ from, to: value() });
      from = undefined;
    } else if (arg === "--exclude") exclude.push(value());
    else if (arg === "--include") include.push(value());
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else targets.push(arg);
  }
  if (from !== undefined) throw new Error("--from without --to");
  if (rules.length === 0) rules.push(...(PRESETS.aphrody as readonly RenameRule[]));
  if (targets.length === 0)
    targets.push("packages/tauri", "packages/plugins-workspace", "packages/create-tauri-app");

  const concurrency = Math.max(16, (navigator.hardwareConcurrency || 4) * 8);
  console.log(
    `\x1b[1m[rename]\x1b[0m ${apply ? "APPLY" : "dry-run"} — ${rules.map((r) => `${r.from} → ${r.to}`).join(", ")}`,
  );

  for (const target of targets) {
    const report = await renameRepo({
      cwd: resolve(rootDir, target),
      rules,
      apply,
      paths,
      include,
      exclude,
      concurrency,
      journalDir: resolve(rootDir, ".cache/rename"),
    });
    const rate = Math.round(report.scanned / Math.max(report.elapsedMs / 1000, 1e-6));
    console.log(
      `  ${target}: ${report.changedFiles} files / ${report.replacements} replacements` +
        `${paths ? ` / ${report.renamedPaths} paths` : ""} (scanned ${report.scanned}, binary skipped ${report.skippedBinary}, ` +
        `${report.elapsedMs.toFixed(0)} ms, ${rate} files/s)${report.journal ? `\n    journal: ${report.journal}` : ""}`,
    );
  }
  if (!apply)
    console.log(
      "Dry-run only. Re-run with --apply to write; revert with `git checkout -- .` in each repo.",
    );
  return 0;
}
