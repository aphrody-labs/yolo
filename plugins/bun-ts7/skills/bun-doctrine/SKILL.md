---
name: bun-doctrine
description: This skill should be used when JavaScript or TypeScript is written, reviewed or run in a project containing bun.lock, bunfig.toml or engines.bun, or when the user asks for "Bun conventions", "Bun-only rules", "bun instead of npm or node", "Bun.serve idle timeout", "bun test pitfalls" or "Bun fork contribution rules". Supplies the Bun-only doctrine - command and API substitutions, conventions, server and test gotchas, Bun fork rules and autonomous-execution rules. For doc lookups use bun-docs-router; to run a Node-to-Bun migration use the n2b skill or the node2bun agent.
version: 0.1.0
---

# Bun doctrine

Treat Bun as the single JavaScript and TypeScript toolchain. The project's own `CLAUDE.md`, `AGENTS.md` and manifests override this doctrine where they conflict. This plugin ships no blocking hook: the doctrine below is followed by judgment, not enforced by denying tool calls.

## 1. Establish the baseline

1. Detect the project: `bun.lock` (text lockfile, default since Bun 1.2), `bun.lockb`, `bunfig.toml`, or `packageManager: "bun@…"` / `engines.bun` in `package.json`.
2. Read the versions in use instead of assuming them: `bun --version`, `node_modules/bun-types/package.json`, `node_modules/typescript/package.json`.
3. Detect a Bun fork checkout: `src/js/node/` together with `src/runtime/bin_entry/` means the working directory is Bun's own source. Apply section 8.
4. Look APIs up through the `bun-docs-router` skill (or the `bun-docs-researcher` agent) instead of recalling them. Bun APIs and flags move between minor releases.

## 2. Core rule: Bun instead of Node tooling

| Instead of | Use |
| --- | --- |
| `node file.js`, `ts-node` | `bun file.ts` (TypeScript and JSX run with no configuration) |
| `npm install`, `yarn`, `pnpm install` | `bun install` (`--frozen-lockfile` in CI) |
| `npm run x`, `yarn x` | `bun run x` |
| `npx pkg` | `bunx pkg` |
| `jest`, `vitest` | `bun test` with `bun:test` |
| `webpack`, `esbuild` | `bun build` or `Bun.build` |
| `vite` for frontends | HTML imports served by `Bun.serve` |
| `dotenv` | nothing: Bun loads `.env` files automatically |
| `express`, `node:http` servers | `Bun.serve` (routes, WebSocket, TLS) |
| `ws` | built-in `WebSocket`, and `websocket` handlers in `Bun.serve` |
| `better-sqlite3` | `bun:sqlite` |
| `pg`, `postgres.js` | `Bun.sql` |
| `ioredis` | `Bun.redis` |
| `fs.readFile`, `fs.writeFile` | `Bun.file(path).text()`, `Bun.write` |
| `child_process`, `execa` | `Bun.spawn`, `Bun.$` |
| `rimraf`, `cross-env` | Bun Shell (cross-platform builtins) |
| hashing packages | `Bun.password`, `Bun.hash`, `Bun.CryptoHasher` |

Directory operations (`readdir`, `mkdir`) stay on `node:fs`: Bun's `node:fs` is the recommended tool there. Code samples for the main substitutions are in `references/api-substitutions.md`.

## 3. Conventions

1. Use ES module `import`; do not `require()` Node built-ins.
2. Import Node built-ins with the `node:` prefix (`node:fs`, not `fs`).
3. Use `#!/usr/bin/env bun` as the shebang of executable scripts.
4. Use `import.meta.dir` and `import.meta.path` instead of `__dirname` and `__filename`.
5. Declare `"engines": { "bun": ">=<floor>" }` in `package.json` (Aphrody projects use `>=1.4.2`).
6. Read environment variables through `process.env`, `Bun.env` or `import.meta.env` (aliases of one object). Type them by merging into `declare module "bun" { interface Env { … } }`.
7. In monorepos use `workspaces`, the `workspace:*` protocol and `catalog:` references for shared versions.

## 4. Commands and flags

1. Put Bun flags immediately after `bun`: `bun --watch run dev`. A trailing flag (`bun run dev --watch`) is passed to the script.
2. Choose the reload mode deliberately: `--watch` restarts the process; `--hot` re-evaluates modules and keeps `globalThis` (and a running `Bun.serve`).
3. Force Bun for CLIs whose shebang says `node` with `bun run --bun <cli>` (or `[run] bun = true` in `bunfig.toml`).
4. Run a script across a monorepo with `bun run --filter '<pattern>' <script>`.
5. Resolution order for `bun <name>`: `package.json` script, source file, project binary, then (with `bun run`) system command.
6. Bun transpiles but does not type-check: run `tsc --noEmit` separately (see the `typescript7-bun` skill).

## 5. Server and runtime gotchas

