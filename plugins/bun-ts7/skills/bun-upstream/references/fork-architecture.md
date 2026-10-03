# Bun fork architecture

Checked on `packages/bun` at commit `49c076eb` (Bun 1.4.3) on 2026-10-03, from `Cargo.toml`, a listing of `src/` and `packages/`, and the fork's `CLAUDE.md` / `src/CLAUDE.md`. Merged from the former `monorepo-topology`, `naming-conventions` and architecture notes; the documentation index is `bun-docs-router/references/page-map.md`, and the build, test and review rules are in `bun-doctrine/references/fork-contribution.md`.

## Languages and workspace

- Rust workspace of about 200 crates (per `CLAUDE.md`), `edition = "2024"`, `resolver = "2"`. Each crate is one rustc invocation producing an rlib; cargo plans them and ninja runs them (`scripts/build/rust.ts`, `scripts/build/rust/`).
- Release profile: `lto = "off"` and `codegen-units = 1`. Each crate emits ThinLTO bitcode, and Bun's link runs the LTO over all of them, with `-C linker-plugin-lto` added by `scripts/build/rust.ts` (comments in `Cargo.toml`).
- C++ bindings to JavaScriptCore in `src/jsc/bindings/*.cpp`. Built-in JavaScript/TypeScript modules in `src/js/` (`node/`, `bun/`, `thirdparty/`, `internal/`, `builtins/`). Code generators in `src/codegen/` produce Rust and C++ from `*.classes.ts`.

## Main directories under `src/`

| Directory | Role |
| --- | --- |
| `bun_core/` | strings, formatting, logging, env vars, allocator helpers: the foundation |
| `sys/` | cross-platform syscall wrappers (`File`, `Fd`, `Dir`, `Error`) |
| `paths/` | path joining and normalization, path-buffer pool |
| `jsc/` | JavaScriptCore value types, `Strong`/`Weak`, FFI imports; `jsc/bindings/` is the C++ side |
| `runtime/` | `bin_entry/` (process entry), `cli/`, `api/` (JS-visible APIs), `server/` (`Bun.serve`), `node/` (Node compat), `webcore/` (Web APIs), `crypto/` |
| `js_parser/`, `js_printer/`, `transpiler/`, `resolver/`, `ast/` | the JavaScript/TypeScript front end |
| `bundler/`, `css/`, `install/`, `shell/`, `http/`, `sql/`, `bake/`, `event_loop/` | bundler, CSS, package manager, Bun Shell, HTTP client, SQL, dev-server framework, event loop |

`bun_runtime` is the root of the crate graph: the final link takes every crate's rlib together with the C and C++ objects.

## Crate suffixes (from a listing of `src/`)

- **`*_jsc`**: bridges between Rust data structures and JavaScriptCore (type conversion, exception checks, opaque pointers). Eleven crates: `ast_jsc`, `bundler_jsc`, `css_jsc`, `http_jsc`, `install_jsc`, `js_parser_jsc`, `patch_jsc`, `semver_jsc`, `sourcemap_jsc`, `sql_jsc`, `sys_jsc`.
- **`*_sys`**: low-level `extern "C"` wrappers over C/C++ libraries or OS APIs. Thirteen crates: `boringssl_sys`, `brotli_sys`, `cares_sys`, `libdeflate_sys`, `libuv_sys`, `lsquic_sys`, `mimalloc_sys`, `simdutf_sys`, `spawn_sys`, `tcc_sys`, `uws_sys`, `windows_sys`, `zlib_sys`.

## Packages (`packages/`)

`bun-types` (TypeScript definitions; no native rebuild is needed, test with `test/integration/bun-types/`), `bun-vscode`, `bun-error`, `bun-lambda`, `bun-inspector-protocol`, `bun-inspector-frontend`, `bun-debug-adapter-protocol`, `bun-release`, `bun-plugin-svelte`, `bun-plugin-yaml`, `bun-build-mdx-rs`, `bun-native-bundler-plugin-api`, `bun-native-plugin-rs`, `bun-usockets`, `bun-uws`, `h3blast`. The Aphrody runtime, `packages/aphrody-bun-runtime`, exists on the `aphrody` branch only.

## Vendored native libraries

Per the fork's `CLAUDE.md`, third-party code is vendored under `vendor/` (not git submodules), with build configuration in `scripts/build/deps/*.ts`: BoringSSL, brotli, c-ares, hdrhistogram, highway (SIMD), libarchive, libdeflate, libuv (Windows event loop), lol-html (`HTMLRewriter`), lshpack, lsqpack and lsquic (HTTP/3), mimalloc, picohttpparser, rust-argon2 (`Bun.password`), tinycc (fork `oven-sh/tinycc`, for `bun:ffi`), WebKit (JavaScriptCore), zlib-ng, zstd, and the Node.js headers.

In the repository checkout `packages/bun/vendor/` does not exist: the libraries are handled by Bun's build orchestrator.

## JavaScript classes in C++ (`CLAUDE.md`)

For a class with a public constructor create three classes: `Foo : JSC::JSDestructibleObject` (when it has C++ fields), `FooPrototype : JSC::JSNonFinalObject` and `FooConstructor : JSC::InternalFunction`. Define properties with `HashTableValue` arrays, add iso subspaces for classes with C++ fields, and cache structures in `ZigGlobalObject`. The fork's own `implementing-jsc-classes-cpp` and `implementing-jsc-classes-rust` skills cover the details.
