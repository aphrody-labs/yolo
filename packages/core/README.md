# YOLO Core Library (`@aphrody/yolo-core`)

Unified native core library for YOLO, modeled directly after Bun's core architecture (`bun_core` + `src/js/internal` + `packages/bun-types`).

## Architecture

- **`yolo/sys`** (`./sys`): Low-level platform primitives, hardware statistics, sub-microsecond benchmarking, diagnostic probes (`doctor`), and zero-copy hashing (`wyhash`, `crc32`, `sha256`).
- **`yolo/vfs`** (`./vfs`): High-performance filesystem operations: parallel tree traversal with wyhash fingerprinting (`scanDirectory`), fast AST token analysis (`parseTsSource`), and path layout resolution.
- **`yolo/vendor`** (`./vendor`): Monorepo submodule tracker, `vendor.lock` verification, workspace `Cargo.toml` inspection, autonomous Bun upstream capability crawler, and crate importer.
- **`yolo/runtime`** (`./runtime`): Native C ABI 1.4 bridge to `yolo_runtime` cdylib, process supervisor, and readiness probes.
- **`yolo/verify`** (`./verify`): Quality gate graph scheduler, parallel worker execution, timing metrics, and structured reporting (`yolo.verify/1`).
- **`yolo/server`** (`./server`): Native HTTP / REST / OpenAPI 3.1 micro-server powered 100% by `Bun.serve`.
- **`yolo/mcp`** (`./mcp`): Model Context Protocol (MCP 2024-11-05) JSON-RPC 2.0 stdio server for AI agents.
- **`yolo/fleet`** (`./fleet`): Remote host fleet management, hardlink space accounting, and command safety engine.
- **`yolo/scaffold`** (`./scaffold`): Project template scaffolder, variable substitution, and feature layer injector.
- **`yolo/curation`** (`./curation`): Awesome repository curation and mass identifier renamer.
- **`yolo/coord`** (`./coord`): Sibling workspace coordination, advisory claim locks, and unit execution.
- **`yolo/distribution`** (`./distribution`): Artifact verification and release packaging.

## Design Principles

1. **Zero External Runtime Dependencies**: 100% pure native Bun APIs (`Bun.file`, `Bun.write`, `Bun.Glob`, `Bun.hash.wyhash`, `Bun.TOML`, `Bun.serve`).
2. **Agent-First**: Outputs are structured JSON with strict schemas (`yolo.scan/1`, `yolo.verify/1`, `yolo.status/1`, `yolo.doctor/1`) or GFM markdown.
3. **Recursive Outillage**: The CLI is a thin dispatcher over `@aphrody/yolo-core`; scripts and tools import the core library directly.
