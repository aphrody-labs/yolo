---
name: bun-upstream
description: This skill should be used when the user asks to "sync the Bun fork", "check Bun upstream drift", "run bun:sync", "run bun:drift-fix", "run bun:track", "rebase the fork on upstream/main", "reapply the Bun patches", "update the packages/bun submodule", or asks how the fork is laid out (crate prefixes such as *_jsc and *_sys, workspace profile, packages, vendored libraries, branch topology of main, google and aphrody).
version: 0.2.0
---

# Bun fork: upstream sync and architecture

Keep the Bun fork (`aphrody-labs/bun`, submodule `packages/bun` of the Gemini workbench) aligned with upstream `oven-sh/bun`, and navigate its source. Build, test and review rules for changing the fork are in the `bun-doctrine` skill (`references/fork-contribution.md`); this skill covers synchronization and layout.

## Branch topology (checked 2026-10-03)

- Remotes in the checkout: `origin` is `aphrody-labs/bun`, `upstream` is `oven-sh/bun`.
- `main` mirrors `upstream/main`.
- `google` is the branch the submodule is pinned to (`.gemini` records `branch = google` in `.gitmodules`). At the last fetch it equalled `upstream/main`.
- `aphrody` sits on top of `main` (3 commits ahead at the last fetch). It alone carries `APHRODY.md`, `bunfig.aphrody.toml` and `packages/aphrody-bun-runtime/` (the `@aphrody/bun-runtime` package), added by `patches/bun/0001-aphrody-bun-runtime-kernel.patch` of the workbench. None of these exist on `main` or `google`.

## Synchronization

All commands run from the workbench root and call `scripts/bun_upstream_sync.ts` (or `bun_upstream_tracker.ts`). Without `--apply` the script only analyzes.

| Command | Effect |
| --- | --- |
| `bun run bun:dry-run` | Read-only drift analysis (`--dry-run`): commit distances between `upstream/main`, `main`, `google` and `aphrody`. |
| `bun run bun:sync` | `--apply`: fetch, fast-forward `main` to `upstream/main` and **push `origin/main`**, fast-forward `google` and **push `origin/google`**, merge `main` into `aphrody` and **push `origin/aphrody`**, finish on `google`. |
| `bun run bun:drift-fix` | `--apply --auto-fix`: on a merge conflict into `aphrody`, take upstream's version (`checkout --theirs`) for `bun.lock`, `Cargo.lock` and files under `completions/`; abort the merge if anything else conflicts. |
| `bun run bun:track` | Report on upstream pull requests and issues. |
| `--reapply-patches` flag | After the merge, `git apply` every `patches/bun/*.patch` on a clean tree and commit. Not part of the package scripts: pass it to the script directly. |
| `scripts/auto_sync.sh` (in this skill) | Wrapper that runs the sync script from the workbench root (the git root, or `WORKSPACE_ROOT`) and passes its arguments through. |

## Rules

1. Run `bun run bun:dry-run` first and read the drift numbers before anything else.
2. `--apply` pushes three branches to `origin`, which is shared state. Run it only when the user asked for a sync, and name the pushes in the report. The script refuses to run when the submodule has uncommitted changes.
3. After a sync the submodule stays on `google`. Record the new gitlink in the workbench as its own deliberate commit, after the submodule commit is pushed; keep submodule commits pinned (workbench `AGENTS.md`).
4. Check which branch-naming rule applies before creating a branch in the fork: its `CLAUDE.md` requires a `claude/` prefix for its own CI, while the workbench keeps the submodule on `google`.
5. Never force-push; use `bun:drift-fix` rather than resolving lockfile conflicts by hand.

## Additional resources

- **`references/fork-architecture.md`** - workspace layout, crate suffixes (`*_jsc`, `*_sys`), packages, vendored libraries and the C++ class convention
- `bun-doctrine` skill - fork contribution rules (build, test, review)
- `bun-docs-router` skill - the fork's documentation corpus and its page map
