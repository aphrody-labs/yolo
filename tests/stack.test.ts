import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createProject, loadStack, toIdent } from "../apps/cli/src/create";

const rootDir = resolve(import.meta.dir, "..");
const sandbox = mkdtempSync(join(tmpdir(), "yolo-stack-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

const bunTypes = (file: string): string =>
  readFileSync(join(rootDir, "packages/bun/packages/bun-types", file), "utf8");

describe("stack manifest", () => {
  it("points every template and layer path to files that exist", async () => {
    const stack = await loadStack(rootDir);
    for (const template of Object.values(stack.template)) {
      expect(existsSync(join(rootDir, template.path))).toBe(true);
    }
    for (const layer of Object.values(stack.layer)) {
      for (const path of (layer["paths"] as string[] | undefined) ?? []) {
        expect(existsSync(join(rootDir, path))).toBe(true);
      }
    }
  });

  it("uses only Bun APIs declared by the Bun fork's own types", async () => {
    const stack = await loadStack(rootDir);
    const serve = bunTypes("serve.d.ts");
    const sqlite = bunTypes("sqlite.d.ts");
    const apis = new Set(
      Object.values(stack.layer).flatMap((l) => (l["bun_apis"] as string[] | undefined) ?? []),
    );
    expect(apis).toEqual(new Set(["Bun.serve", "Database", "HTMLBundle"]));
    expect(serve).toContain("function serve<");
    expect(serve).toContain("HTMLBundle");
    expect(sqlite).toContain("export class Database");
  });

  it("pins the toolchain versions of the repository", async () => {
    const stack = await loadStack(rootDir);
    const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
    expect(stack.meta["typescript"]).toBe(pkg.devDependencies.typescript);
    expect(stack.meta["oxlint"]).toBe(pkg.devDependencies.oxlint);
    expect(stack.meta["oxfmt"]).toBe(pkg.devDependencies.oxfmt);
    expect(readFileSync(join(rootDir, "packages/bun/LATEST"), "utf8").trim()).toBe(
      stack.meta["bun"] as string,
    );
  });

  it("only offers framework variants that are in the curated Rust-Bun list", async () => {
    const stack = await loadStack(rootDir);
    const curated = JSON.parse(
      readFileSync(join(rootDir, "stack/awesome.curated.json"), "utf8"),
    ) as {
      github?: string;
    }[];
    const repos = new Set(curated.map((e) => e.github));
    for (const template of Object.values(stack.template)) {
      if (template.curated !== undefined) expect(repos.has(template.curated)).toBe(true);
    }
  });
});

describe("yolo create", () => {
  const options = (name: string, features: string[]) => ({
    rootDir,
    target: join(sandbox, name),
    name,
    features,
    yoloPath: rootDir,
  });

  it("scaffolds the base project with substituted names and no leftover tokens", async () => {
    const files = await createProject(options("demo-app", []));
    expect(files).toContain("src/server.ts");
    expect(files).toContain(".gitignore");
    expect(files).not.toContain("gitignore");
    for (const file of files) {
      const text = readFileSync(join(sandbox, "demo-app", file));
      if (!file.endsWith(".png") && !file.endsWith(".ico") && !file.endsWith(".icns")) {
        expect(text.toString("utf8")).not.toMatch(/__(NAME|IDENT|YOLO)__/);
      }
    }
    const pkg = JSON.parse(readFileSync(join(sandbox, "demo-app/package.json"), "utf8"));
    expect(pkg.name).toBe("demo-app");
    expect(pkg.dependencies["@aphrody/runtime-sdk"]).toBe(`file:${rootDir}/sdk/runtime`);
  });

  it("applies features in order: web replaces home.ts, desktop adds Tauri and icons", async () => {
    const files = await createProject(options("full-app", ["web", "desktop"]));
    expect(readFileSync(join(sandbox, "full-app/src/home.ts"), "utf8")).toContain("index.html");
    expect(files).toContain("src-tauri/Cargo.toml");
    expect(files.some((f) => f.startsWith("src-tauri/icons/"))).toBe(true);
    const cargo = readFileSync(join(sandbox, "full-app/src-tauri/Cargo.toml"), "utf8");
    expect(cargo).toContain('package = "aphrody-tauri"');
    expect(cargo).toContain("full_app_desktop_lib");
    expect(readFileSync(join(sandbox, "full-app/src-tauri/tauri.conf.json"), "utf8")).toContain(
      "dev.aphrody.full_app",
    );
  });

  it("adds the framework dependency with its pinned version", async () => {
    await createProject(options("hono-app", ["hono"]));
    const pkg = JSON.parse(readFileSync(join(sandbox, "hono-app/package.json"), "utf8"));
    expect(pkg.dependencies.hono).toMatch(/^\d+\.\d+\.\d+$/);
    expect(existsSync(join(sandbox, "hono-app/src/alt/hono.ts"))).toBe(true);
  });

  it("refuses unknown features, two frameworks and non-empty targets", async () => {
    await expect(createProject(options("bad-1", ["nope"]))).rejects.toThrow(/Unknown feature/);
    await expect(createProject(options("bad-2", ["hono", "elysia"]))).rejects.toThrow(
      /one framework/,
    );
    await createProject(options("taken", []));
    await expect(createProject(options("taken", []))).rejects.toThrow(/not empty/);
  });

  it("derives a valid Rust identifier from the project name", () => {
    expect(toIdent("My-App.2")).toBe("my_app_2");
    expect(toIdent("2fast")).toBe("app_2fast");
  });
});
