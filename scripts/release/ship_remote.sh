#!/usr/bin/env bash
# Runs on the build factory host (behind the heavy lock, started by `yolo ship`): builds all of yolo.
# usage: ship_remote.sh <sha> <workspace> <artifact-dir>
set -uo pipefail
sha=$1; ws=$2; out=$3
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
export CARGO_BUILD_JOBS=$(nproc) CARGO_INCREMENTAL=0
command -v sccache >/dev/null && export RUSTC_WRAPPER=sccache
status() { echo "$1" > "$out/STATUS"; }
step() { status "running: $1"; echo "=== $1 ($(date -u +%FT%TZ))"; shift; "$@" || { status "failed: $1"; echo "FAILED"; exit 1; }; }
cd "$ws" || exit 1
step "toolchain bootstrap" bash "$ws/scripts/release/bootstrap_remote.sh"
export PATH="$HOME/.cargo/bin:$HOME/.bun/bin:/usr/lib/llvm-${YOLO_LLVM:-23}/bin:$PATH"
command -v sccache >/dev/null && export RUSTC_WRAPPER=sccache
step "bun install" bun install --frozen-lockfile
step "check (types, lint, format, clippy)" just check
step "runtime artifact" just runtime-build
step "tests (bun + nextest)" just test-all
step "release assets" bun run scripts/release/release.ts
cp -r dist/release "$out/" 2>/dev/null || true
echo "$sha" > "$out/SHA"
status "ok"
echo "OK $sha"
