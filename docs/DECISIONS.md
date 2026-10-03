<!-- SPDX-License-Identifier: Apache-2.0 -->
# Runtime decisions

Decisions taken on 2026-10-03 for points that [PLAN.md](../PLAN.md) left open. "Decided" fixes the
choice; "Implemented" says what already exists and is tested; "Pending" is work that follows
mechanically from the decision and is not claimed. None of this qualifies a phase.

## Contract

| # | Decision | Status |
| :--- | :--- | :--- |
| D1 | **ABI freeze.** `yolo_runtime` ABI `1.x` is additive only: existing functions, struct layouts and status codes never change; new functions bump the minor; a breaking change is a new major shipped as a separate library name and negotiated by `yolo_abi_version`. Structures carry `struct_size`. | Implemented (1.0 core, 1.1 process/http, 1.2 output capture) |
| D2 | **Module names.** `runtime:system`, `runtime:process`, `runtime:desktop`, `runtime:browser`. Capability ids are `<domain>.<verb>` (`system.stats`, `bench.compute`, `process.supervise`, `http.probe`). `runtime:desktop` and `runtime:browser` are reserved and throw an explicit error until their variant exists. | Implemented for system/process; reserved for the others |
| D3 | **Control data is JSON, hot paths get dedicated buffers.** Structured control calls (build info, capabilities, results) use JSON; a capability that moves bulk data (frames, bodies) defines its own length-prefixed buffer entry points instead of JSON. | Decided |
| D4 | **Ownership.** Library-owned buffers freed with `yolo_buffer_free`; opaque generation-checked handles; operations and processes are bounded per runtime (`max_operations`), always released, and destroyed with their runtime (workers cancelled and joined, processes stopped). | Implemented |

## Host and variants

| # | Decision | Status |
| :--- | :--- | :--- |
| D5 | **R1 host.** The host is the SDK preload: `bun:ffi` plus `Bun.plugin` virtual modules `runtime:*`. The Bun fork is **not** modified for this: built-in modules inside the fork only come back if a measurement shows the preload cost matters (single-binary embedding belongs to R8). | Implemented |
| D6 | **Three artifact variants, one ABI family.** `server` (this light library), `headless` (adds Obscura, variant file `yolo_runtime_headless`) and `desktop` (adds Tauri, `yolo_runtime_desktop`). The SDK selects the variant by file name; capabilities are discovered with `yolo_runtime_capabilities`, never assumed. | Decided; only `server` exists |
| D7 | **Panic strategy per artifact.** Every variant that crosses the C ABI is built with an unwinding profile (`runtime`, later `runtime-headless`/`runtime-desktop` inheriting it) so panics become `YOLO_PANIC`. Bun and Obscura keep their own build graphs; they are combined at distribution level, never merged into the Tauri workspace. | Implemented for `server` |
| D8 | **Targets.** linux-x64, linux-arm64, macos-x64, macos-arm64, windows-x64 (`sdk/runtime/src/artifact.ts`, `.github/workflows/runtime.yml`). A target counts as built only when its CI job is green and its manifest exists; today only the development host (linux-x64) has been built. | Matrix defined; one target built |
| D9 | **Distribution.** Artifacts are verified (manifest, SHA-256, ABI major, target) before any native load, installed immutably as `<version>-<hash8>` with `current` and `previous` links, and rolled back by swapping them. Installation never activates a product. | Implemented (`just runtime-install`, `runtime-rollback`) |

## Consumers and phases

| # | Decision | Status |
| :--- | :--- | :--- |
| D10 | **First real shared service: process supervision.** `process.supervise` + `http.probe` replace the hand-written spawn / poll `/json/version` / SIGKILL code of `aphrody/packages/web/agent-browser/src/engine.ts` (the R2 consumer, chosen because it is the most shared and its `engine.ts` is outside the active claims). | Service implemented; consumer migration in progress |
| D11 | **What R2 does and does not retire.** R2 retires the consumer's own supervision code and guarantees teardown natively. It does **not** retire the `aphrody-web` (Obscura) binary: that heavy dependency goes away at R4, when the `headless` variant embeds Obscura. R2's gate is therefore "supervision code removed, consumer tests pass, teardown verified", not "Obscura retired". | Decided |
| D12 | **R3 desktop.** Pilot is `crates/yolo-desktop`. `runtime:desktop` is backed by the `desktop` variant (D6); first surface is windows (open, close, events) with permissions enforced natively through Tauri capabilities, remote pages without privileged APIs. Requires the Linux desktop libraries and the build factory. | Decided; not started |
| D13 | **R4–R6 browser.** R4: `headless` variant built from `packages/obscura` with its current V8 backend, first surface `browser.fetch` / `browser.extract`, consumed by agent-browser. R5: a JavaScriptCore backend prototype on an Obscura fork branch behind a Cargo feature, driven by the DOM/GC/microtask/timer/worker/interruption cases of PLAN.md. R6: V8 removed from the promoted profile only when agent-browser, Shenron, RG and fut consumers pass on JSC. | Decided; not started |
| D14 | **Heavy builds.** Anything compiling Tauri, wry, Obscura, V8 or Bun goes through the Aphrody build factory (`config/build-factory.json`, `cargo-serial.sh`); this repository only builds the light `server` variant locally. | Decided |

## Sources, packages and policy

| # | Decision | Status |
| :--- | :--- | :--- |
| D15 | **Vendoring scope is final.** 54 crates; the example apps, benchmark crates, migrate fixtures and `cef-rollback` are never vendored. Third-party crates named `tauri-*` (winit forks, winres, icns, winrt-notification) stay registry dependencies; they are forked only if a fix requires it. | Implemented |
| D16 | **Branches.** `dev` is the integration branch; `main` receives `dev` once tests and the vendor check pass; `vendor` is generated only. Fork `main` mirrors upstream, fork `yolo` is ours. History carries no assistant attribution (rewritten on 2026-10-03, backups kept as `backup/*-pre-rewrite-2026-10-03`). | Implemented |
| D17 | **Naming and publication.** Crates keep the `aphrody-` prefix and upstream versions. Nothing is published to crates.io or npm: repositories are private and publication needs owner authorization. `just publish-dry` is the only publication command run. | Decided |
| D18 | **Licenses.** `deny.toml` allows permissive licenses plus `LGPL-2.0-or-later` (a transitive dependency, dynamically linked); no GPL entries are allowed. | Implemented |
| D19 | **CI.** GitHub workflows cover the Bun checks, the Rust checks and the runtime artifact matrix. `import-check` stays local because the submodules use SSH URLs. | Implemented |
