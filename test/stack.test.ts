import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createProject, loadStack, toIdent } from "../apps/cli/src/create";

const rootDir = resolve(import.meta.dir, "..");
// Needs the Bun fork submodule, which the CI checkout cannot fetch (private).
const haveBunFork = existsSync(join(rootDir, "packages/bun/LATEST"));
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

  it.skipIf(!haveBunFork)("uses only Bun APIs declared by the Bun fork's own types", async () => {
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

  it.skipIf(!haveBunFork)("pins the toolchain versions of the repository", async () => {
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

describe("distribution", () => {
  it("keeps VERSION, the stack manifest and the installers consistent", async () => {
    const version = readFileSync(join(rootDir, "VERSION"), "utf8").trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const installer = readFileSync(join(rootDir, "install.sh"), "utf8");
    for (const variable of [
      "YOLO_VERSION",
      "YOLO_HOME",
      "YOLO_REPO",
      "YOLO_RELEASE_DIR",
      "GITHUB_TOKEN",
    ]) {
      expect(installer).toContain(variable);
    }
    expect(installer).toContain("SHA256SUMS");
    expect(readFileSync(join(rootDir, "install.ps1"), "utf8")).toContain("Get-FileHash");
    // every supported target of the SDK has a CI job in the release workflow
    const { SUPPORTED_TARGETS } = await import("../sdk/runtime/src/artifact");
    const workflow = readFileSync(join(rootDir, ".github/workflows/release.yml"), "utf8");
    for (const target of Object.values(SUPPORTED_TARGETS)) expect(workflow).toContain(target);
  });

  it("installs from a local release directory into an isolated home (when a release was built)", async () => {
    const version = readFileSync(join(rootDir, "VERSION"), "utf8").trim();
    const release = join(rootDir, "dist/release", version);
    if (!existsSync(join(release, "SHA256SUMS"))) return; // built by `bun run scripts/release.ts`
    const home = join(sandbox, "install-home");
    const proc = Bun.spawn(["sh", join(rootDir, "install.sh")], {
      env: {
        ...process.env,
        HOME: home,
        YOLO_RELEASE_DIR: release,
        YOLO_NO_MODIFY_PATH: "1",
        YOLO_NO_CRATES: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(output).toContain(`yolo ${version}`);
    const doctor = Bun.spawn([join(home, ".yolo/bin/yolo"), "doctor"], {
      env: { ...process.env, HOME: home, YOLO_HOME: join(home, ".yolo") },
      stdout: "pipe",
    });
    expect(await new Response(doctor.stdout).text()).toContain("verified and loadable");
    expect(await doctor.exited).toBe(0);
  });
});
