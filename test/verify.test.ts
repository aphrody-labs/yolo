import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GATES,
  NOT_RUN_HEAVY,
  renderList,
  renderMarkdown,
  runGates,
  runVerifyCommand,
  selectChanged,
  spawnRunner,
  summarize,
  validateGraph,
  type Gate,
  type Report,
} from "../apps/cli/src/verify";

const gate = (id: string, needs: string[] = [], surfaces: string[] = ["**"]): Gate => ({
  id,
  title: id,
  command: ["fake", id],
  needs,
  surfaces,
});

describe("runGates", () => {
  it("runs independent gates in parallel: wall time is below the summed time (measured)", async () => {
    const gates = ["a", "b", "c", "d"].map((id) => gate(id));
    const run = async () => {
      await Bun.sleep(60);
      return { exitCode: 0, output: "" };
    };
    const { results, wallMs } = await runGates(gates, run, { parallel: 4, root: "/" });
    const { sumGateMs, speedup } = summarize(results, wallMs);
    expect(results.every((r) => r.status === "pass")).toBe(true);
    expect(sumGateMs).toBeGreaterThanOrEqual(240);
    expect(wallMs).toBeLessThan(sumGateMs * 0.6);
    expect(speedup).toBeGreaterThan(1.5);
    // all four started at about the same moment
    expect(Math.max(...results.map((r) => r.startMs))).toBeLessThan(40);
  });

  it("is serial with parallel 1 and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const run = async () => {
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(10);
      active--;
      return { exitCode: 0, output: "" };
    };
    await runGates(
      ["a", "b", "c", "d", "e"].map((id) => gate(id)),
      run,
      { parallel: 2, root: "/" },
    );
    expect(peak).toBe(2);
  });

  it("starts a gate only after what it needs, and skips dependents of a failure with the reason", async () => {
    const order: string[] = [];
    const run = async (g: Gate) => {
      order.push(`start:${g.id}`);
      await Bun.sleep(5);
      order.push(`end:${g.id}`);
      return { exitCode: g.id === "build" ? 1 : 0, output: g.id === "build" ? "boom" : "" };
    };
    const gates = [gate("build"), gate("test", ["build"]), gate("docs"), gate("deploy", ["test"])];
    const { results } = await runGates(gates, run, { parallel: 8, root: "/" });
    const by = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(by["build"]).toMatchObject({ status: "fail", exitCode: 1, detail: "boom" });
    expect(by["test"]).toMatchObject({
      status: "skipped",
      detail: "dependency build did not pass",
    });
    expect(by["deploy"]).toMatchObject({
      status: "skipped",
      detail: "dependency test did not pass",
    });
    expect(by["docs"]?.status).toBe("pass");
    expect(order).not.toContain("start:test");
    expect(results.map((r) => r.id)).toEqual(["build", "test", "docs", "deploy"]); // input order
  });

  it("honours a precondition by skipping with its reason", async () => {
    const g: Gate = { ...gate("import"), precondition: () => "worktree missing" };
    const { results } = await runGates([g], async () => ({ exitCode: 0, output: "" }), {
      parallel: 1,
      root: "/",
    });
    expect(results[0]).toMatchObject({ status: "skipped", detail: "worktree missing" });
  });
});

describe("validateGraph", () => {
  it("rejects unknown dependencies and cycles", () => {
    expect(() => validateGraph([gate("a", ["zzz"])])).toThrow(/needs zzz/);
    expect(() => validateGraph([gate("a", ["b"]), gate("b", ["a"])])).toThrow(/cycle: a -> b -> a/);
    expect(() => validateGraph(GATES)).not.toThrow();
  });
});

describe("selectChanged", () => {
  it("selects the gates whose surfaces match a changed file", () => {
    const only = (files: string[]) => selectChanged(GATES, files).map((g) => g.id);
    expect(only(["docs/SERVER.md"])).toEqual(["whitespace", "docs"]);
    expect(only(["apps/cli/src/verify.ts"])).toEqual([
      "whitespace",
      "typecheck",
      "lint",
      "fmt-check",
      "test",
    ]);
    expect(only(["crates/yolo-core/src/lib.rs"])).toContain("rust-fmt");
    expect(only(["crates/yolo-core/src/lib.rs"])).toContain("import-check");
    expect(only([])).toEqual([]);
  });
});

