/**
 * Monorepo root, checkout detection, and YOLO home path resolution.
 * Where the CLI and core libraries live.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Replaced at compile time (`--define YOLO_VERSION='"x.y.z"'`). */
declare const YOLO_VERSION: string | undefined;

export function isCompiled(): boolean {
  return import.meta.dir.includes("$bunfs") || import.meta.dir.includes("~BUN");
}

export function findRepoRoot(start: string = import.meta.dir): string {
  const fromEnv = process.env["YOLO_HOME"];
  if (fromEnv !== undefined && fromEnv !== "") return resolve(fromEnv);
  if (isCompiled()) return dirname(dirname(process.execPath));

  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "vendor.toml")) && existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(import.meta.dir, "../../../..");
}

export function yoloHome(): string {
  return findRepoRoot();
}

export function yoloVersion(): string {
  if (typeof YOLO_VERSION !== "undefined" && YOLO_VERSION !== "") return YOLO_VERSION;
  const file = join(yoloHome(), "VERSION");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : "0.0.0-dev";
}

/**
 * The yolo checkout that contains `start` (or one of its parents): the directory holding `vendor.toml` and the CLI
 * sources. The installed executable hands source-tree commands (`ship`, `import`, `status`...) to it.
 */
export function findCheckout(start: string = process.cwd()): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "vendor.toml")) && existsSync(join(dir, "apps/cli/src/index.ts"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
