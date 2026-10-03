<!-- SPDX-License-Identifier: Apache-2.0 -->
# Consumers

## R2: `@aphrody/agent-browser` engine supervision

Decision D10 in [DECISIONS](DECISIONS.md): the first real consumer of the runtime is
`aphrody/packages/web/agent-browser/src/engine.ts`. The patch
[agent-browser-engine-runtime.patch](agent-browser-engine-runtime.patch) replaces its hand-written
`Bun.spawn` / stdout-endpoint / `/json/version` polling / SIGTERM→SIGKILL code with the runtime's
process service (`Runtime.spawn` with `stdio: "capture"`, `waitForStdoutLine`, `waitForHttp`,
`stopAsync`). The public surface of `engine.ts` (`startEngine`, `Engine`, `withEngine`,
`ensureTestEngine`, `stopAllEngines`, error messages) is unchanged; the engine now runs in its own
process group, so a stop also takes down anything it spawned, and a closed runtime cannot leave it
behind.

### Evidence (2026-10-03, development host, Linux x64)

The patch was applied to the Aphrody working tree, run against the real installed `aphrody-web`
engine, then reverted (the dependency is not wired in Aphrody yet, see below):

- `bun test test/` in `packages/web/agent-browser`: 33 pass, 0 fail, before and after the patch;
- `tsc --noEmit` and `oxlint` on the package: clean;
- no engine process left after the run.

Not covered: Shenron, RG, fut and `aphrody-web-test`, which consume this package and were not run;
macOS and Windows.

### Scope limits (D11)

This retires `engine.ts`'s own supervision code. It does **not** retire the `aphrody-web` (Obscura)
binary or its V8 build: that is R4. `service.ts` also spawns the binary for fetch/scrape/crawl
(`Bun.spawn`, lines under the `iecode-*-owner` claims) and is a later migration.

### Applying it (Aphrody owners)

Aphrody consumes sibling repositories as pinned archives, never as workspace members
(`config/sibling-checkouts.json`), so the wiring is an Aphrody-side step:

1. In yolo: `just runtime-package runtime-install` (verified artifact into `~/.yolo/runtime`) and
   `just runtime-sdk-pack` (SDK archive + provenance JSON in `dist/sdk/`).
2. In Aphrody: copy the archive into `.cache/yolo-packages/`, add
   `"@aphrody/runtime-sdk": "file:../../../.cache/yolo-packages/<archive>"` to the package (and the
   matching entry next to the IECODE archives in the root `package.json`), then install in a tree
   nobody else is testing in (the lockfile changes).
3. Claim `packages/web/agent-browser/{package.json,src/engine.ts}` in `.coord/claims` (the
   `iecode-*-owner` claims cover `service.ts`), `git apply` the patch, run the package tests.
4. Rollback: `just runtime-rollback` for the library, revert the Aphrody commit for the consumer.
