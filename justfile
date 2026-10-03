# YOLO Monorepo — Unified Justfile
# Bridges Cargo (Rust), Bun (TS7/Native), and Just orchestrator

set shell := ["bash", "-l", "-c"]

default: status

# Status & Diagnostics
status:
    @echo -e "\033[1;36m=== YOLO Monorepo Status ===\033[0m"
    @bun run scripts/packages_upstream_sync.ts
    @echo -e "\n\033[1;36m=== Cargo Workspace ===\033[0m"
    @cargo check --workspace --message-format=short

# Quality gates & verification
check: typecheck lint
    @echo -e "\033[1;32m[OK] Quality gates passed\033[0m"

typecheck:
    bun x tsc --noEmit

lint:
    oxlint scripts/ tests/ apps/cli/src/ apps/web/src/

fmt:
    oxfmt --write scripts/ tests/ apps/cli/src/ apps/web/src/

fmt-check:
    oxfmt --check scripts/ tests/ apps/cli/src/ apps/web/src/

test:
    bun test tests/

test-crates:
    cargo test --workspace

test-all: test test-crates

# Applications
cli *args:
    bun run apps/cli/src/index.ts {{args}}

web-build:
    cd apps/web && bun run build

web-dev:
    cd apps/web && bun run dev

desktop-build: web-build

desktop-dev: web-dev

desktop-tauri-check:
    cargo check --manifest-path crates/yolo-desktop/Cargo.toml

# Autonomous Code Generation Engine (from Bun upstream)
generate:
    bun run apps/cli/src/index.ts generate

# Documentation (mdBook)
docs-build:
    mdbook build docs

docs-serve:
    mdbook serve docs --open

# Upgrades & Toolchain freshness
upgrade-latest:
    @echo -e "\033[1;36m=== Upgrading Submodules & Forks to latest upstream commits ===\033[0m"
    @git submodule update --init --recursive
    @cd packages/bun && git fetch upstream main --depth=100 && git checkout yolo && git merge --ff-only upstream/main || true
    @cd packages/obscura && git fetch origin main --depth=50 && git checkout yolo && git merge --ff-only origin/main || true
    @cd packages/tauri && git fetch upstream dev --depth=50 || git fetch origin dev --depth=50 || true
    @cd packages/plugins-workspace && git fetch upstream v2 --depth=50 || git fetch origin v2 --depth=50 || true
    @cd packages/create-tauri-app && git fetch upstream dev --depth=50 || git fetch origin dev --depth=50 || true
    @echo -e "\n\033[1;36m=== Upgrading Bun to latest ===\033[0m"
    @bun upgrade || true
    @echo -e "\n\033[1;36m=== Upgrading Global CLI Tools (TSC, Oxlint, Oxfmt, Tauri 3, Types) ===\033[0m"
    @bun add -g typescript@latest oxlint@latest oxfmt@latest @tauri-apps/cli@3.0.0-alpha.4 @types/bun@latest
    @cargo install tauri-cli --version 3.0.0-alpha.4 --locked || true
    @echo -e "\n\033[1;36m=== Upgrading Local Workspace Dependencies ===\033[0m"
    @bun update
    @cd apps/web && bun update
    @echo -e "\033[1;32m[OK] All components & submodules upgraded to the absolute latest commits\033[0m"

# Cleaning
clean:
    rm -rf .cache *.log var target dist apps/web/dist crates/yolo-desktop/target
    @echo -e "\033[1;32m[OK] Workspace cleaned\033[0m"



# Publishing (dry-run by default; real publish needs explicit *-run recipes)
publish-crates-dry:
    cargo publish --dry-run --allow-dirty -p yolo-core

publish-crates-run:
    cargo publish -p yolo-core

publish-npm-dry:
    bun run scripts/publish_forks.ts

publish-npm-run:
    bun run scripts/publish_forks.ts --publish

publish-dry: publish-crates-dry publish-npm-dry
