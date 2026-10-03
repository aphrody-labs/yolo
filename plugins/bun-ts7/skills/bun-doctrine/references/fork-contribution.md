# Contributing to the Bun fork

Applies when the working directory is a Bun source checkout (`src/js/node/` and `src/runtime/bin_entry/` exist), for example `packages/bun` in the Gemini workbench (branch `google`, commit `49c076eb` when this was written). The fork's own `CLAUDE.md` / `AGENTS.md` (identical, ~17.6 KB) is authoritative; this file summarizes it. Re-read the original before relying on a detail.

Architecture, crate suffixes, packages, vendored libraries, branch topology and upstream synchronization are in the `bun-upstream` skill (`references/fork-architecture.md`); they are not repeated here.

## Build and run

- `bun bd` builds the debug binary at `./build/debug/bun-debug`. Do not set a timeout on it.
- `bun bd test <file>` runs a test with the debug build; `bun bd <command>` runs any command with it. Build scripts (`bun run build`, `bun run build:release`, `bun run build:local`) accept trailing arguments that run the freshly built executable; output is suppressed unless the build fails.
- Never use plain `bun test <file>` or `bun <file>` for a change in native code: it does not contain the change.
- Exception: edits to `packages/bun-types/**/*.d.ts` need no build. Run `bun test test/integration/bun-types/bun-types.test.ts` with the system Bun.
- Cross-platform check for platform-gated Rust: `bun run rust:check-all` (`#[cfg(...)]` code is not type-checked unless that target is built).
- Debug logging: `BUN_DEBUG_QUIET_LOGS=1` silences it; `BUN_DEBUG_<SCOPE>=1` enables one scope. JSC exception verification: `BUN_JSC_validateExceptionChecks=1 BUN_JSC_dumpSimulatedThrows=1 bun bd <command>`.

## Tests

- Add the test to the existing file for the code under change (fetch bug: `test/js/web/fetch/fetch.test.ts`; `Bun.serve` bug: `test/js/bun/http/serve.test.ts`). Do not create a new file by default.
- Directories: `test/js/bun/` (Bun APIs), `test/js/node/` (Node compat), `test/js/web/` (Web APIs), `test/cli/` (CLI), `test/bundler/` (use `itBundled`), `test/integration/`, `test/napi/`, `test/v8/`.
- `test/regression/issue/<number>.test.ts` is only for a true regression (worked in an earlier release) with a real GitHub issue number.
- Single-file tests spawn with `bunExe()` and `-e`; multi-file tests use `tempDir` from `harness` plus `Bun.spawn`. Read stdout and stderr with `proc.exited` in one `Promise.all`; assert stdout before the exit code. Prefer `normalizeBunSnapshot` with inline snapshots.
- Always `port: 0`. Never `tmpdirSync` or `fs.mkdtempSync` (use `tempDir`). Never contact the public internet (use `VerdaccioRegistry` and a local `Bun.serve({ port: 0 })`).
- No flaky waits: poll with a deadline or await the event; never `setTimeout`/`sleep` for a condition. Budget about 1 s per test and 10 s per file; use `test.concurrent` for independent spawn-based tests. Leak tests branch their RSS threshold on `isASAN` / `isDebug`.
- Never write a test that only asserts the absence of "panic" or "uncaught exception" in output: it can never fail in CI.
- A new test is valid only if it **fails** with `USE_SYSTEM_BUN=1 bun test <file>` and **passes** with `bun bd test <file>`.

## Code and review rules

- Follow neighboring code style. Prefer RAII (`Drop`); values in arenas do not run `Drop` on reset, so release owning types explicitly first.
- A paragraph-long comment justifying a workaround means the code is wrong. Keep a comment only when the next reader would otherwise need several tool calls to learn the fact.
- Be honest in commits, PRs and messages: never overstate what works. Push only after `bun bd test <file>` passes.
- The conservative stack scanner is never the explanation for a GC bug by itself. Find the real retainer (`WriteBarrier`, `Strong`, `protect()`, missing `deref`, pending activity, closure). Claim the scanner only with both a heap snapshot (`require("bun:jsc").generateHeapSnapshotForDebugging()`) showing no incoming edge or root, and a debugger session showing the stack word.
- `REVIEW.md` (26 KB) sections: tests reviewers reject, native-code memory safety (the most-blocked category), correctness (the bug class, not the bug), error handling, code style and idioms, architecture and layering, security.
- `.claude/docs/landing-prs.md` (25 KB) sections: Node/Web compat, API design, Performance, Cross-platform, Dependencies and vendoring, Docs/types/comments, PR process. Read the one that matches the work.

## Fork-internal skills (discovered automatically under `packages/bun/`)

`implementing-jsc-classes-cpp`, `implementing-jsc-classes-rust`, `javascriptcore-garbage-collector`, `rust-system-calls`, `slowest-tests`, `writing-bundler-tests`, `writing-dev-server-tests`, and `packages/bun:verify` (drive the debug binary end to end). They are not copied into this plugin.
