---
name: bun-doctrine
description: "Strict Bun-only doctrine, native API substitutions, server gotchas and Bun fork rules."
metadata:
  version: "1.0.0"
  author: "aphrody-code"
  license: "Apache-2.0"
---

# Bun Doctrine & Engineering Rules

Directly derived from `vendor/bun/docs` (335 MDX pages) and Bun core codebase (306 TS files).

## API Substitutions

- File I/O: Use `Bun.file(path).text()`, `Bun.write(path, data)` instead of `node:fs/promises`.
- HTTP Server: Use `Bun.serve({ fetch, websocket })` instead of Express/Fastify. Set `server.timeout(req, 0)` for long-lived streams/SSE.
- Processes: Use `Bun.spawn` and `Bun.$` instead of `child_process`.
- Hashing: Use `Bun.hash.wyhash`, `Bun.hash.crc32` instead of crypto md5/sha1 for memory lookups.
- SQLite: Use `import { Database } from "bun:sqlite"`.
