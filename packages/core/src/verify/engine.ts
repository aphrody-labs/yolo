/**
 * `yolo verify`: the repository's own gates, run as a dependency graph in parallel, measured, and reported as
 * JSON (schema `yolo.verify/1`) or Markdown, so an agent can read the evidence instead of scraping logs.
 *
 *   yolo verify [--only a,b] [--changed] [--parallel N] [--timeout SECS] [--json|--md] [--out FILE]
 *   yolo verify --list [--json|--md]      the gates, their commands, dependencies and file surfaces
 *   yolo verify --last [--json|--md]      the previous report (var/verify/latest.json)
 *
 * Exit 0: every selected gate passed. 1: one failed (or was skipped because a dependency failed). 2: usage.
 * A gate that was not run is never silent: it is listed with the reason (`skipped`, or `notRun` for the heavy
 * checks that belong to the build factory). Zero dependencies.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { limiter } from "../sys/limiter";

export interface Gate {
  readonly id: string;
  readonly title: string;
  /** argv, run from the repository root */
  readonly command: readonly string[];
  /** gates that must pass first; if one fails this gate is skipped */
  readonly needs?: readonly string[];
  /** globs of repository files this gate covers (`--changed` selects a gate when one of them changed) */
  readonly surfaces: readonly string[];
  /** returns the reason to skip, or null when the gate can run */
  readonly precondition?: (root: string) => string | null;
}

export interface NotRun {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
}

const TS = ["**/*.ts", "**/*.tsx", "tsconfig.json", "package.json", "bun.lock"];

export const GATES: readonly Gate[] = [
  {
    id: "whitespace",
    title: "no whitespace errors in the diff",
    command: ["git", "diff", "--check"],
    surfaces: ["**"],
  },
  {
    id: "typecheck",
    title: "TypeScript 7 (tsc --noEmit)",
    command: ["bun", "x", "tsc", "--noEmit"],
    surfaces: TS,
  },
  { id: "lint", title: "oxlint", command: ["bun", "--bun", "run", "lint"], surfaces: TS },
  {
    id: "fmt-check",
    title: "oxfmt --check",
    command: ["bun", "--bun", "run", "fmt:check"],
    surfaces: TS,
  },
  {
    id: "test",
    title: "Bun tests (test/)",
    command: ["bun", "test", "--timeout", "30000", "test/"],
    surfaces: [...TS, "templates/**", "packages/**", "scripts/**"],
  },
  {
    id: "rust-fmt",
    title: "rustfmt --check",
    command: ["cargo", "fmt", "--all", "--check"],
    surfaces: ["**/*.rs", "Cargo.toml", "rustfmt.toml"],
  },
  {
    id: "docs",
    title: "mdBook build",
    command: ["mdbook", "build", "docs"],
    surfaces: ["docs/**", "*.md"],
  },
  {
    id: "import-check",
    title: "vendored crates equal a fresh import of the pinned submodules",
    command: ["bun", "run", "apps/cli/src/index.ts", "import", "--check", "--out", ".cache/vendor"],
    surfaces: ["vendor.toml", "vendor.lock", "crates/**", "vendor"],
    precondition: (root) =>
      existsSync(join(root, ".cache/vendor"))
        ? null
        : "the vendor worktree is missing (just vendor-worktree)",
  },
  {
    id: "python-lint",
    title: "ruff check",
    command: ["ruff", "check", "."],
    surfaces: ["**/*.py", "pyproject.toml"],
    precondition: () => (Bun.which("ruff") ? null : "ruff is not installed on PATH"),
  },
  {
    id: "python-test",
    title: "Python pytest (packages/python)",
    command: ["uv", "run", "--directory", "packages/python", "pytest"],
    surfaces: ["packages/python/**", "crates/yolo-pyo3/**"],
    precondition: (root) =>
      existsSync(join(root, "packages/python/.venv")) && Bun.which("uv")
        ? null
        : "Python venv or uv is missing in packages/python",
  },
];

