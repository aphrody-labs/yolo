import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { scanDirectory, renderScanMarkdown, renderScanTerminal } from "../apps/cli/src/scan";

const rootDir = resolve(import.meta.dir, "..");

describe("yolo scan (Native Bun Parallel Recursive Scanner)", () => {
  it("should scan directory and return schema yolo.scan/1 with lines and fingerprint", async () => {
    const report = await scanDirectory(resolve(rootDir, "apps/cli/src"));
    expect(report.schema).toBe("yolo.scan/1");
    expect(report.totalFiles).toBeGreaterThan(5);
    expect(report.totalBytes).toBeGreaterThan(10000);
    expect(report.totalLines).toBeGreaterThan(500);
    expect(report.treeFingerprint).toBeDefined();
    expect(report.treeFingerprint.length).toBeGreaterThan(0);
    expect(report.byExtension.length).toBeGreaterThan(0);
    expect(report.largestFiles.length).toBeGreaterThan(0);
  });

  it("should filter by extension correctly", async () => {
    const report = await scanDirectory(resolve(rootDir, "apps/cli/src"), {
      exts: ["ts"],
    });
    expect(report.totalFiles).toBeGreaterThan(0);
    for (const extStat of report.byExtension) {
      expect(extStat.ext).toBe(".ts");
    }
  });

  it("should render markdown and terminal outputs without errors", async () => {
    const report = await scanDirectory(resolve(rootDir, "apps/cli/src"), {
      maxFiles: 5,
    });
    const md = renderScanMarkdown(report);
    expect(md).toContain("# yolo scan:");
    expect(md).toContain("| Extension |");

    const term = renderScanTerminal(report);
    expect(term).toContain("=== YOLO Recursive Scan ===");
  });
});
