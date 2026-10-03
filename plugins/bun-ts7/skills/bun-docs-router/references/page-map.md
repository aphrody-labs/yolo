# Bun docs page map

Slugs are paths below the docs root, without extension (`runtime/http/server` is `runtime/http/server.mdx`). Sizes are KB of the fork docs at commit `49c076eb` (2026-10-02); 336 Markdown pages, about 1.95 MB. Public URL: `https://bun.com/docs/<slug>`.

## Task to page

| Question about | Read |
| --- | --- |
| Starting an HTTP server, routes, static responses | `runtime/http/server`, `runtime/http/routing` |
| WebSocket server/client, pub/sub, backpressure | `runtime/http/websockets` |
| TLS, SNI, client certificates | `runtime/http/tls`, `runtime/networking/fetch` |
| Server error page, `error` callback, development mode | `runtime/http/error-handling` |
| Cookies, CSRF | `runtime/cookies`, `runtime/http/cookies`, `runtime/csrf` |
| Full-stack app, HTML imports, dev server, HMR | `bundler/fullstack`, `bundler/html-static`, `bundler/hot-reloading` |
| Reading/writing files, `Bun.file`, `Bun.write` | `runtime/file-io` |
| Streams, direct streams, async generator bodies | `runtime/streams` |
| Shell scripting, `$` template | `runtime/shell` |
| Spawning processes, IPC | `runtime/child-process` |
| SQLite | `runtime/sqlite` |
| Postgres / MySQL, `Bun.sql` | `runtime/sql` |
| Redis, S3 | `runtime/redis`, `runtime/s3` |
| `.env` files, env configuration variables | `runtime/environment-variables` |
| `bunfig.toml` (runtime, test, install, run) | `runtime/bunfig` |
| `--watch`, `--hot` | `runtime/watch-mode` |
| Module resolution, `import.meta`, tsconfig paths | `runtime/module-resolution` |
| Node compatibility, Node module coverage | `runtime/nodejs-compat`, `runtime/globals`, `runtime/web-apis` |
| Utilities (`Bun.sleep`, `Bun.which`, `Bun.inspect`, compression, …) | `runtime/utils` |
| Hashing, passwords, secrets | `runtime/hashing`, `runtime/secrets` |
| FFI, C compiler, Node-API | `runtime/ffi`, `runtime/c-compiler`, `runtime/node-api` |
| Workers | `runtime/workers` |
| Test runner basics, matchers, modifiers | `test/index`, `test/writing-tests` |
| Mocks, spies, `mock.module` | `test/mocks` |
| Hooks, preload | `test/lifecycle` |
| Snapshots, DOM testing | `test/snapshots`, `test/dom` |
| Parallel and sharded runs, timings | `test/parallel` |
| Coverage, reporters, discovery, config | `test/code-coverage`, `test/reporters`, `test/discovery`, `test/configuration` |
| Environment and error behavior of `bun test` | `test/runtime-behavior` |
| Bundling API, CLI options, targets, splitting | `bundler/index` |
| Loaders, plugins, macros | `bundler/loaders`, `bundler/plugins`, `bundler/macros`, `runtime/plugins` |
| Single-file executables | `bundler/executables` |
| Migrating from esbuild | `bundler/esbuild` |
| Installing, adding, updating packages | `pm/cli/install`, `pm/cli/add`, `pm/cli/update`, `pm/cli/outdated` |
| Workspaces, catalogs, overrides, filters | `pm/workspaces`, `pm/catalogs`, `pm/overrides`, `pm/filter` |
| Lockfile, `.npmrc`, registries, lifecycle scripts | `pm/lockfile`, `pm/npmrc`, `pm/scopes-registries`, `pm/lifecycle` |
| Isolated installs, global store, cache | `pm/isolated-installs`, `pm/global-store`, `pm/global-cache` |
| Security scanner, audit | `pm/security-scanner-api`, `pm/cli/audit` |
| TypeScript and tsconfig for Bun, TypeScript 6/7 | `typescript`, `typescript-6`, `runtime/typescript` |
| Installing Bun, quickstart | `installation`, `quickstart` |
| Contributing, building Bun, bindgen, benchmarks | `project/contributing`, `project/building-windows`, `project/bindgen`, `project/benchmarking` |

## Area index