Verified against the Bun docs; details and citations are in `references/server-gotchas.md`.

1. `Bun.serve` closes connections idle for 10 seconds (`idleTimeout`, maximum 255, `0` disables). For Server-Sent Events and other long streams call `server.timeout(req, 0)` on that request.
2. `Bun.serve` runs in development mode by default. Set `NODE_ENV=production` or `development: false` when deploying; otherwise an uncaught error returns a page containing source code and file paths. `bun run --production` does not turn it off.
3. Use `port: 0` in tests. Routing, WebSocket, fetch, streams, SQLite and environment-file gotchas are in the reference file.

## 6. Testing doctrine

1. Import from `bun:test`. Files match `*.test.*`, `*_test.*`, `*.spec.*`, `*_spec.*`. The default timeout is 5000 ms (`--timeout`, or a third argument to `test`).
2. Tests share one process and one global by default. Clean global state in `afterEach`; use `--parallel` for per-file isolation and `test.concurrent` or `--concurrent` inside a file.
3. `bun test` sets `NODE_ENV=test` unless it is already set (environment or `.env`) and runs in UTC unless `TZ` is set.
4. Mock modules with `mock.module()` and load the mocks through `--preload` (or `[test] preload` in `bunfig.toml`) so the original module's side effects never run.
5. An unhandled error or rejection outside a test makes the run exit with code 1 even when no test failed, and the affected file's tests do not run.
6. Type-level assertions (`expectTypeOf`) are no-ops at runtime: verify them with `bunx tsc --noEmit`.
7. With `CLAUDECODE=1` (or `AGENT=1`) the runner prints only failure details.

## 7. Where Node stays legitimate

1. Keep a Node API when its Bun equivalent is `partial` or `missing` for the part actually used. Check `bun_node_equivalent` (its `compat` field) or the `runtime/nodejs-compat` page first.
2. Keep Node for tools that cannot run under Bun, and run them with `bun run --bun` only after confirming they work.
3. Reach native code through `bun:ffi` or Node-API. `--no-addons` refuses `process.dlopen()` and `bun:ffi` `cc()`, `--no-ffi-cc` refuses `cc()` only, and neither refuses `bun:ffi` `dlopen()`, `linkSymbols()` or `CFunction()`. For Rust libraries use the `rust-bun` skill of the `aphrody` plugin.

## 8. Bun fork checkout (`packages/bun` or a Bun source tree)

The fork is Bun itself, written in Rust and C++ on JavaScriptCore. Its `src/js/node/` modules implement Node compatibility and use Node APIs on purpose: Node-to-Bun migration tools target application code, not this tree.

1. Build and test with `bun bd` and `bun bd test <file>`. Plain `bun test` does not include the change; its one exception is the `bun-types` type tests for `.d.ts` edits.
2. Add the test to the existing test file for the code under change, keep it deterministic, and read `REVIEW.md` before a non-obvious change.

Full contribution rules and the fork's internal skills are in `references/fork-contribution.md`; architecture, branch topology and upstream sync are in the `bun-upstream` skill.

## 9. Autonomous execution

1. Decide and act on reversible choices (naming, choosing between two sound designs, next step, refactor scope). Record the decision in the commit body or the report.
2. Ask once, with short options and the recommendation first, only when production state is ambiguous or an action is irreversible on shared state and was not requested: force-push, publishing, deleting data without a verified copy, `n2b --migrate` (it removes rival lockfiles).
3. Inspect `git status --short` first. Files not created in the current task belong to someone else: never stage, revert or clean them; stage only the task's own paths.
4. Run the repository's own gates (`bun test`, `tsc --noEmit`, lint, build). A task is not done until real command output shows it. Report each deliverable as `FAIT`, `INCOMPLET` or `NON_FAIT` with commands and exit codes.
5. Delegate Node-to-Bun migration runs to the `node2bun` agent of this plugin (it loads the `n2b` skill of the `aphrody` plugin): baseline scan first, `--fix` on explicit scopes only, never on the repository root.
6. Use Conventional Commits, keep secrets out of files and output, and never force-push a default branch.

## Additional resources

### Reference files

- **`references/api-substitutions.md`** - code for the main Node-to-Bun substitutions (server, files, SQLite, shell, spawn, fetch)
- **`references/server-gotchas.md`** - timeouts, development mode, routing, WebSocket, fetch, streams, SQLite, environment files, with doc slugs
- **`references/fork-contribution.md`** - build, test and review rules for the Bun fork, and its internal skills

### Related skills and agents

- `bun-docs-router` - version-matched documentation lookup
- `bun-upstream` - fork architecture, branch topology and upstream sync
- `node2bun` agent - Node-to-Bun migration pipeline
- `typescript7-bun` - TypeScript 7 and tsconfig for Bun
- `bun-docs-researcher` agent - read-only documentation research that keeps doc dumps out of the main context
