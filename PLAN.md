<!-- SPDX-License-Identifier: Apache-2.0 -->

# Yolo — plan: a native runtime that installs and deploys in one command

Owner direction, 2026-10-03 (revised the same day): remove the limits of the previous plan and design everything to
be **deployable and installable with one command, like Bun**. The earlier plan treated publication, distribution and
most phases as closed or unqualified; this one makes them the goal. A phase is finished when its acceptance
command passes, nothing else is required to call it done.

The [Aphrody plan](../aphrody/PLAN.md) keeps the cross-repository architecture; this file owns what Yolo ships.
[docs/DECISIONS.md](docs/DECISIONS.md) records the choices, [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) the mechanics.

## What a user gets

```bash
curl -fsSL https://github.com/aphrody-labs/yolo/releases/latest/download/install.sh | bash
yolo create my-app && cd my-app && bun install && bun run dev      # server + runtime + web, supervised
bun run build:bin && bun run pack:deploy                            # one archive, no Bun/Rust on the server
```

- **One installed unit**: `~/.yolo` holds the `yolo` executable (Bun embedded), the verified native runtime artifact
  with rollback, the SDK, the stack templates and the Rust sources for the desktop scaffold.
- **One scaffold**: `yolo create` builds a Bun server (Rust-based Bun, `bun:sqlite`, SSE, native cancellable work),
  optionally a Bun-bundled web page, a Tauri 3 desktop shell and a Hono/Elysia variant, all pinned by
  `templates/stack.toml`.
- **One deployable**: the server compiles to a single executable and packs with the runtime library, a launcher and a
  systemd unit; a Dockerfile wraps the same archive.
- **One update path**: `yolo upgrade`, `yolo runtime rollback`, `yolo doctor`, `yolo uninstall`.

## Layers

| Layer        | Provider                                                   | Surface                                                                                      |
| :----------- | :--------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| Host         | Bun fork (`vendor/bun`), preload plugin                  | `runtime:*` modules, `bun build --compile` with the SDK bundler plugin                       |
| Runtime      | `crates/yolo-runtime`                                      | Versioned C ABI 1.x: system, process supervision, HTTP probe, cancellable work               |
| SDK          | `packages/runtime`                                              | `@aphrody/runtime-sdk`: loader with ABI negotiation, artifact verification, install/rollback |
| Desktop      | `crates/aphrody-*` (Tauri 3 alpha, wry, tao, plugins)      | `yolo create --with desktop`; `runtime:desktop`                                              |
| Headless     | Obscura (`vendor/obscura`)                               | `runtime:browser`                                                                            |
| Distribution | `scripts/release/release*.ts`, `install.sh/.ps1`, release workflow | Assets for five targets, checksums, installers                                               |
| Consumers    | Aphrody applications                                       | Light SDK dependency, product logic stays in Aphrody                                         |

Engines (Bun, Obscura) keep their own build graphs and are combined at distribution level; every artifact that crosses
the C ABI is built with an unwinding profile so panics become statuses. Names that are contracts (library names,
dependency keys, `links`, permission and command ids) never change with the `aphrody-` package prefix.

## Delivery

| Phase | Deliverable                                                                       | Acceptance                                                            |
| :---- | :-------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| R0    | C ABI runtime, SDK, artifact packaging                                            | `just runtime-test`                                                   |
| R1    | Host: `runtime:system`, `runtime:process`, bundler plugin                         | `bun test test/runtime_sdk.test.ts`                                  |
| R2    | Process supervision service and the agent-browser consumer patch                  | `docs/CONSUMERS.md` procedure, package tests green                    |
| D0    | Standalone `yolo` executable, installer, release assets for the host              | `YOLO_RELEASE_DIR=… sh install.sh && yolo doctor`                     |
| D1    | Release workflow for five targets, merged assets, `yolo upgrade`                  | tag `vX.Y.Z` publishes the release; `yolo upgrade --check`            |
| D2    | Server deploy: compile, pack, run elsewhere                                       | `bun run build:bin && bun run pack:deploy`, run the extracted archive |
| R3    | Desktop adapter: windows, events, permissions, shutdown through `runtime:desktop` | pilot app opens a window and quits cleanly                            |
| R4    | Headless variant with Obscura on its current engine                               | agent-browser consumer navigates, extracts, renders                   |
| R5    | JavaScriptCore backend for Obscura                                                | the browser suite passes on the new backend                           |
| R6    | V8 removed from the promoted profile                                              | consumer suites pass without V8                                       |
| D3    | Desktop bundles (`.deb`, AppImage, `.msi`, `.dmg`) from the scaffold              | `cargo tauri build` output installs and starts                        |
| D4    | Crates and npm packages published under the `aphrody-*` / `@aphrody/*` names      | `just publish-dry` clean, then published                              |
| R8    | Measurements (startup, native-call latency, memory, build time) and signing       | reproducible benchmark report per target                              |

Status is tracked by the acceptance commands, not by prose: R0, R1, R2 (patch), D0 and D2 pass on the development
host (see [DISTRIBUTION](docs/DISTRIBUTION.md) for exactly what was run); D1 is written and runs in CI on a tag; the
rest are the work queue, in this order: D1 on a first tag, R3, R4, D3, D4, R5/R6, R8.

## Working rules

Heavy builds (Tauri, Obscura, V8, Bun) go through the Aphrody build factory; this repository builds the light runtime
and the CLI locally. Imports of the forks stay reproducible (`vendor.toml`, `vendor.lock`, branch `vendor`). Releases are
cut from `main` by tag; `dev` integrates. Commits are authored by `aphrody-dev` without assistant attribution. No
speedup is stated without a reproducible measurement.
