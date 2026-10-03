/**
 * Where the CLI lives. From a checkout (`bun run cli ...`) the home is the repository root; the
 * standalone executable (`bun build --compile`, installed by `install.sh`) lives in
 * `<home>/bin/yolo` and finds its data (templates, SDK, runtime artifacts) in `<home>`.
 * `$YOLO_HOME` overrides both.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Replaced at compile time (`--define YOLO_VERSION='"x.y.z"'`). */
declare const YOLO_VERSION: string | undefined;

export function isCompiled(): boolean {
  return import.meta.dir.includes("$bunfs") || import.meta.dir.includes("~BUN");
}

export function yoloHome(): string {
  const fromEnv = process.env["YOLO_HOME"];
  if (fromEnv !== undefined && fromEnv !== "") return resolve(fromEnv);
  if (isCompiled()) return dirname(dirname(process.execPath));
  return resolve(import.meta.dir, "../../..");
}

export function yoloVersion(): string {
  if (typeof YOLO_VERSION !== "undefined" && YOLO_VERSION !== "") return YOLO_VERSION;
  const file = join(yoloHome(), "VERSION");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : "0.0.0-dev";
}
