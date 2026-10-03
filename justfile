# YOLO Monorepo — Unified Justfile
# Bridges Cargo (Rust), Bun (TS7/Native), and Just orchestrator

set shell := ["bash", "-l", "-c"]

default: status

# Status & Diagnostics
status:
    @echo -e "\033[1;36m=== YOLO Monorepo Status ===\033[0m"
    @bun run apps/cli/src/index.ts status
    @echo -e "\n\033[1;36m=== Submodules ===\033[0m"
    @bun run scripts/vendor/packages_upstream_sync.ts
    @echo -e "\n\033[1;36m=== Cargo Workspace ===\033[0m"
    @cargo check --message-format=short

# Quality gates & verification
check: typecheck lint fmt-check rust-fmt-check clippy
    @echo -e "\033[1;32m[OK] Quality gates passed\033[0m"

typecheck:
    bun x tsc --noEmit

lint:
    oxlint scripts/ test/ packages/ apps/cli/src/ apps/web/src/

fmt:
    oxfmt --write scripts/ test/ packages/ apps/cli/src/ apps/web/src/

fmt-check:
    oxfmt --check scripts/ test/ packages/ apps/cli/src/ apps/web/src/

# Rust formatting. Each vendored crate carries the rustfmt.toml of its upstream repository.
rust-fmt:
    cargo fmt --all

rust-fmt-check:
    cargo fmt --all --check

# Clippy is enforced on our own crates only; vendored crates keep their upstream lint level.
clippy:
    cargo clippy -p yolo-core -p yolo-desktop --all-targets -- -D warnings

# Licenses, advisories, sources (cargo-deny, policy in deny.toml)
deny:
    cargo deny check

test:
    bun test test/

# Rust tests of the default workspace members (cargo-nextest)
test-crates:
    cargo nextest run --no-fail-fast

test-all: test test-crates

# Applications
cli *args:
    bun run apps/cli/src/index.ts {{args}}

web-build:
    cd apps/web && bun run build

web-dev:
    cd apps/web && bun run dev

desktop-build: web-build
    cargo build -p yolo-desktop

desktop-dev: web-dev

desktop-tauri-check:
    cargo check -p yolo-desktop

# Install the forked Tauri CLI (`cargo tauri`) from crates/aphrody-tauri-cli
install-cli:
    cargo install --path crates/aphrody-tauri-cli --locked

# Autonomous Code Generation Engine (from Bun upstream)
generate:
    bun run apps/cli/src/index.ts generate

# Native runtime (docs/RUNTIME-ABI.md): the artifact uses the `runtime` profile (unwinding panics)
runtime-build:
    cargo build --profile runtime -p yolo-runtime

runtime-test: runtime-build
    cargo test -p yolo-runtime -p yolo-core
    bun run scripts/release/runtime_artifact.ts
    bun test test/runtime_sdk.test.ts test/runtime_release.test.ts

# dist/runtime/<target>/: library + C header + manifest (target, toolchain, ABI, revisions, hashes)
runtime-package: runtime-build
    bun run scripts/release/runtime_artifact.ts

# Install the packaged artifact (verified, versioned, previous kept) and roll back
runtime-install: runtime-package
    bun run scripts/release/runtime_release.ts install

runtime-rollback:
    bun run scripts/release/runtime_release.ts rollback

# Producer-owned archive of the TypeScript SDK for consumers outside this workspace
runtime-sdk-pack:
    bun run scripts/release/runtime_sdk_pack.ts

runtime-list:
    bun run scripts/release/runtime_release.ts list

# Browse aphrody-labs/awesome-bun (README cached in .cache/awesome): just awesome search react
awesome *args:
    bun run apps/cli/src/index.ts awesome {{args}}

# Scaffold an Aphrody stack project: just create ../my-app --with web,desktop --framework hono
create *args:
    bun run apps/cli/src/index.ts create {{args}}

# Re-audit and re-curate awesome-bun for the Rust-based Bun (network): templates/AWESOME.md + JSON
awesome-curate:
    bun run apps/cli/src/index.ts awesome curate

