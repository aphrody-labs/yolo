#!/usr/bin/env bash
# Run the repository's Bun upstream sync (scripts/bun_upstream_sync.ts) from the repository root.
# Arguments are passed through: with none the script only analyzes; --apply fetches, merges and
# pushes origin/main, origin/google and origin/aphrody.
# The root is WORKSPACE_ROOT, else the superproject when called from inside the packages/bun
# submodule, else the git root of the current directory.
set -euo pipefail

root="${WORKSPACE_ROOT:-}"
if [ -z "$root" ]; then
  root="$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)"
fi
if [ -z "$root" ]; then
  root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fi

if [ -z "$root" ] || [ ! -f "$root/scripts/bun_upstream_sync.ts" ]; then
  echo "scripts/bun_upstream_sync.ts not found (root: '${root:-none}'): run from the repository root or set WORKSPACE_ROOT" >&2
  exit 1
fi

cd "$root"
exec bun scripts/bun_upstream_sync.ts "$@"
