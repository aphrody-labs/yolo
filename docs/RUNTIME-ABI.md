<!-- SPDX-License-Identifier: Apache-2.0 -->
# Runtime C ABI (slice R0)

First vertical slice of [PLAN.md](../PLAN.md) phase R0: one capability family behind a versioned
C ABI, a precompiled artifact and a light TypeScript consumer. Nothing here qualifies later
phases.

| Piece | Path |
| :--- | :--- |
| Library (cdylib + rlib) | `crates/yolo-runtime` |
| C header | `crates/yolo-runtime/include/yolo_runtime.h` |
| TypeScript SDK (`bun:ffi`) | `sdk/runtime` |
| Artifact packaging | `scripts/runtime_artifact.ts` → `dist/runtime/<target>/` |
| Tests | `cargo test -p yolo-runtime`, `tests/runtime_sdk.test.ts` |

```bash
just runtime-build      # cargo build --profile runtime -p yolo-runtime
just runtime-package    # library + header + manifest.json (target, toolchain, ABI, revisions, hashes)
just runtime-test       # Rust unit tests + Bun SDK tests
bun run sdk/runtime/examples/stats.ts
```

## Capabilities

| Id | Entry points | Backed by |
| :--- | :--- | :--- |
| `system.stats` | `yolo_system_stats` | `yolo_core::current_system_stats` |
| `bench.compute` | `yolo_bench_start`, `yolo_operation_wait/cancel/release` | `yolo_core::compute_benchmark_cancellable` |

They were picked because they already existed and need no engine; the capability set and the API
names are still open and will change with the real first service (R2).

## Contract

- **Versioning.** `yolo_abi_version()` returns `(major << 16) | minor`. A consumer calls it first
  and refuses another major before any other call (the SDK does). `yolo_runtime_create` receives
  `struct_size`, `abi_major`, `abi_minor`: a different major or a newer minor is `ABI_MISMATCH`, a
  caller built against a smaller structure is accepted with defaults for the missing fields.
- **Handles.** Objects are opaque 64-bit handles (slot index + generation). A destroyed or
  recycled handle is rejected with `INVALID_HANDLE`; a runtime handle is not valid where an
  operation handle is expected. No raw pointer to library state leaves the library.
- **Buffers.** Returned buffers (`YoloBuffer`: data, len, cap) belong to the library. The caller
  copies and then calls `yolo_buffer_free`, which also zeroes the struct (a second call is a no-op).
  The library never frees caller memory and never keeps a pointer to it.
- **Errors.** Every function returns a `YoloStatus`. Details of the last failure of the calling
  thread are available as JSON through `yolo_last_error`. Structured control data (build info,
  capabilities, stats) is JSON; high-volume data paths will use dedicated buffers when they exist.
- **Panics.** Every entry point catches panics and returns `PANIC`, and worker threads report a
  failed operation instead of dying silently. This requires unwinding: the artifact is built with the
  dedicated `runtime` profile (`inherits = "release"`, `panic = "unwind"`) and
  `build_info().panic_recovery` tells the consumer which behavior it got. The plain release profile
  (`panic = "abort"`) is not used for this artifact; the profile is a per-artifact decision, not a
  per-package override.
- **Threads and lifetime.** Operations run on bounded worker threads (`max_operations`, default 4,
  at most 64; `BUSY` beyond). `wait` takes a timeout (`TIMEOUT` leaves the operation valid),
  `cancel` is idempotent and polled by the worker, `release` cancels, joins and invalidates.
  `yolo_runtime_destroy` cancels and joins every operation of the runtime before it invalidates it,
  so unloading the library after destroy cannot leave a running worker.
  Handles are thread-safe: any thread may call any function.

## What the light consumer needs

`sdk/runtime/src/index.ts` and the prebuilt artifact. `cargo tree -p yolo-runtime` lists 13
packages (serde, serde_json and their proc-macro chain, `yolo-core`, the crate itself); Tauri, wry,
tao, WebKitGTK, Bun and Obscura are absent from the graph. On the development machine the artifact
is about 410 KB and one incremental build took 3 s; no comparison with the desktop stack has been
measured, so no saving is claimed.

## Not claimed

- This is not the Bun fork host (R1): the SDK uses `bun:ffi` against the shared library; native
  modules inside the fork are still to be designed.
- No Aphrody consumer has been migrated and no dependency has been retired (R2).
- Only the build host target has been produced; there is no supported-target matrix, no signing and
  no rollback procedure yet (R8). `manifest.json` identifies an artifact, it does not qualify it.
- The ABI is `1.0` and may still change until a first real capability is chosen.
