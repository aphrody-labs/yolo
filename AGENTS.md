<!-- SPDX-License-Identifier: Apache-2.0 -->
# Yolo — runtime repository instructions

## Mission

Read [PLAN.md](PLAN.md), [MEMORY.md](MEMORY.md) and selected owner docs.
Shared architecture/workflow: [Aphrody PLAN](../aphrody/PLAN.md).
Yolo produces runtime/SDK; Aphrody keeps product behavior.
This repo is distinct from the global YOLO automation plugin and Infra yolo CLI.

## Integration contracts

Use the versioned C ABI/light SDK, explicit ownership/cancellation/threading,
native permission/origin checks and qualified panic boundaries from the shared
plan. Preserve V8 until Obscura/JSC parity and system WebView engines.
Reuse owners; an isolated worker requires an actual isolation purpose.

## Source and fork workflow

[VENDORING](docs/VENDORING.md) owns imports. Preserve vendor.toml/vendor.lock,
pinned submodules, notices and source provenance. Generated history stays on
`vendor`; integration on `dev`; fork `main` mirrors upstream and `yolo`
holds patches. No force-push or upstream clone for research.

Cargo package prefixes do not rename library/dependency/binary/links/
permission/command/platform identities. Bun/Obscura retain compatible separate
build graphs. No engine source copied into Aphrody.

## Work, builds and checks

Execute authorized batches without intermediate confirmation on the existing
branch/checkout. Check Git and .coord, claim disjoint paths, preserve other
sessions, private stores and caches. No clean test clone or routine worktree.

Use native MCP/capability-owner tools and Workspace/Infra; verify live help and
[TOOLING](docs/TOOLING.md). Heavy engines use the factory. Integrator serializes
Cargo via Aphrody's supported wrapper with sccache/resource guards; workers do
not run Cargo. No parallel engine builds.

Rust: scoped check/test/strict Clippy. Bun: TypeScript, oxlint/oxfmt, tests.
Imports: reproducibility gates. Docs: links, whitespace, provenance/hash checks
and mdBook, without engine compilation. Repeat only after relevant changes or
unresolved failures. State failed/skipped gates and actual proof scope.

## Privacy and delivery

Repositories stay private. No secret/data/model content in source or receipts;
no AI bots/apps added. Commit completed owned batches as
`aphrody-dev <contact@aphrody.com>`, no assistant attribution; push only existing
authorized remotes. Do not stage other work or ignored outputs.

GitHub release authority and mechanics: [DISTRIBUTION](docs/DISTRIBUTION.md).
Registry publication requires explicit owner scope. Distinguish source, tests,
artifact, installation and activation. Performance requires measurements.

UI remains canonical in Aphrody. No new archive or dead fallback after qualified
migration; preserve legal records and historical evidence.