/** Checks this command never runs locally: CLAUDE.md sends them to the build factory (`yolo ship`). */
export const NOT_RUN_HEAVY: readonly NotRun[] = [
  {
    id: "clippy",
    title: "strict clippy on yolo-core and yolo-desktop",
    reason: "heavy: compiles Tauri; runs through yolo ship",
  },
  {
    id: "test-crates",
    title: "cargo nextest of the workspace",
    reason: "heavy: runs through yolo ship",
  },
  {
    id: "check-workspace",
    title: "cargo check --workspace",
    reason: "heavy: runs through yolo ship",
  },
  { id: "deny", title: "cargo deny", reason: "network advisory data; runs through yolo ship" },
  {
    id: "runtime-test",
    title: "native runtime build and tests",
    reason: "heavy: runs through yolo ship",
  },
];

export type Status = "pass" | "fail" | "skipped";

export interface GateResult {
  readonly id: string;
  readonly title: string;
  readonly status: Status;
  readonly command: readonly string[];
  readonly exitCode: number | null;
  /** start offset from the beginning of the run, and duration, in milliseconds */
  readonly startMs: number;
  readonly durationMs: number;
  /** why a gate was skipped; the tail of the combined output for a failed one */
  readonly detail: string;
}

export interface Report {
  readonly schema: "yolo.verify/1";
  readonly startedAt: string;
  readonly root: string;
  readonly commit: string;
  readonly dirty: boolean;
  readonly selection: "all" | "only" | "changed";
  readonly parallel: number;
  /** wall-clock time of the whole run, the sum of the gates' own durations, and their ratio */
  readonly wallMs: number;
  readonly sumGateMs: number;
  readonly speedup: number;
  readonly ok: boolean;
  readonly gates: readonly GateResult[];
  readonly notRun: readonly NotRun[];
}

export interface Outcome {
  readonly exitCode: number | null;
  readonly output: string;
}
export type Runner = (gate: Gate) => Promise<Outcome>;

/** The gates selected by `--changed`: those with a surface glob that matches a changed file. */
export function selectChanged(gates: readonly Gate[], changed: readonly string[]): Gate[] {
  return gates.filter((g) => g.surfaces.some((s) => changed.some((f) => new Bun.Glob(s).match(f))));
}

/** Check that `needs` refer to selected gates and that the graph has no cycle; throws with the reason. */
export function validateGraph(gates: readonly Gate[]): void {
  const ids = new Set(gates.map((g) => g.id));
  for (const g of gates)
    for (const n of g.needs ?? [])
      if (!ids.has(n)) throw new Error(`gate ${g.id} needs ${n}, which is not selected`);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) throw new Error(`dependency cycle: ${[...path, id].join(" -> ")}`);
    state.set(id, 1);
    for (const n of gates.find((g) => g.id === id)?.needs ?? []) visit(n, [...path, id]);
    state.set(id, 2);
  };
  for (const g of gates) visit(g.id, []);
}

/**
 * Run the graph: a gate starts as soon as everything it needs has passed, at most `parallel` run at once, and a
 * gate whose dependency did not pass is skipped with that reason. Results keep the order of `gates`.
 */
export async function runGates(
  gates: readonly Gate[],
  run: Runner,
  options: { parallel: number; root: string; now?: () => number },
): Promise<{ results: GateResult[]; wallMs: number }> {
  validateGraph(gates);
  const now = options.now ?? ((): number => performance.now());
  const t0 = now();
  const gate = limiter(options.parallel);
  const done = new Map<string, Promise<GateResult>>();

  const start = (g: Gate): Promise<GateResult> => {
    const existing = done.get(g.id);
    if (existing !== undefined) return existing;
    const p = (async (): Promise<GateResult> => {
      const deps = await Promise.all(
        (g.needs ?? []).map((n) => start(gates.find((x) => x.id === n) as Gate)),
      );
      const base = { id: g.id, title: g.title, command: g.command };
      const bad = deps.find((d) => d.status !== "pass");
      if (bad !== undefined)
        return {
          ...base,
          status: "skipped",
          exitCode: null,
          startMs: now() - t0,
          durationMs: 0,
          detail: `dependency ${bad.id} did not pass`,
        };
      const why = g.precondition?.(options.root) ?? null;
      if (why !== null)
        return {
          ...base,
          status: "skipped",
          exitCode: null,
          startMs: now() - t0,
          durationMs: 0,
          detail: why,
        };
      return gate(async () => {
        const startMs = now() - t0;
        const outcome = await run(g);
        const durationMs = now() - t0 - startMs;
        const pass = outcome.exitCode === 0;
        return {
          ...base,
          status: pass ? "pass" : "fail",
          exitCode: outcome.exitCode,
          startMs: Math.round(startMs),
          durationMs: Math.round(durationMs),
          detail: pass ? "" : outcome.output,
        };
      });
    })();
    done.set(g.id, p);
    return p;
  };
  const results = await Promise.all(gates.map(start));
  return { results, wallMs: Math.round(now() - t0) };
}

