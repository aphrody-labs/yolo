import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dir, "..");
const vscodeAppDir = resolve(rootDir, "apps/vscode");
const vscodePkgDir = resolve(rootDir, "packages/vscode");

describe("VS Code App & YOLO Runtime Target Suite", () => {
  it("should have apps/vscode properly mapped and linked to packages/vscode", () => {
    expect(existsSync(vscodeAppDir)).toBe(true);
    expect(existsSync(resolve(vscodeAppDir, "package.json"))).toBe(true);
    expect(existsSync(resolve(vscodePkgDir, "package.json"))).toBe(true);

    const appPkg = JSON.parse(readFileSync(resolve(vscodeAppDir, "package.json"), "utf8"));
    expect(appPkg.name).toBe("code-oss-dev");
  });

  it("should execute VS Code core base strings functions natively with Bun", async () => {
    // Dynamic runtime path to prevent tsc static analysis of VSCode tree
    const stringsPath = resolve(vscodePkgDir, "src/vs/base/common/strings.js");
    const strings = (await import(stringsPath)) as any;
    expect(strings.isFalsyOrWhitespace("   ")).toBe(true);
    expect(strings.isFalsyOrWhitespace("aphrody")).toBe(false);
    expect(strings.format("Hello {0} in {1}", "YOLO", "Bun")).toBe("Hello YOLO in Bun");
    expect(strings.equalsIgnoreCase("APHRODY", "aphrody")).toBe(true);
    expect(strings.startsWithIgnoreCase("TypeScript 7", "typescript")).toBe(true);
  });

  it("should parse VS Code TypeScript source files using YOLO Oxc engine", async () => {
    const { parseSync } = await import("oxc-parser");
    const sourceCode = readFileSync(resolve(vscodePkgDir, "src/vs/base/common/strings.ts"), "utf8");
    const parsed = parseSync("strings.ts", sourceCode);

    expect(parsed).toBeDefined();
    expect(parsed.errors.length).toBe(0);
    expect(parsed.program.body.length).toBeGreaterThan(50);
  });

  it("should transform VS Code code using YOLO Oxc transform engine in-memory", async () => {
    const { transform } = await import("oxc-transform");
    const tsCode = "export const getEngine = (): string => 'Aphrody YOLO Bun';";
    const transformed = await transform("engine.ts", tsCode);

    expect(transformed).toBeDefined();
    expect(transformed.code).toContain("Aphrody YOLO Bun");
  });
});
