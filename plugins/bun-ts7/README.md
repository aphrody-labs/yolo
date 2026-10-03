# bun-ts7

Bun-only doctrine, version-matched Bun documentation routing, TypeScript 7 guidance and Bun fork upstream synchronization for Claude Code and Antigravity. Built for the YOLO workbench (Bun 1.4.2, TypeScript 7.0.2, and local forks in `packages/`).

## Components

| Component | Purpose |
| --- | --- |
| Skill `bun-doctrine` | Bun-only rules: commands, native API substitutions, conventions, server and test gotchas, fork contribution rules, autonomous-execution rules. |
| Skill `bun-docs-router` | Where to look and what to read: installed `.d.ts`, docs on disk (`packages/bun/docs`), `bun_docs_*` MCP tools, online. Page map of the 336-page corpus. |
| Skill `typescript7-bun` | The native compiler (Corsa), options removed in 7.0, tsconfig for Bun, `bun-types` for TypeScript 7.1, differences from TypeScript 6, TypeScript repository workflow. |
| Skill `bun-upstream` | Bun fork upstream sync (`scripts/bun_upstream_sync.ts`), branch topology, fork architecture. |
| Agent `bun-docs-researcher` | Read-only research: answers from version-matched sources with citations, keeps documentation dumps out of the main context. |
| Agent `node2bun` | Node-to-Bun migration pipeline on an explicit project root (baseline, scoped fixes, gates, report). |
| Hook `SessionStart` | Injects a compact doctrine and toolchain versions when the session starts in a Bun project. Informational: it never blocks a tool call. |

## Single source of truth

Each fact lives in one place; the other components point to it.

| Information | Lives in |
| --- | --- |
| Bun-only rules, API substitutions, conventions, server and test gotchas | `skills/bun-doctrine` (`SKILL.md`, `references/api-substitutions.md`, `references/server-gotchas.md`) |
| Fork build, test and review rules | `skills/bun-doctrine/references/fork-contribution.md` |
| Fork architecture, crate suffixes, vendored libraries, branch topology, upstream sync | `skills/bun-upstream` |
| Documentation lookup order, size discipline, page map, MCP tool details | `skills/bun-docs-router` |
| TypeScript 7 behavior, removed options, tsconfig for Bun | `skills/typescript7-bun` |
| Node-to-Bun migration run | agent `node2bun` |

## Installation

```bash
claude --plugin-dir /home/aphro/yolo/plugins/bun-ts7
```

Requirements: `bun` on `PATH` for the hook (it exits silently otherwise).

Two manifests describe the plugin and carry the same name, version and description: `.claude-plugin/plugin.json` (Claude Code) and `plugin.json` at the root (Antigravity format).

## Session hook

`hooks/scripts/session-context.ts` runs at session start. It looks for `bun.lock`, `bun.lockb`, `bunfig.toml`, or `packageManager` / `engines.bun` in `package.json`, from the working directory up to five parents. If none is found it prints nothing. Otherwise it injects about 8 lines: versions of `bun`, `typescript` and `bun-types`, the doctrine summary, and (inside a Bun source checkout) one more line with the fork build and test rules.

The command runs from the plugin directory with `--no-install --no-env-file`, so Bun never loads the project's `bunfig.toml` or its `.env`.

Silence it with `BUN_TS7_CONTEXT=off`. Test it directly:

```bash
echo '{"cwd":"/home/aphro/yolo"}' | CLAUDE_PLUGIN_ROOT=/home/aphro/yolo/plugins/bun-ts7 bun --no-install --no-env-file run plugins/bun-ts7/hooks/scripts/session-context.ts
```

## Design notes

- The Bun docs and the Bun fork's internal skills are referenced, never copied: the docs corpus is about 1.95 MB and changes with every Bun release. Facts quoted in the skills were checked against the fork docs (Bun 1.4.3, commit `49c076eb`, 2026-10-02) and `bun-types` 1.4.2; behaviors found only in the docs are marked **docs only** in the references.
- No guard hook is shipped. The doctrine relies on the rules in `bun-doctrine` section 9.
- Plugin files are in technical English. The repository is private.

## Layout

```
bun-ts7/
├── .claude-plugin/plugin.json
├── plugin.json
├── agents/{bun-docs-researcher,node2bun}.md
├── hooks/hooks.json
├── hooks/scripts/session-context.ts
└── skills/
    ├── bun-doctrine         SKILL.md, references/{api-substitutions,server-gotchas,fork-contribution}.md
    ├── bun-docs-router      SKILL.md, references/page-map.md
    ├── bun-upstream         SKILL.md, references/fork-architecture.md, scripts/auto_sync.sh
    └── typescript7-bun      SKILL.md, references/{corsa-changes,typescript-submodule}.md, examples/tsconfig.bun.example.jsonc
```
