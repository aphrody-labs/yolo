#!/usr/bin/env bun
/**
 * Publishes the npm packages of the Aphrody forks (packages/*) and apps.
 * Dry-run by default; pass --publish to really publish (needs NPM_TOKEN or `npm login`).
 * Only packages named `@aphrody/*` that are not `private` are published, so upstream
 * names (`@tauri-apps/*`, `bun-types`) must be renamed in the fork before release.
 */
import { Glob } from "bun";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const publish = Bun.argv.includes("--publish");
const SCOPE = "@aphrody/";

interface Manifest {
  name?: string;
  version?: string;
  private?: boolean;
}

const results: { name: string; version: string; status: string }[] = [];

for await (const rel of new Glob("{apps,packages}/**/package.json").scan({ cwd: root })) {
  if (rel.includes("node_modules/")) continue;
  const manifest = await Bun.file(resolve(root, rel))
    .json()
    .then((json) => json as Manifest)
    .catch(() => ({}) as Manifest);
  if (!manifest.name?.startsWith(SCOPE) || manifest.private === true) continue;

  const dir = resolve(root, rel, "..");
  const args = ["publish", "--access", "public", ...(publish ? [] : ["--dry-run"])];
  const proc = Bun.spawn(["bun", ...args], { cwd: dir, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  results.push({
    name: manifest.name,
    version: manifest.version ?? "?",
    status: code === 0 ? (publish ? "published" : "dry-run ok") : `failed (${code})`,
  });
}

if (results.length === 0) {
  console.log(`No publishable ${SCOPE}* packages found (all private or not yet renamed).`);
} else {
  console.table(results);
}
process.exit(results.some((r) => r.status.startsWith("failed")) ? 1 : 0);
