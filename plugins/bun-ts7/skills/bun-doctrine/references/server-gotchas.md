# Bun runtime gotchas (verified)

Sources: Bun docs at `packages/bun/docs` (fork commit `49c076eb`, 2026-10-02, package version 1.4.3) read on 2026-10-03; installed `bun` and `bun-types` were 1.4.2. Items marked **docs only** are in the docs but absent from the installed `bun-types` 1.4.2 (a `tsc` run rejects them); re-check any claim against the installed `.d.ts` before relying on it.

## Timeouts and long-lived streams (`runtime/http/server`)

- `idleTimeout` defaults to **10 seconds**. A connection is idle when no bytes move, including an in-flight request whose handler has not yet written anything. Clients see a connection reset. Maximum 255; `0` disables.
- The idle timer also applies while a response streams. A stream quiet for longer than `idleTimeout` is closed mid-response.
- Override per request with `server.timeout(req, seconds)`; `server.timeout(req, 0)` disables the timer for that request (the correct fix for SSE).
- Over HTTP/2 the timeout belongs to the connection: the most permissive value among open requests applies.
- WebSocket `idleTimeout` defaults to 120 seconds; `maxPayloadLength` to 16 MB; `backpressureLimit` to 16 MB.

## Development mode (`runtime/http/error-handling`)

- `Bun.serve` runs in development mode by default. It is disabled by `NODE_ENV=production` or `development: false`.
- In development, a throwing handler without a usable `error` callback returns a page with the error, stack, surrounding source and file paths. Deployments must disable it.
- The `--production` flag exists on `bun build` and `bun install`; `bun run` ignores it.
- An `error(error)` callback returns the `Response` to serve; in development it replaces the built-in page.

## Port and lifecycle (`runtime/http/server`)

- With no `port` option, `ServerConfig.rs` takes the first of `BUN_PORT`, `PORT`, `NODE_PORT` that parses as a number, then the `--port` value, then 3000 (`[serve] port` in `bunfig.toml` is documented as the default port; its precedence was not checked). `port: 0` picks a free port.
- `server.stop()` is graceful (in-flight requests finish, idle keep-alives close). `server.stop(true)` terminates every connection. Both return a promise.
- `server.closeIdleConnections()` closes idle keep-alive connections only and returns the count.
- `server.reload({ fetch, error, routes, websocket })` swaps handlers without a restart (these four only).
- `server.unref()` lets the process exit when the server is the only thing left.
- `export default { fetch } satisfies Serve.Options<undefined>` is accepted: Bun passes a default export that has a `fetch` handler to `Bun.serve`.

## Routing (`runtime/http/routing`)

- Precedence: exact, parameter, wildcard, global catch-all. Routing is case-sensitive.
- Static `Response` routes are cached for the life of the server object (ETag and `If-None-Match` supported). Missing files referenced through `await Bun.file(...).bytes()` fail at startup.
- `new Response(Bun.file(path))` is a file route: read per request, built-in 404, `Last-Modified`, `Range`, streaming.
- `{ dir: "./public" }` serves a directory; the route path must end in `/*`. Non-canonical paths (`.`, `..`, empty segments, `%2F`) get 404. On case-insensitive filesystems keep access-controlled content outside `dir`.
- `req.params` is typed when the route is a string literal; `req.cookies` is a `CookieMap`.

## WebSocket (`runtime/http/websockets`)

- Declare handlers once on `Bun.serve`: `open`, `message`, `close`, `drain`, `error`.
- Return nothing from `fetch` after a successful `server.upgrade(req)`.
- Type `ws.data` with a `data: {} as T` property on the `websocket` object (the `Bun.serve<T>()` type parameter was removed).
- `ws.publish()` skips the publishing socket unless `publishToSelf` is set; `server.publish()` reaches all subscribers.
- `server.upgrade()` works on HTTP/1.1 requests only; with `http1: false` the server cannot accept WebSockets.
- The client `WebSocket` accepts a `headers` option and `pause()`/`resume()` (Bun extensions, not in browsers).

## HTTP/2 and HTTP/3 (experimental)

- `http2: true` serves HTTP/2 on the same port; over TLS the protocol is chosen by ALPN. `http3: true` requires `tls` and listens on UDP as well. `http3` does not work with unix domain sockets, and `http1: false` requires `http2: true` or `http3: true`. Treat both as experimental.

## fetch (`runtime/networking/fetch`)

- At most 256 simultaneous requests by default; extra requests queue (`BUN_CONFIG_MAX_HTTP_REQUESTS`, maximum 65535).
- Without a `proxy` option Bun reads `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and `NO_PROXY` on every call. `proxy: false` connects directly (**docs only**: the 1.4.2 types accept `string | URL | { url, headers }`).
- A failed connection rejects with a `TypeError` whose `code` is the socket error (`ECONNREFUSED`, `ETIMEDOUT`, …).
- `tls.rejectUnauthorized: false` disables certificate validation: use only for local debugging.
- Pooling is on by default; `keepalive: false` (**docs only**) or a `Connection: close` header disables it per request. `Bun.FetchSession` and `fetch(url, { session })` are also **docs only**.

## Streams (`runtime/streams`)

- `type: "direct"` streams write straight to the destination: `controller.write()` returns the byte count or a pending `Promise<number>` under backpressure; `await` it.
- A destination that takes the whole body calls `pull()` once; returning a promise keeps the stream open until it settles.
- Async generators are valid `Response` bodies; the return value is not part of the body.

## SQLite (`runtime/sqlite`)

- `db.query(sql)` returns a cached statement (cache size `Database.MAX_QUERY_CACHE_SIZE`, default 20). Use `db.prepare(sql)` for one-off dynamic SQL.
- Bound parameter names include their prefix (`$`, `:`, `@`) unless the database was opened with `strict: true`.
- Integers beyond 2^53 lose precision unless `safeIntegers: true`.
- WAL leaves `-wal` and `-shm` files. On macOS they persist after `close()` (system SQLite); to clean up run `db.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0)` then `PRAGMA wal_checkpoint(TRUNCATE)` before closing.
- `using db = new Database(…)` calls `close(true)` at scope exit.

## Environment files (`runtime/environment-variables`)

- Load order, increasing precedence: `.env`, `.env.<NODE_ENV>`, `.env.local` (skipped when `NODE_ENV=test`), `.env.<NODE_ENV>.local`.
- `--env-file <path>` overrides which files load (pipes and FIFOs work); `--no-env-file` or `env = false` in `bunfig.toml` disables automatic loading. Run as `node` (via `--bun`/symlink), Bun skips automatic loading to match Node.
- `$VAR` references inside `.env` values are expanded; escape with `\$`.

## Watch and hot reload (`runtime/watch-mode`)

- `--watch` restarts the whole process on change; `--hot` re-evaluates modules and keeps `globalThis`. Keep state in `globalThis.x ??= …` to survive `--hot`.
- `bun --hot` reloads a running `Bun.serve` handler without restarting the process.

## bunfig.toml (`runtime/bunfig`)

- Local `bunfig.toml` at the project root; global `$HOME/.bunfig.toml` or `$XDG_CONFIG_HOME/.bunfig.toml` is read only by package-manager commands. Keys in the local file override the global ones; CLI flags override both.
- Useful sections: `[serve] port`, `[test] preload`, `[test] pathIgnorePatterns` (skip submodules and vendored tests), `[test] coverageThreshold`, `[install] linker`, `[install] minimumReleaseAge`, `[run] shell`, `[run] bun`, `[run] noOrphans`.
