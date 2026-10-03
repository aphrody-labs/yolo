<!-- SPDX-License-Identifier: Apache-2.0 -->
# Yolo

Producer of the precompiled native runtime, lightweight SDK and standalone CLI.
Aphrody owns product behavior. [PLAN.md](PLAN.md) defines delivery;
[MEMORY.md](MEMORY.md) records qualified artifacts and remaining limits.

## Install

Installers and private release access: [DISTRIBUTION](docs/DISTRIBUTION.md).
Verify the selected release and supported target before installation.

```sh
yolo doctor
yolo create my-app
cd my-app
bun install
bun run dev
```

Full desktop/headless integration and five-target distribution remain open.
No startup, build-time or zero-overhead gain is established by this README.

## Source owners

Layout and artifact flows: [ARCHITECTURE.md](ARCHITECTURE.md).
Pinned forks and import contracts: [VENDORING](docs/VENDORING.md).
Runtime boundary: [RUNTIME-ABI](docs/RUNTIME-ABI.md).
SDK consumer procedure: [CONSUMERS](docs/CONSUMERS.md).

## Development

```sh
just status
just generate
just web-build
just web-dev
just docs-build
```

[TOOLING](docs/TOOLING.md) owns the full command list and gates.
[AGENTS.md](AGENTS.md) owns serialized Cargo/factory rules and delivery identity.
Work in existing checkouts; preserve upstream notices and pinned identities.

Host operations: [SERVER](docs/SERVER.md), through Workspace/Infra.
No deployment or host mutation follows from documentation maintenance.
