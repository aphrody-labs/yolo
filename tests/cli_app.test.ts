import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspectPackages, parseTsSource } from "../apps/cli/src/index";

const rootDir = resolve(import.meta.dir, "..");
const cliPkgPath = resolve(rootDir, "apps/cli/package.json");
const cliEntryPath = resolve(rootDir, "apps/cli/src/index.ts");

describe("YOLO apps/cli Suite (Zero External Dependencies)", () => {
  it("should have apps/cli package.json with zero external runtime dependencies", () => {
    expect(existsSync(cliPkgPath)).toBe(true);
    const pkg = JSON.parse(readFileSync(cliPkgPath, "utf8"));
    expect(pkg.name).toBe("@aphrody/yolo-cli");
    expect(pkg.dependencies).toEqual({});
  });

  it("should inspect all 5 local fork packages programmatically", () => {
    const statuses = inspectPackages();
    expect(statuses.length).toBe(5);

    const names = statuses.map((s) => s.name).sort();
    expect(names).toEqual(["bun", "obscura", "oxc", "typescript", "vscode"]);

    for (const status of statuses) {
      expect(status.exists).toBe(true);
      expect(existsSync(status.path)).toBe(true);
    }
  });

  it("should parse TypeScript source files programmatically using zero external dependencies", async () => {
    const parsed = await parseTsSource(cliEntryPath);
    expect(parsed).toBeDefined();
    expect(parsed.path).toBe(cliEntryPath);
    expect(parsed.lines).toBeGreaterThan(50);
    expect(parsed.bytes).toBeGreaterThan(1000);
    expect(parsed.exports).toContain("inspectPackages");
    expect(parsed.exports).toContain("parseTsSource");
    expect(parsed.exports).toContain("printHelp");
  });

  it("should execute the CLI binary via Bun.spawn with status, parse, vscode, and docs commands", async () => {
    const procStatus = Bun.spawn(["bun", cliEntryPath, "status"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutStatus = await new Response(procStatus.stdout).text();
    const exitCodeStatus = await procStatus.exited;

    expect(exitCodeStatus).toBe(0);
    expect(stdoutStatus).toContain("=== YOLO Packages Status ===");
    expect(stdoutStatus).toContain("packages/bun");
    expect(stdoutStatus).toContain("packages/vscode");

    const procDocs = Bun.spawn(["bun", cliEntryPath, "docs", "server"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutDocs = await new Response(procDocs.stdout).text();
    const exitCodeDocs = await procDocs.exited;

    expect(exitCodeDocs).toBe(0);
    expect(stdoutDocs).toContain("=== Bun Docs Corpus ===");
    expect(stdoutDocs).toContain("Found");
  });
});
