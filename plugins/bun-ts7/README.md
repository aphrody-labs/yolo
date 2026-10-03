# bun-ts7

Bun-only doctrine, version-matched Bun documentation routing, TypeScript 7 guidance and Bun fork upstream sync for Claude Code. Built for the Gemini workbench (Bun 1.4.2, TypeScript 7.0.2, Bun fork in `packages/bun`) but usable in any Bun project.

## Components

| Component | Purpose |
| --- | --- |
| Skill `bun-doctrine` | Bun-only rules: commands, native API substitutions, conventions, server and test gotchas, fork contribution rules, autonomous-execution rules. |
| Skill `bun-docs-router` | Where to look and what to read: installed `.d.ts`, docs on disk, `bun_docs_*` MCP tools, online. Page map of the 336-page corpus. |
| Skill `typescript7-bun` | The native compiler (Corsa), options removed in 7.0, tsconfig for Bun, `bun-types` for TypeScript 7.1, differences from TypeScript 6, TypeScript repository workflow. |
| Skill `bun-upstream` | Bun fork upstream sync (`bun:*` scripts), branch topology, fork architecture. |
| Agent `bun-docs-researcher` | Read-only research: answers from version-matched sources with citations, keeps documentation dumps out of the main context. |
| Agent `node2bun` | Node-to-Bun migration pipeline on an explicit project root (baseline, scoped fixes, gates, report). |
| Hook `SessionStart` | Injects a compact doctrine and toolchain versions when the session starts in a Bun project. Informational: it never blocks a tool call. |

## Single source of truth

Each fact lives in one place; the other components point to it.

The four skills live in `config/skills/` of the workbench, the canonical custom-skill directory (workbench `AGENTS.md`), which Antigravity reads through `antigravity-cli/skills`. The plugin's `skills/<name>` entries are relative symlinks to them, so Claude Code and Antigravity share one copy. Claude Code resolves such symlinks (checked with a headless run on 2026-10-03). A copy-based install of the plugin (cache, marketplace) would not carry the link targets: load it in place with `--plugin-dir`. Edit the skills in `config/skills/<name>`.

| Information | Lives in |
| --- | --- |
| Bun-only rules, API substitutions, conventions, server and test gotchas | `skills/bun-doctrine` (`SKILL.md`, `references/api-substitutions.md`, `references/server-gotchas.md`) |
| Fork build, test and review rules | `skills/bun-doctrine/references/fork-contribution.md` |
| Fork architecture, crate suffixes, vendored libraries, branch topology, upstream sync | `skills/bun-upstream` |
| Documentation lookup order, size discipline, page map, MCP tool details | `skills/bun-docs-router` |
| TypeScript 7 behavior, removed options, tsconfig for Bun | `skills/typescript7-bun` |
| Node-to-Bun migration run | agent `node2bun` (loads the `n2b` skill of the `aphrody` plugin) |

## Installation

```bash
claude --plugin-dir /home/aphro/.gemini/plugins/bun-ts7
```

Requirements: `bun` on `PATH` for the hook (it exits silently otherwise). Optional: the `aphrody` plugin (`n2b`, `deploy` and `rust-bun` skills, `bun_docs_*` and `bun_node_equivalent` MCP tools from its `aphrody-kernel` server). This plugin declares no MCP server; without the `aphrody` plugin the skills and the researcher fall back to Grep/Read on the docs directories and to the web.

Two manifests describe the plugin and carry the same name, version and description: `.claude-plugin/plugin.json` (Claude Code) and `plugin.json` at the root (Antigravity format, as in the `aphrody` plugin). Change them together.

## Session hook

`hooks/scripts/session-context.ts` runs at session start. It looks for `bun.lock`, `bun.lockb`, `bunfig.toml`, or `packageManager` / `engines.bun` in `package.json`, from the working directory up to five parents. If none is found it prints nothing. Otherwise it injects about 8 lines: versions of `bun`, `typescript` and `bun-types`, the doctrine summary, and (inside a Bun source checkout) one more line with the fork build and test rules.

