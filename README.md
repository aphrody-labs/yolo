# Aphrody YOLO — Bun Fork Automation & Autonomous Monorepo

Autonomous engineering workspace dedicated to maintaining Aphrody forks, upstream mirrors, TypeScript 7, and Oxc tooling under a 100% native Bun runtime.

## Install

```bash
curl -fsSL https://github.com/aphrody-labs/yolo/releases/latest/download/install.sh | bash    # or: gh release download -R aphrody-labs/yolo -p install.sh -O - | bash
yolo doctor && yolo create my-app && cd my-app && bun install && bun run dev
```

One installer, one `~/.yolo`, one scaffold, one deploy archive: see [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) and
the [plan](PLAN.md).

## Monorepo Architecture (`crates/`, `vendor/`, `packages/`, `apps/`)

The repository operates as a unified **Cargo Workspace** and **Bun Workspace**:

### 1. Rust Crates (`crates/`)
- [`crates/yolo-core`](crates/yolo-core) : High-performance native Rust core providing cross-platform hardware detection, system metrics, and micro-benchmarking algorithms.
- [`crates/yolo-desktop`](crates/yolo-desktop) : Tauri 3 desktop application shell wrapping `crates/yolo-core` with direct native IPC.
- `crates/aphrody-*` : the Rust crates of the Tauri stack (Tauri 3 alpha, its plugins, wry, tao, create-tauri-app), generated from the fork submodules by `yolo import`. Package names carry the `aphrody-` prefix; library names are unchanged, so `use tauri::…` still works. See [docs/CRATES.md](docs/CRATES.md) for the full list and [docs/VENDORING.md](docs/VENDORING.md) for the workflow.

### 2. Fork Submodules (`vendor/`)
Active upstream forks are isolated, submodule-managed under `vendor/`, with dedicated `yolo` branches (their `main` mirrors the upstream). The Tauri-stack submodules are the pinned sources of `crates/aphrody-*`; `bun` and `obscura` stay standalone:

| Submodule | Active Branch | Upstream Source | Fork Target (`aphrody-labs`) | Primary Role |
| :--- | :--- | :--- | :--- | :--- |
| [`vendor/bun`](vendor/bun) | `yolo` | `oven-sh/bun` | `aphrody-labs/bun` | Upstream Bun repository (`bun-types`, native APIs, SIMD image/markdown engines, Tauri-aware types) |
| [`vendor/obscura`](vendor/obscura) | `yolo` | `aphrody-labs/obscura` | `aphrody-labs/obscura` | Stealth CDP automation and browser engine in Rust |
| [`vendor/tauri`](vendor/tauri) | `yolo` | `tauri-apps/tauri` | `aphrody-labs/tauri` | Tauri 3 core desktop engine (source of `aphrody-tauri*`, JS packages `@aphrody/api`, `@aphrody/cli`) |
| [`vendor/plugins-workspace`](vendor/plugins-workspace) | `yolo` | `tauri-apps/plugins-workspace` | `aphrody-labs/plugins-workspace` | Tauri plugins (source of `aphrody-tauri-plugin-*`, JS packages `@aphrody/plugin-*`) |
| [`vendor/create-tauri-app`](vendor/create-tauri-app) | `yolo` | `tauri-apps/create-tauri-app` | `aphrody-labs/create-tauri-app` | Scaffolding CLI (source of `aphrody-create-tauri-app`) |
| [`vendor/wry`](vendor/wry) | `yolo` | `tauri-apps/wry` | `aphrody-labs/wry` | WebView rendering library (source of `aphrody-wry`) |
| [`vendor/tao`](vendor/tao) | `yolo` | `tauri-apps/tao` | `aphrody-labs/tao` | Windowing library (source of `aphrody-tao`) |

### Wayland & Custom Compositor Architecture (WSLg)
- **Compositor Engine**: Native Rust Wayland compositor stack based on **Smithay** (pure Rust protocol toolkit) and **Niri** architecture for maximum zero-copy frame pacing.
- **Hardware Acceleration**: Automatic WebKitGTK / Wayland DMA-BUF bypass flags (`__NV_DISABLE_EXPLICIT_SYNC=1`, `WEBKIT_DISABLE_DMABUF_RENDERER=1`) enforced prior to GTK initialization in [`crates/yolo-desktop`](crates/yolo-desktop).
- **Pixel-perfect Pipeline**: End-to-end memory & network inspection via `aphrody n2b` with zero extraneous overhead.

### 3. Applications (`apps/`)
- [`apps/cli`](apps/cli) : Zero-dependency CLI powered 100% by native Bun (`Bun.file`, `Bun.Glob`, `Bun.hash.wyhash`, `Bun.TOML`) with an autonomous generator engine (`yolo generate`) that scans upstream Bun.
- [`apps/web`](apps/web) : Zero-overhead web and desktop frontend built with Bun and OXC in ~3 ms, rendering the self-generated Bun capability catalog and communicating with Tauri 3 via direct Rust IPC.

## Autonomous Generation Engine

YOLO features an autonomous generator that scans the cloned upstream Bun repository (`vendor/bun`) across all API domains:
- **Web Standards & Browser Parity** (`fetch`, `Response`, `Streams`, `WebSocket`, `crypto.subtle`)
- **Native HTTP Server & WebSockets** (`Bun.serve`, zero-copy routing, SSE streams)
- **React & JSX Engine** (`Bun.markdown.react`, JSX/TSX transpiler)
- **LightningCSS & Styling** (CSS nesting, `color-mix()`, `oklch()`, CSS modules)
- **Native Image Pipeline** (`Bun.Image`, SIMD resize, WebP/AVIF encoding, ThumbHash)
- **Structured Data** (`Bun.JSONL`, `Bun.TOML`, `Bun.XML`)
- **Markdown Engine** (`Bun.markdown.html`, `ansi`, `render`)

To trigger code extraction and catalog regeneration:
```bash
just generate
# or: yolo generate
```

## Operational Commands

```bash
# Workspace status across active forks and Cargo members
just status

# Autonomous code generation from upstream Bun
just generate

# Quality gates (TypeScript 7 + Oxlint)
just check

# Run all test suites (Bun + Cargo)
just test-all

# Build and dev Web & Desktop frontend
just web-build
just web-dev

# Build docs (mdBook)
just docs-build

# Vendoring of the fork crates into crates/aphrody-* (see docs/VENDORING.md)
just import-scan      # every manifest of the sources and whether it is imported
just vendor-update    # re-import from the pinned submodules on `vendor`, then merge it

# Sync Bun fork upstream
bun run bun:sync
```