export function summarize(
  results: readonly GateResult[],
  wallMs: number,
): { sumGateMs: number; speedup: number; ok: boolean } {
  const sumGateMs = results.reduce((n, r) => n + r.durationMs, 0);
  return {
    sumGateMs,
    speedup: wallMs > 0 ? Math.round((sumGateMs / wallMs) * 100) / 100 : 1,
    ok: results.every((r) => r.status === "pass"),
  };
}

const cell = (s: string): string => s.replaceAll("|", "\\|").replaceAll("\n", " ");

export function renderMarkdown(r: Report): string {
  const lines = [
    `# yolo verify: ${r.ok ? "PASS" : "FAIL"}`,
    "",
    `- commit \`${r.commit.slice(0, 12)}\`${r.dirty ? " (working tree has uncommitted changes)" : ""}, ${r.selection} gates, ${r.parallel} in parallel`,
    `- wall ${r.wallMs} ms, gates ${r.sumGateMs} ms summed, speedup ${r.speedup}x`,
    "",
    "| gate | status | exit | start ms | ms | command |",
    "| :-- | :-- | --: | --: | --: | :-- |",
    ...r.gates.map(
      (g) =>
        `| ${g.id} | ${g.status} | ${g.exitCode ?? "-"} | ${g.startMs} | ${g.durationMs} | \`${cell(g.command.join(" "))}\` |`,
    ),
  ];
  for (const g of r.gates.filter((x) => x.detail !== "")) {
    lines.push(
      "",
      `## ${g.id}: ${g.status}`,
      "",
      g.status === "skipped" ? g.detail : "```text\n" + g.detail.trimEnd() + "\n```",
    );
  }
  lines.push("", "## Not run", "");
  const skipped = r.gates
    .filter((g) => g.status === "skipped")
    .map((g) => `- ${g.id}: ${g.detail}`);
  const rest = r.notRun.map((n) => `- ${n.id} (${n.title}): ${n.reason}`);
  lines.push(...(skipped.length + rest.length === 0 ? ["- nothing"] : [...skipped, ...rest]));
  return lines.join("\n") + "\n";
}

export function renderList(
  gates: readonly Gate[],
  notRun: readonly NotRun[],
  json: boolean,
): string {
  if (json)
    return JSON.stringify(
      {
        schema: "yolo.verify.gates/1",
        gates: gates.map((g) => ({
          id: g.id,
          title: g.title,
          command: g.command,
          needs: g.needs ?? [],
          surfaces: g.surfaces,
        })),
        notRun,
      },
      null,
      2,
    );
  return [
    "| gate | command | needs |",
    "| :-- | :-- | :-- |",
    ...gates.map(
      (g) =>
        `| ${g.id} | \`${cell(g.command.join(" "))}\` | ${(g.needs ?? []).join(", ") || "-"} |`,
    ),
    "",
    ...notRun.map((n) => `- not run locally: ${n.id}: ${n.reason}`),
  ].join("\n");
}