describe("reports", () => {
  const report = (over: Partial<Report> = {}): Report => ({
    schema: "yolo.verify/1",
    startedAt: "2026-10-03T00:00:00.000Z",
    root: "/r",
    commit: "0123456789abcdef",
    dirty: true,
    selection: "all",
    parallel: 4,
    wallMs: 100,
    sumGateMs: 250,
    speedup: 2.5,
    ok: false,
    gates: [
      {
        id: "lint",
        title: "lint",
        status: "pass",
        command: ["bun", "run", "lint"],
        exitCode: 0,
        startMs: 0,
        durationMs: 50,
        detail: "",
      },
      {
        id: "test",
        title: "test",
        status: "fail",
        command: ["bun", "test"],
        exitCode: 1,
        startMs: 0,
        durationMs: 200,
        detail: "1 | a|b\nfailed",
      },
      {
        id: "docs",
        title: "docs",
        status: "skipped",
        command: ["mdbook"],
        exitCode: null,
        startMs: 0,
        durationMs: 0,
        detail: "dependency test did not pass",
      },
    ],
    notRun: NOT_RUN_HEAVY,
    ...over,
  });

  it("renders Markdown with the table, the failure output and every gate that was not run", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("# yolo verify: FAIL");
    expect(md).toContain("speedup 2.5x");
    expect(md).toContain("| test | fail | 1 | 0 | 200 |");
    expect(md).toContain("failed");
    expect(md).toContain("- docs: dependency test did not pass");
    expect(md).toContain("- clippy (strict clippy");
    expect(md).toContain("uncommitted changes");
  });

  it("lists the gates as JSON with their graph and surfaces", () => {
    const j = JSON.parse(renderList(GATES, NOT_RUN_HEAVY, true));
    expect(j.schema).toBe("yolo.verify.gates/1");
    expect(j.gates.map((g: { id: string }) => g.id)).toContain("typecheck");
    expect(j.notRun.map((n: { id: string }) => n.id)).toContain("clippy");
  });
});

describe("spawnRunner (real processes)", () => {
  it("reports the exit code and the output tail, and kills on timeout", async () => {
    const run = spawnRunner(process.cwd(), 300);
    const sh = (script: string): Gate => ({ ...gate("x"), command: ["sh", "-c", script] });
    expect(await run(sh("echo ok; exit 0"))).toEqual({ exitCode: 0, output: "ok\n" });
    const failed = await run(sh("echo oops >&2; exit 3"));
    expect(failed.exitCode).toBe(3);
    expect(failed.output).toContain("oops");
    const slow = await run(sh("sleep 5"));
    expect(slow.exitCode).toBeNull();
    expect(slow.output).toContain("timed out after 300 ms");
  });
});

describe("yolo verify command", () => {
  it("writes latest.json and a timestamped copy, prints JSON, and exits 1 when a gate fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "verify-"));
    try {
      let printed = "";
      const gates = [gate("a"), gate("b", ["a"])];
      const run = async (g: Gate) => ({ exitCode: g.id === "a" ? 1 : 0, output: "bad" });
      const code = await runVerifyCommand(["--json"], root, {
        gates,
        run,
        out: (s) => (printed += s),
      });
      const r = JSON.parse(printed) as Report;
      expect(code).toBe(1);
      expect(r.ok).toBe(false);
      expect(r.gates.map((g) => g.status)).toEqual(["fail", "skipped"]);
      expect(JSON.parse(readFileSync(join(root, "var/verify/latest.json"), "utf8")).schema).toBe(
        "yolo.verify/1",
      );
      expect(readdirSync(join(root, "var/verify")).length).toBe(2);
      let again = "";
      expect(await runVerifyCommand(["--last"], root, { out: (s) => (again += s) })).toBe(1);
      expect(again).toContain("# yolo verify: FAIL");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unknown gate names and cycles with exit 2", async () => {
    const root = mkdtempSync(join(tmpdir(), "verify-"));
    try {
      expect(await runVerifyCommand(["--only", "nope"], root, { out: () => {} })).toBe(2);
      const cyc = [gate("a", ["b"]), gate("b", ["a"])];
      expect(await runVerifyCommand([], root, { gates: cyc, out: () => {} })).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