The command runs from the plugin directory with `--no-install --no-env-file`, so Bun never loads the project's `bunfig.toml` (a `preload` there would otherwise execute at session start) or its `.env`. The project directory comes from the hook input, then `CLAUDE_PROJECT_DIR`.

Silence it with `BUN_TS7_CONTEXT=off`. Test it by hand:

```bash
echo '{"cwd":"/home/aphro/.gemini"}' | (cd /tmp && CLAUDE_PLUGIN_ROOT=/home/aphro/.gemini/plugins/bun-ts7 bun --no-install --no-env-file run "$CLAUDE_PLUGIN_ROOT/hooks/scripts/session-context.ts")
```

Hooks load at session start: restart Claude Code after editing `hooks/hooks.json`.

## Design notes

- The Bun docs and the Bun fork's internal skills are referenced, never copied: the docs corpus is about 1.95 MB and changes with every Bun release. Facts quoted in the skills were checked against the fork docs (Bun 1.4.3, commit `49c076eb`, 2026-10-02) and `bun-types` 1.4.2; behaviors found only in the docs are marked **docs only** in the references.
- No guard hook is shipped. The doctrine, including the Node-to-Bun migration stages, relies on the rules in `bun-doctrine` section 9.
- Plugin files are in English, following the workbench `AGENTS.md`. The repository is private; there is no marketplace entry.
- Known overlap: the installed `aphrody` plugin also ships a `node2bun` agent and a `bun` skill (namespaced `aphrody:`). This plugin's `node2bun` is `bun-ts7:node2bun`. Keep one once the `aphrody` plugin split is finished.

## Merge history (2026-10-03)

- The `bun` skill, moved here from the `aphrody` plugin snapshot, was folded into `bun-docs-router` (MCP tool details, Aphrody corpus resolution) and `bun-doctrine` (the `rust-bun` pointer), then removed. Its rules table duplicated `bun-doctrine` section 2.
- `bun-upstream` (`config/skills/bun-upstream`, previously French with a description truncated by another agent) was translated to English, reduced to topology and synchronization (checked against `scripts/bun_upstream_sync.ts`, `.gitmodules` and the fork's branches), and its three reference files were merged into `references/fork-architecture.md`. Its documentation index was superseded by `bun-docs-router/references/page-map.md`: it listed pages that do not exist (`serve.md`, `streaming.md`, `mocking.md`, …). Its test conventions duplicated `fork-contribution.md`.
- Corrections made while merging: `js_parser_jsc` was missing from the `*_jsc` list; `packages/aphrody-bun-runtime` exists on the `aphrody` branch only; `vendor/` is absent from the workbench checkout; `bun:drift-fix` does not reapply patches (that needs `--reapply-patches`); `bun:sync` pushes three branches to `origin`.
- The four skills were then moved into `config/skills/` (one copy, linked from the plugin). `config/skills/bun`, another agent's copy of the `aphrody` `bun` skill, was removed as superseded by `bun-docs-router` and `bun-doctrine`.
- Originals remain in git: `HEAD:config/skills/bun-upstream/` (French) and `HEAD:config/plugins/aphrody/skills/bun/SKILL.md`.

## Layout

```
bun-ts7/
├── .claude-plugin/plugin.json
├── plugin.json
├── agents/{bun-docs-researcher,node2bun}.md
├── hooks/hooks.json
├── hooks/scripts/session-context.ts
└── skills/                  relative symlinks to ../../../config/skills/<name>
    ├── bun-doctrine         SKILL.md, references/{api-substitutions,server-gotchas,fork-contribution}.md
    ├── bun-docs-router      SKILL.md, references/page-map.md
    ├── bun-upstream         SKILL.md, references/fork-architecture.md, scripts/auto_sync.sh
    └── typescript7-bun      SKILL.md, references/{corsa-changes,typescript-submodule}.md, examples/tsconfig.bun.example.jsonc
```
