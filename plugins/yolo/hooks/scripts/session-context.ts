#!/usr/bin/env bun
// Auto-generated session context for Bun & TypeScript 7.0.2
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function findProjectRoot(start: string): string {
  let dir = start;
  for (let depth = 0; depth <= 5; depth++) {
    if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const root = findProjectRoot(process.cwd());
const lines = [
  "[yolo-unified] Bun runtime " + Bun.version + " in " + root + " (TypeScript 7.0.2 Corsa compiler active)",
  "Doctrine: NHITL (Non-Human-In-The-Loop) - Never wait for human gating, enforce native technical gates.",
  "- Bun-first: Bun.file, Bun.write, Bun.serve, Bun.spawn, bun:sqlite, Bun.sql. No obsolete Node wrappers.",
  "- TypeScript 7.0+: Native Go Corsa compiler. Strict types: [bun] in compilerOptions.",
  "- Subagents: Autonomously dispatch disjoint file sweeps without polling.",
];

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: lines.join("\n")
  }
}));
