# Node to Bun substitutions: code

Checked against the Bun docs (`packages/bun/docs`, fork commit `49c076eb`, Bun 1.4.3) and `bun-types` 1.4.2. Items marked **docs only** are absent from the installed 1.4.2 types, so `tsc` rejects them. Slugs refer to `https://bun.com/docs/<slug>`.

## HTTP server (`runtime/http/server`, `runtime/http/routing`)

```ts
const server = Bun.serve({
  port: 0, // random port; read server.port / server.url
  routes: {
    "/health": new Response("OK"), // static: cached until server.reload()
    "/users/:id": req => new Response(`User ${req.params.id}`),
    "/api/posts": {
      GET: () => Response.json([]),
      POST: async req => Response.json({ created: true, ...(await req.json()) }, { status: 201 }),
    },
    "/static/*": { dir: "./public" }, // directory route: path must end with /*
  },
  fetch() {
    return new Response("Not Found", { status: 404 }); // unmatched requests
  },
  error(error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  },
});
```

Route precedence: exact, then parameter, then wildcard, then global catch-all.

## Server-Sent Events (`runtime/http/server`, `runtime/streams`)

```ts
Bun.serve({
  routes: {
    "/events": (req, server) => {
      server.timeout(req, 0); // otherwise the connection closes after 10 s without bytes
      return new Response(
        async function* () {
          yield "data: hello\n\n";
        },
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  },
});
```

An async generator body gets backpressure automatically. For a direct stream use `new ReadableStream({ type: "direct", async pull(controller) { await controller.write(chunk); … controller.close(); } })`.

## WebSocket server (`runtime/http/websockets`)

```ts
Bun.serve({
  fetch(req, server) {
    if (server.upgrade(req, { data: { channel: "general" } })) return; // no Response after a successful upgrade
    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    data: {} as { channel: string }, // types ws.data in every handler
    open(ws) {
      ws.subscribe(ws.data.channel);
    },
    message(ws, message) {
      ws.publish(ws.data.channel, message); // sends to subscribers except ws itself
    },
  },
});
```

Handlers are declared once per server, not per socket. `ws.send()` returns `-1` (enqueued, backpressure), `0` (dropped) or the number of bytes sent.

## Files (`runtime/file-io`)

```ts
const file = Bun.file("foo.txt"); // lazy; reads nothing yet
await file.text(); // .json() .bytes() .arrayBuffer() .stream()
await Bun.write("out.txt", "data"); // string, Blob, ArrayBuffer, TypedArray or Response
await Bun.write(Bun.stdout, Bun.file("input.txt"));
const writer = Bun.file("log.txt").writer({ highWaterMark: 1024 * 1024 });
writer.write("line\n");
writer.end();
```

The n2b registry maps `fs.readFileSync` to `Bun.file(path).text()`, which is asynchronous: `await` it, or keep `node:fs` where a synchronous read is required. Directories use `node:fs/promises` (`readdir`, `mkdir({ recursive: true })`).

## SQLite (`runtime/sqlite`)

```ts
import { Database } from "bun:sqlite";

using db = new Database("app.sqlite", { strict: true }); // strict: bind without $ prefix, throw on missing params
db.run("PRAGMA journal_mode = WAL;");
const get = db.query("SELECT * FROM users WHERE id = $id"); // cached statement
get.get({ id: 1 });
const insertAll = db.transaction((rows: { name: string }[]) => {
  for (const row of rows) db.query("INSERT INTO cats (name) VALUES ($name)").run(row);
});
insertAll([{ name: "Keanu" }]); // BEGIN ... COMMIT, rolled back on throw
```

Use `safeIntegers: true` to receive `bigint` for integers beyond 2^53.

## Shell (`runtime/shell`)

```ts
import { $ } from "bun";

const sha = await $`git rev-parse HEAD`.text(); // .text() implies .quiet()
const { exitCode, stdout } = await $`something-that-may-fail`.nothrow().quiet();
await $`echo ${userInput}`; // interpolations are escaped: no shell injection
```

Bun Shell does not start `/bin/sh`. Spawning `bash -c` hands control to that shell and removes the protection. External programs still interpret their own arguments, so validate input that could look like a flag.

## Child processes

```ts
await using proc = Bun.spawn({ cmd: ["bun", "script.ts"], stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
```

Read both streams and `proc.exited` together; assert the exit code last so a failure shows the output first.

## fetch (`runtime/networking/fetch`)

```ts
const response = await fetch("https://example.com", { signal: AbortSignal.timeout(1000) });
await Bun.write("index.html", response); // stream a response body to disk
```

Extensions in the 1.4.2 types: `proxy` (string, `URL` or `{ url, headers }`), `tls`, `unix`, `verbose: true`, `decompress`, `protocol`, `maxRedirects`, `timeout`. **Docs only** (absent from `bun-types` 1.4.2): `proxy: false`, `keepalive`, `verbose: "curl"` and `new Bun.FetchSession({...})` (a keep-alive pool).

## Other Node APIs

Query the live n2b registry instead of extending this file: `aphrody n2b rules --report json`, or the `bun_node_equivalent` tool.
