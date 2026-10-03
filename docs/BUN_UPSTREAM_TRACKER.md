# Bun Upstream Optimization & Intelligence Tracker

> **Source**: [oven-sh/bun](https://github.com/oven-sh/bun)  
> **Target Fork**: [aphrody-labs/bun](https://github.com/aphrody-labs/bun) (Branch: `aphrody`)  
> **Updated**: 2026-10-03T01:42:59.973Z  
> **Engine**: `scripts/bun_upstream_tracker.ts`

## 1. Executive Summary & Optimization Strategy

This intelligence dashboard monitors upstream Bun pull requests and performance issues to optimize **Aphrody Bun Fork** for high-throughput AI agent execution, memory efficiency, and native FFI bridging.

- **Critical Stability / Crash Fixes Identified**: 17
- **High-Impact Performance & FFI Optimizations**: 29
- **Total Tracked Items**: 50

## 2. Priority Cherry-Pick & Backport Candidates

| PR / Issue | Title | Category | Impact | State | Actionable Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [#44473](https://github.com/oven-sh/bun/pull/44473) | Resolve a module specifier once: fix a segfault in require() of an ES module, and require() with a plugin's namespace | Stability & Crash Fix | **CRITICAL** | `MERGED` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44414](https://github.com/oven-sh/bun/pull/44414) | install: deliver a manifest task's waiters on every pass of run_tasks | Stability & Crash Fix | **CRITICAL** | `MERGED` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44447](https://github.com/oven-sh/bun/pull/44447) | node:http: a thrown dispatch reads the role of its response from the role bit | Stability & Crash Fix | **CRITICAL** | `MERGED` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44348](https://github.com/oven-sh/bun/pull/44348) | bun test: fix a segfault when an asymmetric matcher meets an array element that is not there | Stability & Crash Fix | **CRITICAL** | `MERGED` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44353](https://github.com/oven-sh/bun/pull/44353) | bun test: fix a silent stack overflow when printing a deeply nested value | Stability & Crash Fix | **CRITICAL** | `MERGED` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44352](https://github.com/oven-sh/bun/pull/44352) | Fix a segfault when Module.runMain is not a function, and report what an override throws | Stability & Crash Fix | **CRITICAL** | `MERGED` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#37966](https://github.com/oven-sh/bun/pull/37966) | structured clone: re-check the transfer list after serializing so a failed transfer detaches nothing | Stability & Crash Fix | **CRITICAL** | `MERGED` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44327](https://github.com/oven-sh/bun/pull/44327) | usockets: tell a socket's holder it is gone exactly once, whoever closes it and whether or not it ever opened | Stability & Crash Fix | **CRITICAL** | `MERGED` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#38003](https://github.com/oven-sh/bun/pull/38003) | ByteStream: report a stored producer error and keep the taken prefix with the buffer | Stability & Crash Fix | **CRITICAL** | `OPEN` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44446](https://github.com/oven-sh/bun/pull/44446) | install: link bins under each dependent's own dependency name in the isolated linker | Stability & Crash Fix | **CRITICAL** | `OPEN` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44361](https://github.com/oven-sh/bun/pull/44361) | wip type checker | Stability & Crash Fix | **CRITICAL** | `OPEN` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#42856](https://github.com/oven-sh/bun/pull/42856) | url: do not abort when a host is too long for the IDNA conversion buffers | Stability & Crash Fix | **CRITICAL** | `OPEN` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#42836](https://github.com/oven-sh/bun/pull/42836) | bake: report route scan errors instead of aborting, and fail bun build --app on them | Stability & Crash Fix | **CRITICAL** | `OPEN` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44441](https://github.com/oven-sh/bun/pull/44441) | tls: trust a pinned self-signed certificate whose keyUsage lacks keyCertSign | Stability & Crash Fix | **CRITICAL** | `OPEN` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#33370](https://github.com/oven-sh/bun/pull/33370) | sql: implement Query.cancel() for postgres | Stability & Crash Fix | **CRITICAL** | `OPEN` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#44490](https://github.com/oven-sh/bun/pull/44490) | watch(windows): report a failed child spawn as an error instead of a panic | Stability & Crash Fix | **CRITICAL** | `OPEN` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#36680](https://github.com/oven-sh/bun/pull/36680) | FileSystemRouter: reset params on every failed candidate and fix single-char trailing segments | Stability & Crash Fix | **CRITICAL** | `OPEN` | Proactively adopt or cherry-pick to prevent runtime agent thread crash. |
| [#43957](https://github.com/oven-sh/bun/pull/43957) | tls: drop the handshake records that are sealed after our own FIN | Memory & Garbage Collection | *HIGH* | `MERGED` | Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#44285](https://github.com/oven-sh/bun/pull/44285) | timers: store [util.promisify.custom] as a per-function accessor | Memory & Garbage Collection | *HIGH* | `MERGED` | Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#37664](https://github.com/oven-sh/bun/pull/37664) | node:tls: make client-side new TLSSocket(socket) upgrade the socket it wraps | Network & Streams | *HIGH* | `MERGED` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#44290](https://github.com/oven-sh/bun/pull/44290) | node:tls: check the server's name for a handshake that completes after end() | Network & Streams | *HIGH* | `MERGED` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#38685](https://github.com/oven-sh/bun/pull/38685) | Blob: return only the slice when consuming a slice's stream after the Blobs were collected | FFI & Native Interop | *HIGH* | `MERGED` | High synergy with Aphrody Rust engine and Obscura headless browser bridges. |
| [#41985](https://github.com/oven-sh/bun/pull/41985) | glob: validate continuation bytes when stepping over directory entry names | Network & Streams | *HIGH* | `MERGED` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#33711](https://github.com/oven-sh/bun/pull/33711) | fetch: decide zlib or raw deflate by the RFC 1950 header, for both decoders | Memory & Garbage Collection | *HIGH* | `MERGED` | Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#42351](https://github.com/oven-sh/bun/pull/42351) | usockets: keep a socket paused when the TLS handshake queue drains it | Network & Streams | *HIGH* | `MERGED` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#44370](https://github.com/oven-sh/bun/pull/44370) | Remove the dead --dump-environment-variables flag from bun build | Network & Streams | *HIGH* | `MERGED` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#44492](https://github.com/oven-sh/bun/pull/44492) | Do not auto-install what a runtime plugin's onResolve answers | Network & Streams | *HIGH* | `OPEN` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#43962](https://github.com/oven-sh/bun/pull/43962) | node:tls: send a client's FIN after the first step of its handshake | Network & Streams | *HIGH* | `OPEN` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#44480](https://github.com/oven-sh/bun/pull/44480) | docs, bun-types: correct 20 examples that do not run as printed | Memory & Garbage Collection | *HIGH* | `OPEN` | Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#38510](https://github.com/oven-sh/bun/pull/38510) | deepEquals: settle the Set and Map entries the hash probe misses once, by the rule of the entry point | Network & Streams | *HIGH* | `OPEN` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#44398](https://github.com/oven-sh/bun/pull/44398) | worker: add WorkerGlobalScope.close() to the Web Worker global | Network & Streams | *HIGH* | `OPEN` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#44494](https://github.com/oven-sh/bun/pull/44494) | Remove four lifetime erasures that nothing needs | Network & Streams | *HIGH* | `OPEN` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#44489](https://github.com/oven-sh/bun/pull/44489) | build: define the libarchive config.h names that 3.8.9 reads on Windows and FreeBSD | Network & Streams | *HIGH* | `OPEN` | Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#40356](https://github.com/oven-sh/bun/pull/40356) | install: name the isolated linker's fallback link by the dependency name | Memory & Garbage Collection | *HIGH* | `OPEN` | Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#44208](https://github.com/oven-sh/bun/issues/44208) | node:http: every request copies the bytes behind its head into a head Buffer that only 'connect' and 'upgrade' read | Memory & Garbage Collection | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#44187](https://github.com/oven-sh/bun/issues/44187) | node:sqlite / bun:sqlite: built without SQLITE_DEFAULT_MEMSTATUS=0, so reads from several workers contend on a global mutex | Memory & Garbage Collection | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#44186](https://github.com/oven-sh/bun/issues/44186) | worker_threads: allocating workers block on each other's GC marking; BUN_JSC_numberOfGCMarkers=1 halves 8-worker wall time | Memory & Garbage Collection | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#44177](https://github.com/oven-sh/bun/issues/44177) | Bun.serve routes: building the table is quadratic and lookup is linear in the number of sibling routes | Network & Streams | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#43279](https://github.com/oven-sh/bun/issues/43279) | Cached CommonJS `require()` accumulates duplicate native child references, causing unbounded GC cost | FFI & Native Interop | *HIGH* | `OPEN` | Track upstream regression or bottleneck: High synergy with Aphrody Rust engine and Obscura headless browser bridges. |
| [#43260](https://github.com/oven-sh/bun/issues/43260) | react-compiler: codegen uses memory quadratic in the number of blocks of a component | Network & Streams | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#42603](https://github.com/oven-sh/bun/issues/42603) | URLPattern: pattern shapes that take super-linear time to match | FFI & Native Interop | *HIGH* | `OPEN` | Track upstream regression or bottleneck: High synergy with Aphrody Rust engine and Obscura headless browser bridges. |
| [#42284](https://github.com/oven-sh/bun/issues/42284) | Performance difference for character-concatenated strings in irregular arrays | Network & Streams | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Optimizes CDP WebSocket streaming and LLM API response throughput. |
| [#42200](https://github.com/oven-sh/bun/issues/42200) | `v8.getHeapStatistics()` is O(heap) on Bun and costs ~2x a full GC | Memory & Garbage Collection | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#41740](https://github.com/oven-sh/bun/issues/41740) | Bun.sql: checkUnsafeTransaction uppercases the whole query to test a 17-char prefix (O(query length) per query) | Memory & Garbage Collection | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#41399](https://github.com/oven-sh/bun/issues/41399) | [performance] WinZip-style aes-js AES is 22% slower under amd64 emulation but 24% faster on native arm64 | Memory & Garbage Collection | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Integrate to optimize long-running 24/7 background agent memory footprint. |
| [#41211](https://github.com/oven-sh/bun/issues/41211) | bunx --bun shadcn@latest add with multiple components is very slow on Windows but fast on macOS | Network & Streams | *HIGH* | `OPEN` | Track upstream regression or bottleneck: Optimizes CDP WebSocket streaming and LLM API response throughput. |

## 3. General Optimizations & Transpiler Improvements

| PR / Issue | Title | Category | State | Actionable Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| [#44474](https://github.com/oven-sh/bun/pull/44474) | Ask a runtime plugin's onResolve once: fix require() of a path a plugin moves into a namespace | Bundler & Transpiler | `MERGED` | Fast cold-start and bundle speedups for dynamically evaluated agent code. |
| [#44305](https://github.com/oven-sh/bun/issues/44305) | Object.freeze on many small arrays is ~10× slower than Node, and reads from frozen number arrays ~9× slower | General Enhancement | `OPEN` | Track upstream regression or bottleneck: Evaluate during standard upstream auto-sync cycles. |
| [#44084](https://github.com/oven-sh/bun/issues/44084) | node:sqlite StatementSync.get() ~1.5x slower than Node when returning table columns | Bundler & Transpiler | `OPEN` | Track upstream regression or bottleneck: Fast cold-start and bundle speedups for dynamically evaluated agent code. |
| [#42857](https://github.com/oven-sh/bun/issues/42857) | url.domainToUnicode takes quadratic time in the number of xn-- labels | General Enhancement | `OPEN` | Track upstream regression or bottleneck: Evaluate during standard upstream auto-sync cycles. |

## 4. How to Cherry-Pick to Aphrody Fork

To cherry-pick a specific upstream optimization commit into the Aphrody fork:

```bash
# 1. Fetch latest upstream
git -C packages/bun fetch upstream

# 2. Switch to aphrody branch
git -C packages/bun checkout aphrody

# 3. Cherry pick the commit (example for PR #33711)
git -C packages/bun cherry-pick <commit-sha>

# 4. Verify test suite and push
bun test packages/bun/packages/aphrody-bun-runtime/test/runtime.test.ts
git -C packages/bun push origin aphrody
```