# Vendoring of the forks into crates/aphrody-* (see docs/VENDORING.md)
import-scan:
    bun run apps/cli/src/index.ts import --scan

# Dry run of the import
import:
    bun run apps/cli/src/index.ts import

# The `vendor` branch lives in a worktree: it only ever receives generated imports.
vendor-worktree:
    @test -d .cache/vendor/.git -o -f .cache/vendor/.git || git worktree add .cache/vendor vendor

# Fails if crates/ differs from a fresh import of the pinned submodule commits
import-check: vendor-worktree
    bun run apps/cli/src/index.ts import --check --out .cache/vendor

# Re-import the submodules on `vendor`, then merge it into the current branch
vendor-update: vendor-worktree
    bun run apps/cli/src/index.ts import --apply --out .cache/vendor
    # -f: nested upstream .gitignore files must not hide imported files
    git -C .cache/vendor add -A -f -- crates examples docs vendor.lock
    git -C .cache/vendor diff --cached --quiet || git -C .cache/vendor commit -m "vendor: update crates from the pinned submodule commits"
    git merge vendor

# Documentation (mdBook)
docs-build:
    mdbook build docs

docs-serve:
    mdbook serve docs --open

# Fetch the upstream branches of every fork (no merge); then run `just vendor-update`
upgrade-latest:
    @echo -e "\033[1;36m=== Fetching upstream commits of the forks ===\033[0m"
    @git submodule update --init --recursive
    @cd vendor/bun && git fetch upstream main --depth=100 && git checkout yolo && git merge --ff-only upstream/main || true
    @cd vendor/obscura && git fetch origin main --depth=50 && git checkout yolo && git merge --ff-only origin/main || true
    @cd vendor/tauri && git fetch upstream v3 --depth=50 || git fetch origin v3 --depth=50 || true
    @cd vendor/plugins-workspace && git fetch upstream v3 --depth=50 || git fetch origin v3 --depth=50 || true
    @cd vendor/create-tauri-app && git fetch upstream dev --depth=50 || git fetch origin dev --depth=50 || true
    @cd vendor/wry && git fetch upstream dev --depth=50 || git fetch origin dev --depth=50 || true
    @cd vendor/tao && git fetch upstream dev --depth=50 || git fetch origin dev --depth=50 || true
    @echo -e "\n\033[1;36m=== Upgrading Bun to latest ===\033[0m"
    @bun upgrade || true
    @echo -e "\n\033[1;36m=== Upgrading global JS tooling ===\033[0m"
    @bun add -g typescript@latest oxlint@latest oxfmt@latest @types/bun@latest
    @echo -e "\n\033[1;36m=== Upgrading local workspace dependencies ===\033[0m"
    @bun update
    @cd apps/web && bun update
    @echo -e "\033[1;32m[OK] Upstream fetched. Merge it in the forks, then run: just vendor-update\033[0m"

# Cleaning
clean:
    -git worktree remove --force .cache/vendor
    rm -rf .cache *.log var target dist apps/web/dist
    @echo -e "\033[1;32m[OK] Workspace cleaned\033[0m"

# Publishing (dry-run by default; real publish needs explicit *-run recipes)
publish-crates-dry:
    cargo publish --workspace --exclude aphrody-tauri-runtime-cef --exclude 'aphrody-turbo*' --exclude 'aphrody-next*' --exclude aphrody-auto-hash-map --exclude aphrody-swc-ast-explorer --dry-run --allow-dirty

publish-crates-run:
    cargo publish --workspace --exclude aphrody-tauri-runtime-cef --exclude 'aphrody-turbo*' --exclude 'aphrody-next*' --exclude aphrody-auto-hash-map --exclude aphrody-swc-ast-explorer

publish-npm-dry:
    bun run scripts/vendor/publish_forks.ts

publish-npm-run:
    bun run scripts/vendor/publish_forks.ts --publish

publish-dry: publish-crates-dry publish-npm-dry
