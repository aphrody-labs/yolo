#!/usr/bin/env bun
/**
 * Builds the release assets of one target into `dist/release/<version>/`:
 *
 *   yolo-<version>-<target>.tar.gz   standalone `yolo` executable (bun build --compile), verified runtime
 *                                    artifact, SDK, stack templates, desktop icons
 *   yolo-<version>-crates.tar.gz     Rust sources of the aphrody-* crates for the desktop scaffold
 *   install.sh, install.ps1          the one-command installers
 *   SHA256SUMS, release.json         integrity and provenance
 *
 * It never starts Cargo: package the runtime first (`just runtime-package`). In CI every OS runs
 * this natively, so each target gets its own executable and library.
 *
 *   bun run scripts/release.ts [--out dist/release]
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { hostTarget, verifyArtifact } from "../sdk/runtime/src/artifact";

const root = resolve(import.meta.dir, "..");
const outIndex = Bun.argv.indexOf("--out");
const outRoot = resolve(root, outIndex > 0 ? (Bun.argv[outIndex + 1] as string) : "dist/release");
const version = readFileSync(join(root, "VERSION"), "utf8").trim();
const target = hostTarget();
const windows = target.includes("windows");
const dir = join(outRoot, version);
const stage = join(outRoot, `.stage-${target}`);

const sha256 = (path: string): string =>
  new Bun.CryptoHasher("sha256").update(new Uint8Array(readFileSync(path))).digest("hex");

async function run(argv: string[], cwd = root): Promise<string> {
  const proc = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${argv.join(" ")} failed:\n${err || out}`);
  return out.trim();
}

const artifactDir = join(root, "dist/runtime", target);
if (!existsSync(join(artifactDir, "manifest.json"))) {
  throw new Error(`No packaged runtime for ${target}: run \`just runtime-package\` first`);
}
const manifest = verifyArtifact(artifactDir);

rmSync(stage, { recursive: true, force: true });
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(stage, "bin"), { recursive: true });
mkdirSync(dir, { recursive: true });

// 1. standalone executable
const exe = join(stage, "bin", windows ? "yolo.exe" : "yolo");
await run([
  "bun",
  "build",
  "--compile",
  "--define",
  `YOLO_VERSION=${JSON.stringify(version)}`,
  "apps/cli/src/index.ts",
  "--outfile",
  exe,
]);

// 2. data next to it: runtime artifact, SDK, stack, desktop icons
cpSync(artifactDir, join(stage, "artifact"), { recursive: true });
cpSync(join(root, "sdk/runtime"), join(stage, "sdk/runtime"), {
  recursive: true,
  filter: (src) => !src.includes("node_modules"),
});
cpSync(join(root, "stack"), join(stage, "stack"), {
  recursive: true,
  filter: (src) => !src.endsWith("awesome-audit.json"),
});
cpSync(join(root, "crates/yolo-desktop/icons"), join(stage, "crates/yolo-desktop/icons"), {
  recursive: true,
});
writeFileSync(join(stage, "VERSION"), `${version}\n`);
cpSync(join(root, "LICENSE"), join(stage, "LICENSE"));

const archive = `yolo-${version}-${target}.tar.gz`;
await run(["tar", "-czf", join(dir, archive), "-C", stage, "."]);

// 3. Rust sources for the desktop scaffold (target independent)
const crates = `yolo-${version}-crates.tar.gz`;
const crateStage = join(outRoot, ".stage-crates");
rmSync(crateStage, { recursive: true, force: true });
mkdirSync(crateStage, { recursive: true });
for (const name of readdirSync(join(root, "crates"))) {
  if (!name.startsWith("aphrody-")) continue; // yolo-* crates inherit the workspace manifest
  cpSync(join(root, "crates", name), join(crateStage, "crates", name), {
    recursive: true,
    filter: (src) => !/(^|[\\/])(target|node_modules)([\\/]|$)/.test(src),
  });
}
await run(["tar", "-czf", join(dir, crates), "-C", crateStage, "."]);

// 4. installers, checksums, provenance
for (const script of ["install.sh", "install.ps1"]) cpSync(join(root, script), join(dir, script));
const files = readdirSync(dir)
  .filter((f) => f !== "SHA256SUMS" && f !== "release.json")
  .sort();
writeFileSync(
  join(dir, "SHA256SUMS"),
  `${files.map((f) => `${sha256(join(dir, f))}  ${f}`).join("\n")}\n`,
);
const commit = await run(["git", "rev-parse", "HEAD"]).catch(() => "unknown");
writeFileSync(
  join(dir, "release.json"),
  `${JSON.stringify(
    {
      name: "yolo",
      version,
      target,
      commit,
      runtime: { version: manifest.version, abi: manifest.abi, toolchain: manifest.toolchain },
      assets: files,
      bun: Bun.version,
    },
    null,
    2,
  )}\n`,
);
rmSync(stage, { recursive: true, force: true });
rmSync(crateStage, { recursive: true, force: true });
console.log(`Release ${version} (${target}) -> ${dir}\n  ${files.join("\n  ")}`);
