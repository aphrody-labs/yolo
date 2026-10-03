#!/usr/bin/env bun
// SessionStart hook: inject a compact Bun-only doctrine when the session starts in a Bun project.
// Informational only: it always exits 0 and never blocks anything.
// Set BUN_TS7_CONTEXT=off to silence it.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MAX_PARENTS = 5;

type PackageJson = { packageManager?: unknown; engines?: { bun?: unknown }; version?: unknown };

function readPackageJson(path: string): PackageJson | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

function isBunRoot(dir: string): boolean {
  if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bunfig.toml"))) {
    return true;
  }
  const pkg = readPackageJson(join(dir, "package.json"));
  return Boolean(pkg && (String(pkg.packageManager ?? "").startsWith("bun@") || pkg.engines?.bun));
}

function findBunRoot(start: string): string | undefined {
  let dir = start;
  for (let depth = 0; depth <= MAX_PARENTS; depth++) {
    if (isBunRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function installedVersion(root: string, name: string): string | undefined {
  const version = readPackageJson(join(root, "node_modules", name, "package.json"))?.version;
  return typeof version === "string" ? version : undefined;
}

// The hook command runs from the plugin directory (so Bun never loads the project's bunfig.toml or .env),
// hence the project directory comes from the hook input, then CLAUDE_PROJECT_DIR.
async function readCwd(): Promise<string> {
  const fallback = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  if (process.stdin.isTTY) return fallback;
  try {
    const input = JSON.parse(await Bun.stdin.text()) as { cwd?: unknown };
    return typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : fallback;
  } catch {
    return fallback;
  }
}

async function main(): Promise<void> {
  if (process.env["BUN_TS7_CONTEXT"] === "off") return;

  const root = findBunRoot(await readCwd());
  if (root === undefined) return;

  const typescript = installedVersion(root, "typescript") ?? "not installed";
  const bunTypes = installedVersion(root, "bun-types") ?? "not installed";
  const isBunFork = existsSync(join(root, "src", "js", "node")) && existsSync(join(root, "src", "runtime", "bin_entry"));

  const lines = [
    `[bun-ts7] Bun project at ${root} (bun ${Bun.version}, typescript ${typescript}, bun-types ${bunTypes}).`,
    "Doctrine: Bun-only. Use bun, bunx, bun run, bun test, bun build and bun install; do not use npm, pnpm, yarn, npx, ts-node, jest, vitest, webpack, esbuild, dotenv or express for what Bun covers.",
    "- Bun flags go right after `bun`: `bun --watch run dev`, not `bun run dev --watch`.",
    "- Prefer Bun.file/Bun.write, Bun.serve (routes, WebSocket), bun:sqlite, Bun.sql, Bun.$, Bun.spawn and bun:test. Bun loads .env files by itself.",
    "- Bun.serve closes connections idle for 10 s: call server.timeout(req, 0) for SSE and other long streams. It runs in development mode by default: set NODE_ENV=production or development: false when deploying.",
    '- TypeScript 6 and later (including 7) need "types": ["bun"] in tsconfig. Use `tsc` (native compiler since 7.0 RC); the `tsgo` command is for other builds.',
    "- Look Bun APIs up in version-matched docs (skill bun-docs-router, agent bun-docs-researcher). Never load the whole Bun docs corpus (about 1.95 MB).",
    "- Reversible choices: decide and act. Irreversible or shared-production actions (force-push, publish, deleting data, `n2b --migrate`): ask once. Report FAIT / INCOMPLET / NON_FAIT with real command output.",
  ];

  if (isBunFork) {
    lines.push(
      "Bun fork checkout detected: build and test with `bun bd` / `bun bd test <file>` (plain `bun test` is only for bun-types type tests); add tests to the existing test file with `port: 0` and `tempDir`; read REVIEW.md before non-obvious changes. See skill bun-doctrine, references/fork-contribution.md.",
    );
  }

  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
    }),
  );
}

try {
  await main();
} catch {
  // Never block a session over an informational hook.
}
