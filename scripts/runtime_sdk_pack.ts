#!/usr/bin/env bun
/**
 * Producer-owned archive of the TypeScript SDK, for consumers that do not join the yolo workspace
 * (Aphrody consumes pinned archives, never cross-repository workspace members).
 *
 *   bun run scripts/runtime_sdk_pack.ts [destination]     (default: dist/sdk)
 *
 * Writes `aphrody-runtime-sdk-<version>-<hash8>.tgz` plus a `.json` provenance record (yolo
 * revision, SHA-256) and prints the archive path. Source files only: no library, no secrets.
 */
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const sdk = resolve(root, "sdk/runtime");
const destination = resolve(root, Bun.argv[2] ?? "dist/sdk");
mkdirSync(destination, { recursive: true });

const staging = resolve(destination, ".pack");
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

const pack = Bun.spawn(["bun", "pm", "pack", "--destination", staging], {
  cwd: sdk,
  stdout: "pipe",
  stderr: "pipe",
});
if ((await pack.exited) !== 0) {
  console.error(await new Response(pack.stderr).text());
  process.exit(1);
}
const produced = readdirSync(staging).find((f) => f.endsWith(".tgz"));
if (produced === undefined) throw new Error("bun pm pack produced no archive");

const bytes = new Uint8Array(await Bun.file(resolve(staging, produced)).arrayBuffer());
const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const version = (await Bun.file(resolve(sdk, "package.json")).json()).version as string;
const name = `aphrody-runtime-sdk-${version}-${sha256.slice(0, 8)}.tgz`;
renameSync(resolve(staging, produced), resolve(destination, name));
rmSync(staging, { recursive: true, force: true });

const git = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root });
await Bun.write(
  resolve(destination, `${name}.json`),
  `${JSON.stringify(
    {
      name: "@aphrody/runtime-sdk",
      version,
      archive: name,
      sha256,
      bytes: bytes.byteLength,
      yoloRevision: git.stdout.toString().trim(),
    },
    null,
    2,
  )}\n`,
);
console.log(resolve(destination, name));