### Top level
`index` (6), `quickstart` (6), `installation` (9), `typescript` (2), `typescript-6` (2.5), `feedback` (2.5)

### `runtime/`
- Core: `index` (7), `bun-apis` (15), `bunfig` (28), `globals` (25), `web-apis` (14), `nodejs-compat` (29), `module-resolution` (21), `module-graph` (11), `environment-variables` (11.5), `watch-mode` (6), `debugger` (13), `repl` (7), `typescript` (1.5), `jsx` (9), `transpiler` (7), `plugins` (12), `file-types` (14), `auto-install` (4), `code-generation-from-strings` (13), `console` (1.5)
- HTTP: `http/server` (20), `http/routing` (11), `http/websockets` (14), `http/tls` (2.5), `http/error-handling` (1.6), `http/cookies` (2), `http/metrics` (0.7), `cookies` (12), `csrf` (9)
- Networking: `networking/fetch` (23), `networking/tcp` (5.6), `networking/udp` (4.7), `networking/dns` (4.4)
- Files and data: `file-io` (8), `streams` (9), `binary-data` (29), `glob` (4), `file-system-router` (2.6), `archive` (14), `image` (10.5), `color` (10), `hashing` (9), `secrets` (9.5), `utils` (34), `semver` (2), `html-rewriter` (12.7), `markdown` (16), `json5` (5.5), `jsonl` (5.9), `toml` (7.6), `xml` (13.7), `yaml` (10)
- Process and system: `shell` (15), `child-process` (25), `workers` (12), `ffi` (18.6), `c-compiler` (5.3), `node-api` (0.5), `cron` (21), `webview` (36), `templating/create` (10.7), `templating/init` (1.8)
- Databases and storage: `sqlite` (26), `sql` (60), `redis` (15.6), `s3` (28)

### `bundler/`
`index` (72), `loaders` (12), `plugins` (13.5), `macros` (10), `fullstack` (27), `html-static` (13), `hot-reloading` (10), `css` (25), `minifier` (18), `bytecode` (18), `executables` (42), `standalone-html` (11), `esbuild` (64)

### `test/`
`index` (15), `writing-tests` (18), `lifecycle` (9), `mocks` (19), `snapshots` (9.5), `configuration` (11.5), `discovery` (3), `reporters` (4), `runtime-behavior` (8), `dom` (6), `parallel` (13), `code-coverage` (11.5), `dates-times` (3.7)

### `pm/`
- CLI: `cli/install` (23), `cli/add` (7), `cli/remove` (1), `cli/update` (7.5), `cli/outdated` (11), `cli/audit` (5), `cli/pm` (16.6), `cli/publish` (3.6), `cli/link` (1.4), `cli/patch` (2.7), `cli/why` (1.9), `cli/dedupe` (2.7), `cli/prune` (3.3), `cli/info` (1.3)
- Concepts: `workspaces` (6), `catalogs` (8), `filter` (7), `overrides` (5), `lockfile` (2), `npmrc` (7.4), `scopes-registries` (1), `lifecycle` (4), `isolated-installs` (11.7), `global-store` (10.7), `global-cache` (4), `security-scanner-api` (2.6), `bunx` (2.6)

### `snippets/cli/`
Shared flag references included by other pages: `run` (10.5), `build` (10), `test` (2.8), `install` (4.5), `add` (5.3), `update` (4.5), `outdated` (4), `publish` (5.4), `patch` (5.2), `link` (4.8), `remove` (4.3), `bunx` (1.3), `init` (1.7)

### `project/`
`contributing` (17), `building-windows` (8), `bindgen` (8), `benchmarking` (11), `license` (11), `roadmap` (0.4)

### `guides/` (191 pages)
Folders: `binary`, `deployment`, `ecosystem`, `html-rewriter`, `http`, `install`, `process`, `read-file`, `runtime`, `streams`, `test`, `util`, `websocket`, `write-file`, plus `index`. List one folder with `bun_docs_list` (`prefix: "guides/http/"`) or `ls`.

## Grep patterns

- Find a flag: `rg -n -- '--elide-lines' <docs>/`
- Find an API heading: `rg -n '^#{2,4} .*Bun\.serve' <docs>/runtime`
- Find a bunfig key: `rg -n '^### `?test\.' <docs>/runtime/bunfig.mdx`
