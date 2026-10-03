# @aphrody/runtime-sdk

Light TypeScript SDK of the YOLO native runtime: loads the precompiled `yolo_runtime` library through
its versioned C ABI with `bun:ffi` and exposes the `runtime:system` and `runtime:process` modules.
Nothing here compiles an engine. See `docs/RUNTIME-ABI.md` and `docs/DECISIONS.md` in the yolo repository.

```ts
import { Runtime } from "@aphrody/runtime-sdk";

using runtime = Runtime.load(); // verified artifact, ABI negotiated first
using child = runtime.spawn({ program: "server", args: ["--port", "8080"], stdio: "capture" });
await child.waitForHttp({ port: 8080, path: "/health" });
await child.stopAsync(2000);
```

Library resolution: `$YOLO_RUNTIME_LIB`, then the installed artifact
(`$YOLO_RUNTIME_HOME/<target>/current`, default `~/.yolo/runtime`), then `target/runtime/` of the
yolo checkout. Install with `just runtime-install`, roll back with `just runtime-rollback`.

For one-shot binary output, ABI 1.4 provides lossless capture with an explicit
budget. Overflow rejects with `RuntimeError` / `Status.OutputLimit`; no successful
response is truncated. The existing `capture` mode remains a 64 KiB diagnostic tail.

```ts
using runtime = Runtime.load();
using child = runtime.spawn({
  program: "converter",
  args: ["input"],
  stdio: "capture-lossless",
  maxOutputBytes: 8 * 1024 * 1024, // per stream, total across all drains
});
const { stdout, stderr, status } = await child.collectOutput({ timeoutMs: 30_000 });
// stdout/stderr are owned Uint8Arrays; arbitrary bytes survive without UTF-8 decoding.
```

`collectOutput` stops the child on timeout, abort or capture error, and drains
terminal output after joined-reader shutdown. The caller releases the handle.
Native capture workers are joined before process release/runtime destroy returns.
After runtime close, SDK handles reject further native calls and can be disposed
without entering unloaded code. Unix shutdown covers the owned process group;
Windows process-tree shutdown and runtime behavior on other targets still need
execution qualification.