/** Spawn a gate with a timeout; the output kept is the last 4 KiB of stdout and stderr together. */
export function spawnRunner(root: string, timeoutMs: number): Runner {
  return async (gate) => {
    // own process group, so a timeout kills the gate's children too instead of leaving them holding the pipes
    const proc = Bun.spawn([...gate.command], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-proc.pid, "SIGKILL");
      } catch {
        proc.kill("SIGKILL");
      }
    }, timeoutMs);
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    clearTimeout(timer);
    const output = `${out}${err}`.slice(-4096);
    return timedOut
      ? { exitCode: null, output: `timed out after ${timeoutMs} ms\n${output}` }
      : { exitCode: code, output };
  };
}

const git = (root: string, ...args: string[]): string =>
  spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();

/** Paths changed in the working tree (staged, unstaged, untracked) relative to HEAD. */
export function changedFiles(root: string): string[] {
  return git(root, "status", "--porcelain", "-uall")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^.* -> /, ""));
}

export const reportDir = (root: string): string => join(root, "var/verify");

export async function runVerifyCommand(
  args: readonly string[],
  root: string,
  deps: { gates?: readonly Gate[]; run?: Runner; out?: (s: string) => void; cpus?: number } = {},
): Promise<number> {
  const out = deps.out ?? ((s: string): void => console.log(s));
  const flag = (n: string): string | undefined => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (n: string): boolean => args.includes(n);
  const json = has("--json");
  const catalog = deps.gates ?? GATES;

  if (has("--list")) {
    out(renderList(catalog, NOT_RUN_HEAVY, json));
    return 0;
  }
  if (has("--last")) {
    const file = join(reportDir(root), "latest.json");
    if (!existsSync(file)) {
      console.error("no previous report (var/verify/latest.json)");
      return 2;
    }
    const last = JSON.parse(readFileSync(file, "utf8")) as Report;
    out(json ? JSON.stringify(last, null, 2) : renderMarkdown(last));
    return last.ok ? 0 : 1;
  }

  let selected = [...catalog];
  let selection: Report["selection"] = "all";
  const only = flag("--only");
  if (only !== undefined) {
    const want = only.split(",").filter(Boolean);
    const unknown = want.filter((w) => !catalog.some((g) => g.id === w));
    if (unknown.length > 0) {
      console.error(`unknown gate(s): ${unknown.join(", ")} (see yolo verify --list)`);
      return 2;
    }
    selected = catalog.filter((g) => want.includes(g.id));
    selection = "only";
  } else if (has("--changed")) {
    selected = selectChanged(catalog, changedFiles(root));
    selection = "changed";
  }
  const parallel = Math.max(
    1,
    Number(flag("--parallel") ?? deps.cpus ?? navigator.hardwareConcurrency ?? 4),
  );
  const timeoutMs = Math.max(1, Number(flag("--timeout") ?? 900)) * 1000;
  const startedAt = new Date().toISOString();

  let outcome: Awaited<ReturnType<typeof runGates>>;
  try {
    outcome = await runGates(selected, deps.run ?? spawnRunner(root, timeoutMs), {
      parallel,
      root,
    });
  } catch (e) {
    console.error(`yolo verify: ${(e as Error).message}`);
    return 2;
  }
  const sum = summarize(outcome.results, outcome.wallMs);
  const report: Report = {
    schema: "yolo.verify/1",
    startedAt,
    root,
    commit: git(root, "rev-parse", "HEAD"),
    dirty: git(root, "status", "--porcelain") !== "",
    selection,
    parallel,
    wallMs: outcome.wallMs,
    ...sum,
    gates: outcome.results,
    notRun: NOT_RUN_HEAVY,
  };
  const text = json ? JSON.stringify(report, null, 2) : renderMarkdown(report);
  const dir = reportDir(root);
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(report, null, 2) + "\n";
  writeFileSync(join(dir, "latest.json"), body);
  writeFileSync(join(dir, `${startedAt.replaceAll(/[:.]/g, "-")}.json`), body);
  const file = flag("--out");
  if (file !== undefined) writeFileSync(file, text + (text.endsWith("\n") ? "" : "\n"));
  out(text);
  return report.ok ? 0 : 1;
}
