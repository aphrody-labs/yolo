---
name: bun-docs-router
description: This skill should be used when the user asks "which Bun docs page covers X", "find the bunfig key for", "list the bun test flags", "cite the Bun docs for", or when a Bun docs lookup spans several pages or a very large one such as bundler/index or runtime/sql. Maps a task to a docs slug, enforces section-only reads and delegates multi-page research to bun-docs-researcher. For writing or porting Bun code use the bun-doctrine skill.
version: 0.1.0
---

# Bun docs router

Answer Bun questions from documentation that matches the Bun version in use. Do not answer from memory: APIs, flags and defaults change between minor releases.

## Lookup order

1. **Installed type definitions.** Exact signatures for the installed version live in `node_modules/bun-types/*.d.ts` (`serve.d.ts`, `sqlite.d.ts`, `test.d.ts`, `shell.d.ts`, `ffi.d.ts`, `sql.d.ts`, `s3.d.ts`, `redis.d.ts`, `bun.d.ts`, …). Search them with Grep. Do not read `bun.d.ts` whole (about 350 KB).
2. **Docs on disk.** `node_modules/bun-types/docs/` ships with the installed version. In this repository they are `packages/bun/docs/` (fork pinned at a commit, matching the latest upstream documentation).
3. **MCP tools**, when the session exposes them: `bun_docs_search` (`query`, `limit`, `include_content`), `bun_docs_read` (`slug`, optional `section`, `max_chars`), `bun_docs_list` (`prefix`), and `bun_node_equivalent` (Node API, module or package to Bun, with a `compat` of `full`, `partial` or `missing`). The composite `skill_bun_docs_lookup` wraps the same lookup.
4. **Online.** `https://bun.com/docs/llms.txt` (index for agents), `https://bun.com/docs/<slug>`, or Context7 library `/oven-sh/bun`.

## Size discipline

The docs hold about 336 Markdown pages (roughly 1.95 MB, over 480 k tokens). Never load them wholesale. The largest pages are `bundler/index` (72 KB), `bundler/esbuild` (64 KB), `runtime/sql` (60 KB), `bundler/executables` (42 KB), `runtime/webview` (36 KB) and `runtime/utils` (34 KB).

1. Locate the page with `references/page-map.md` or a search (`bun_docs_search`, or Grep over `packages/bun/docs/`).
2. Read one section: `bun_docs_read` with `section`, or `Read` with `offset` and `limit` after finding the heading line with Grep.
3. Delegate to the `bun-docs-researcher` agent when the answer needs more than two pages or any page over 20 KB, so the page contents stay out of the main context.

## Method

1. Find the version in use (`bun --version`, `node_modules/bun-types/package.json`) and search with the API name plus the intent (`Bun.file stream`, `bun test mock module`).
2. Read only the relevant section and cite the page as `https://bun.com/docs/<slug>`.
3. When the docs and the installed `.d.ts` disagree, trust the `.d.ts` for the installed version and say that the docs describe a different release.
4. Flag APIs the docs mark experimental (HTTP/2, HTTP/3, `Bun.WebView`, `--react-compiler`, `--app`).

## Doc-specific facts worth knowing

- Many pages import shared flag references from `snippets/cli/*.mdx` (`run`, `build`, `test`, `install`, `add`, …). Read the snippet for the exact flag list.
- `guides/` holds 191 short task recipes, grouped by `binary`, `deployment`, `ecosystem`, `html-rewriter`, `http`, `install`, `process`, `read-file`, `runtime`, `streams`, `test`, `util`, `websocket`, `write-file`. Search there for a ready recipe.
- `runtime/nodejs-compat` lists Node module and global coverage; confirm it before replacing a Node API.

## Additional resources

- **`references/page-map.md`** - task to page routing table and the full area index with page sizes
- `bun-doctrine` skill - the rules that apply once the right API is found
- `typescript7-bun` skill - TypeScript 7 and tsconfig questions
