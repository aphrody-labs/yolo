<!-- SPDX-License-Identifier: Apache-2.0 -->
# Yolo — runtime repository instructions

## Mission

Read [PLAN.md](PLAN.md), [MEMORY.md](MEMORY.md), [vendoring](docs/VENDORING.md)
and [tooling](docs/TOOLING.md) for the selected task.
Yolo produces the precompiled native runtime and SDK; Aphrody consumes them and
keeps product logic. The architectural authority is [Aphrody PLAN](../aphrody/PLAN.md).
A phase is done when its acceptance command in PLAN.md passes; state what was and was not run.

This repository is distinct from the global YOLO automation plugin and the
Aphrody `crates/infra/yolo` CLI. Naming does not authorize changes to either.

## Integration contracts

- Use the Bun fork as application execution host; expose explicit native APIs.
- Integrate selected Tauri capabilities/plugins behind the runtime contract.
- Stage Obscura's JavaScriptCore port; preserve V8 until required parity passes.
- System WebViews retain platform engines. Do not promise one JS engine everywhere.
- External native consumers use a versioned C ABI/light SDK, not internal engine
  Rust types. Define ownership, release, cancellation, callbacks and threading.
- Keep context permissions, origins and session isolation. Never expose privileged
  Bun APIs implicitly to remote/headless pages.
- Preserve panic recovery at real artifact boundaries. Do not force incompatible
  engine profiles into one workspace or rely on per-package panic overrides.
- Prefer existing capability owners; isolated native workers require a stated
  isolation purpose, not a substitute subprocess implementation.

## Source and fork workflow

Preserve `vendor.toml`, `vendor.lock` and current reproducible import tooling.
Submodule committed revisions are source inputs. `vendor` is generated history;
integration behavior belongs on `dev`. Follow VENDORING for update commands.
Keep fork `main` as upstream mirror and fork `yolo` for owned changes. No force push.
Cargo packages use `aphrody-*`; library names, dependency keys, binary names,
`links`, permission IDs, command IDs and platform identifiers remain contracts.
Preserve upstream versions and notices. Names must not change runtime identity
implicitly. No manual engine copy into Aphrody and no upstream clone for research.
Bun and Obscura may retain separate workspaces/build graphs under one distribution.

## Work, builds and checks

Work autonomously on the current authorized branch. Check scoped Git status,
claim disjoint paths in `.coord` for concurrent edits and preserve others' work.
Use one integrating committer per batch. Do not create branches/worktrees for
routine shared work; the existing vendor workflow is a specific documented case.
Use Workspace/Infra and capability-owner CLIs; check their advertised help before
assuming commands. Keep global sccache and reusable caches.

Follow owner manifests and `just --list`. Use the existing build factory for
heavy work; serialize Cargo with the supported integrating owner. Workers never
start Cargo builds, checks, tests, benches or rustdoc. Do not launch parallel engine
builds or bypass resource policy. Scope expensive checks to the changed surface.

For Rust changes use appropriate check/test/strict Clippy gates; for Bun/TS use
typecheck, oxlint/oxfmt and relevant bun tests. Validate import changes with the
existing reproducibility checks. Documentation-only work uses links, whitespace,
archive hashes and mdBook as applicable, without engine compilation.
Distinguish source, build, runtime behavior, packaging, installation and activation.
No claimed speedup or compatibility without reproducible evidence.

## Privacy and delivery

Keep repositories private, source notices intact and secrets in existing private
stores. Preserve datasets, models, databases and caches. GitHub releases are cut from `main` by `vX.Y.Z` tag
(owner authorization of 2026-10-03, see docs/DISTRIBUTION.md); package registries (crates.io, npm) are published only
when the owner runs or asks for `just publish-*-run`, since a registry publication cannot be undone.
UI applicative M3 et Web : réside désormais canoniquement dans le monorepo Aphrody (`packages/ui/app-ui`, `crates/ui/*`). L'ancien checkout séparé aphrody-ui a été consolidé.
Use `aphrody-dev <contact@aphrody.com>` for author and committer; no assistant
attribution, coauthor trailers or AI bots/apps added to repositories.
Commit completed owned batches and push to the existing authorized remote.
Archive superseded decisions; never label historical plan results as proof of
new runtime phases. Keep the memory concise and point to canonical plans.
