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
