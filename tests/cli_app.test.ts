import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateBunCatalog,
  inspectPackages,
  parseTsSource,
  readWorkspaceCargo,
} from "../apps/cli/src/index";

const rootDir = resolve(import.meta.dir, "..");
const cliPkgPath = resolve(rootDir, "apps/cli/package.json");
const cliEntryPath = resolve(rootDir, "apps/cli/src/index.ts");
const generatedCatalogPath = resolve(rootDir, "apps/web/src/generated/bun-catalog.ts");

describe("YOLO apps/cli Suite (Zero External Dependencies, 100% Native Bun)", () => {
  it("should have apps/cli package.json with zero external runtime dependencies", async () => {
    expect(existsSync(cliPkgPath)).toBe(true);
    const pkg = await Bun.file(cliPkgPath).json();
    expect(pkg.name).toBe("@aphrody/yolo-cli");
    expect(pkg.dependencies).toEqual({});
  });

  it("should inspect local fork packages programmatically via Bun file checks", async () => {
    const statuses = await inspectPackages();
    expect(statuses.length).toBe(7);

    const names = statuses.map((s) => s.name).sort();
    expect(names).toEqual([
      "bun",
      "create-tauri-app",
      "obscura",
      "plugins-workspace",
      "tao",
      "tauri",
      "wry",
    ]);

    for (const status of statuses) {
      expect(status.exists).toBe(true);
      expect(existsSync(status.path)).toBe(true);
    }
  });

  it("should parse TypeScript source files programmatically using wyhash and zero external dependencies", async () => {
    const parsed = await parseTsSource(cliEntryPath);
    expect(parsed).toBeDefined();
    expect(parsed.path).toBe(cliEntryPath);
    expect(parsed.lines).toBeGreaterThan(50);
    expect(parsed.bytes).toBeGreaterThan(1000);
    expect(parsed.checksum).toBeDefined();
    expect(parsed.checksum.length).toBeGreaterThan(0);
    expect(parsed.exports).toContain("inspectPackages");
    expect(parsed.exports).toContain("parseTsSource");
    expect(parsed.exports).toContain("readWorkspaceCargo");
    expect(parsed.exports).toContain("generateBunCatalog");
    expect(parsed.exports).toContain("printHelp");
  });

  it("should read root Cargo.toml using native Bun.TOML parser", async () => {
    const cargo = await readWorkspaceCargo();
    expect(cargo).not.toBeNull();
    expect(cargo?.resolver).toBe("3");
    expect(cargo?.members).toContain("crates/*");
  });

  it("should autonomously scan upstream Bun and generate capability catalog", async () => {
    const report = await generateBunCatalog();
    expect(report).toBeDefined();
    expect(report.domains.length).toBe(7);
    expect(report.totalDocFilesIndexed).toBeGreaterThan(100);
    expect(report.totalTypeFilesIndexed).toBeGreaterThan(10);
    expect(existsSync(generatedCatalogPath)).toBe(true);

    const generatedContent = await Bun.file(generatedCatalogPath).text();
    expect(generatedContent).toContain("MONOREPO_BUN_CATALOG");
    expect(generatedContent).toContain("web_api");
    expect(generatedContent).toContain("server");
    expect(generatedContent).toContain("react");
    expect(generatedContent).toContain("css");
    expect(generatedContent).toContain("img");
    expect(generatedContent).toContain("json");
    expect(generatedContent).toContain("markdown");
  });

  it("should execute the CLI binary via Bun.spawn with status, parse, bench, docs, and generate commands", async () => {
    const procStatus = Bun.spawn(["bun", cliEntryPath, "status"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutStatus = await new Response(procStatus.stdout).text();
    const exitCodeStatus = await procStatus.exited;

    expect(exitCodeStatus).toBe(0);
    expect(stdoutStatus).toContain("=== YOLO Monorepo Status");
    expect(stdoutStatus).toContain("packages/bun");
    expect(stdoutStatus).toContain("packages/obscura");

    const procBench = Bun.spawn(["bun", cliEntryPath, "bench"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutBench = await new Response(procBench.stdout).text();
    const exitCodeBench = await procBench.exited;
    expect(exitCodeBench).toBe(0);
    expect(stdoutBench).toContain("Bun.hash.wyhash");
    expect(stdoutBench).toContain("Bun.stringWidth");

    const procDocs = Bun.spawn(["bun", cliEntryPath, "docs", "server"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutDocs = await new Response(procDocs.stdout).text();
    const exitCodeDocs = await procDocs.exited;

    expect(exitCodeDocs).toBe(0);
    expect(stdoutDocs).toContain("=== Bun Docs Corpus");
    expect(stdoutDocs).toContain("Found");

    const procGen = Bun.spawn(["bun", cliEntryPath, "generate"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutGen = await new Response(procGen.stdout).text();
    const exitCodeGen = await procGen.exited;

    expect(exitCodeGen).toBe(0);
    expect(stdoutGen).toContain("=== Autonomous Bun Upstream Generator ===");
    expect(stdoutGen).toContain("[SUCCESS]");
  });
});

describe("YOLO vendoring", () => {
  it("keeps vendor.lock consistent with crates/ and vendor.toml", async () => {
    const lock = (await Bun.file(resolve(rootDir, "vendor.lock")).json()) as {
      sources: { name: string; sha: string }[];
      crates: { name: string; package: string; dir: string; version: string }[];
    };
    const config = Bun.TOML.parse(await Bun.file(resolve(rootDir, "vendor.toml")).text()) as {
      prefix: string;
      source: { name: string }[];
    };
    expect(lock.sources.map((s) => s.name).sort()).toEqual(config.source.map((s) => s.name).sort());
    for (const crate of lock.crates) {
      expect(crate.package.startsWith(config.prefix)).toBe(true);
      const manifest = Bun.TOML.parse(
        await Bun.file(resolve(rootDir, crate.dir, "Cargo.toml")).text(),
      ) as {
        package: { name: string };
        lib?: { name?: string };
      };
      expect(manifest.package.name).toBe(crate.package);
      // library names stay unchanged so `use tauri::...` keeps compiling
      if (manifest.lib?.name !== undefined) {
        expect(manifest.lib.name).not.toContain(config.prefix.replace("-", "_"));
      }
    }
  });

  it("reports vendored sources against the submodule HEADs", async () => {
    const { readVendorStatus } = await import("../apps/cli/src/index");
    const status = await readVendorStatus();
    expect(status?.crates).toBeGreaterThan(40);
    expect(status?.sources.length).toBe(5);
  });
});

describe("YOLO rename engine", () => {
  it("renames npm scopes only on identifier boundaries", async () => {
    const { applyRules, PRESETS } = await import("../apps/cli/src/rename");
    const input = `import "@tauri-apps/api"; "x@tauri-apps/api"; github.com/tauri-apps/tauri`;
    const { output, count } = applyRules(input, PRESETS.aphrody!);
    expect(count).toBe(1);
    expect(output).toBe(`import "@aphrody/api"; "x@tauri-apps/api"; github.com/tauri-apps/tauri`);
  });
});
