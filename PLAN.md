<!-- SPDX-License-Identifier: Apache-2.0 -->
# Yolo — unified native runtime producer plan

Owner direction: 2026-10-03. Status: approved architecture direction; runtime
implementation and performance claims remain unqualified.

The [Aphrody master plan](../aphrody/PLAN.md) owns the cross-repository architecture.
This plan owns producer deliverables and their gates. Keep one architectural
source of truth rather than maintaining two independent full designs.

## Mission

Build and distribute a precompiled native runtime based on the Bun fork, with
Tauri desktop integration and Obscura headless capabilities. Aphrody consumes
its light SDK and retains product logic. A product edit must eventually avoid
recompiling Bun/JavaScriptCore, Tauri and the browser engine.

Deliver three coordinated surfaces: runtime artifacts per supported target,
a lightweight SDK (TypeScript contracts, versioned C ABI, Rust adapter), and
packaging/compatibility tools using existing owner infrastructure.
A sources import, shared Cargo workspace or standalone binary does not alone
prove this separation. JS packaging is not a claim of full ahead-of-time native
compilation of all application JavaScript.

## Existing integration contracts to preserve

The current Tauri import workflow is documented in [VENDORING](docs/VENDORING.md).
Pinned submodules are source inputs; generated Tauri crates live in `crates/`.
Keep Cargo package prefix `aphrody-`, upstream dependency keys and library/binary
identities, `links`, plugin/permission IDs and platform identifiers compatible.
Versions follow the actual imported crate; do not impose one alpha number on all.

The `vendor` branch owns generated imports, `dev` owns integration changes and
`main` represents the release line. Fork `main` mirrors upstream while fork
`yolo` carries changes. Preserve reproducible import and three-way update behavior.
Do not edit generated history by hand, force-push forks or change branches under
another active task. Consult current tooling before running update commands.

Bun and Obscura may retain their own build graphs/profiles. A unified distribution
does not require merging every workspace. Do not lose unwind behavior needed by
Obscura or assume a Cargo per-package panic override solves a unified executable.

## Native host and SDK

Bun owns application JS execution. Expose native capabilities through documented
modules with errors, cancellation, events and explicit rights. Module names such
as `runtime:desktop` are proposals, not currently supported APIs.

Use a versioned C ABI for external native consumers: opaque validated handles,
explicit buffer ownership/free functions, structure sizes, capability negotiation,
thread rules and callback lifetime. Keep engine-specific Rust/C++ types internal.
A precompiled Rust rlib is not a stable independently versioned application ABI.
Compile selected Tauri plugins into the runtime; do not promise arbitrary Rust
plugins can be loaded without recompilation or an adapter.

Coordinate desktop main-thread requirements, JS context ownership and bounded
native workers. Define backpressure, cancellation and orderly shutdown. Never
unload native code while its callbacks or resources remain live.

## Browser convergence

First integrate Obscura with its existing JS backend. Prototype a JavaScriptCore
backend from actual DOM/runtime requirements, including GC bindings, exceptions,
microtasks, timers, modules, workers, interruption and teardown.
Keep V8 until required consumer parity passes; record unsupported behavior.
Headless pages must not inherit privileged Bun APIs.

System WebViews retain their platform engines. Replacing them all with Obscura
is a separate desktop-browser project, not a prerequisite for consumer build savings.

## Shared services and failure boundaries

Reuse existing owners for network, cookies/sessions, files, configuration, logs,
secrets references and rendering where contracts match. Keep per-origin/session
isolation; platform WebView transport may require a distinct backend.

Convert recoverable errors across the native ABI. Preserve unwind where panic
recovery requires it. JS contexts do not contain native memory corruption;
optional isolated native workers serve explicit trust/fault boundaries.
The default integration uses native capabilities, not shells around external CLIs.

## Build, distribution and upstream

Use existing Workspace/Infra build-factory workflows and supported owner commands.
Produce a small supported set of server, headless and desktop variants rather
than an uncontrolled feature matrix. Identify target, toolchain, source revisions,
ABI, options, hashes and license notices for every artifact.

Cache builds by actual inputs; preserve Cargo/sccache/Bun caches. Separate debug
symbols and development tools. Apply LTO/PGO, deferred initialization and other
optimizations after representative measurements. Keep runtime/application version
compatibility checks and tested rollback in the packaging contract.

Classify fork changes as integration, upstream fix, product capability or measured
optimization. Keep imports mechanical and behavior changes explicit. Test upstream
updates before promoting artifacts. Repositories remain private; package publication
and production activation require their existing owner authorization.

## Delivery sequence

Every implementation gate below is open. Existing Tauri import progress does
not automatically satisfy these new runtime gates.

| Phase | Producer delivery | Gate with Aphrody |
| --- | --- | --- |
| R0 | Minimal versioned SDK/ABI and precompiled artifact | Light consumer calls a capability without engine builds |
| R1 | Bun host native modules | Correct calls, errors, cancellation and cleanup |
| R2 | First shared service | Consumer retires its corresponding heavy dependencies |
| R3 | Desktop adapter | Pilot windows, events, permissions and shutdown |
| R4 | Obscura with current backend | Required navigation, extraction and rendering |
| R5 | Obscura JavaScriptCore prototype | Difficult operations run; gaps are recorded |
| R6 | Required parity and V8 retirement | Required consumers pass on promoted backend |
| R7 | Application migration support | Routine consumer builds depend on the light SDK |
| R8 | Optimization and releases | Reproducible measures, supported targets, packaging and rollback |

R3/R4 can advance independently after the foundation. R5/R6 do not block the
first precompiled-runtime benefits. The first capability and the API names were decided on 2026-10-03,
see [docs/DECISIONS.md](docs/DECISIONS.md); implementation proceeds one vertical slice at a time.

## Evidence and completion

Measure cold/warm/long-running startup, native-call latency, copies, queue depth,
UI time, memory and retained resources. Compare equivalent functionality and
profiles; do not invent percentage savings from architecture alone.

Completion requires lighter consumer builds, explicit ownership and permissions,
correct cancellation/teardown, compatible updates/rollback, precompiled supported
targets, measured improvements and removal of obsolete qualified paths.

This documentation batch changes no runtime implementation or Cargo profile.
[MEMORY.md](MEMORY.md) records the direction; [AGENTS.md](AGENTS.md) governs work.
The earlier [Aphrody Rust scan](docs/APHRODY-RUST-TAURI-OBSCURA-BUN.md) is lexical
navigation only and does not prove effective Cargo profiles or resolved graphs.
