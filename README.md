# Aphrody YOLO — Bun Fork Automation & Native Engineering Hub

Autonomous engineering workspace dedicated to maintaining Aphrody forks, upstream mirrors, TypeScript 7 Corsa, and Oxc tooling under strict native Bun runtime.

## Submodules & Repositories (`packages/`)

All repositories are managed via `.gitmodules` with encapsulation in `.git/modules/packages/`:

| Submodule | Tracking Branch | Upstream Source | Primary Role |
| :--- | :--- | :--- | :--- |
| [`packages/bun`](packages/bun) | `google` / `aphrody` | `oven-sh/bun` | High-performance Bun fork (`@aphrody/bun-runtime`, custom patches, fast-forward tracking) |
| [`packages/obscura`](packages/obscura) | `main` | `aphrody-labs/obscura` | Stealth CDP automation and browser engine in Rust |
| [`packages/oxc`](packages/oxc) | `main` | `oxc-project/oxc` | Rust JavaScript/TypeScript toolchain (`oxc-parser`, `oxc-transform`, isolated declarations) |
| [`packages/typescript`](packages/typescript) | `main` | `microsoft/TypeScript` | TypeScript 7 (Go-based native compiler Corsa & LS) |
| [`packages/vscode`](packages/vscode) | `main` | `microsoft/vscode` | Upstream VS Code mirror for component extraction & refactoring |

## Native Toolchain & Automation Engine

- **Runtime**: Native Bun (`bun >= 1.4.2`), zero Node.js runtime overhead.
- **Transpilation & AST**: In-process `oxc-parser` and `oxc-transform`.
- **Linter & Formatter**: Multithreaded Rust linting with `oxlint` and native formatting via `oxfmt`.
- **Type Checker**: TypeScript 7 Native compiler (`tsc --noEmit`).
- **Sync & Drift Engine**: [`scripts/bun_upstream_sync.ts`](scripts/bun_upstream_sync.ts) and [`scripts/packages_upstream_sync.ts`](scripts/packages_upstream_sync.ts).
- **Upstream PR Tracker**: [`scripts/bun_upstream_tracker.ts`](scripts/bun_upstream_tracker.ts) generating [`docs/BUN_UPSTREAM_TRACKER.md`](docs/BUN_UPSTREAM_TRACKER.md).

## Operational Commands

```bash
# Submodule and fork status across the 5 repositories
bun run status

# Fetch and inspect all 5 forks from remotes
bun run sync:all

# Analyze Bun upstream drift and re-integrate patches
bun run bun:sync

# Query oven-sh/bun GitHub API for upstream performance & stability PRs
bun run bun:track

# Linting, formatting and strict typecheck
bun run lint
bun run fmt:check
bun run typecheck
```
