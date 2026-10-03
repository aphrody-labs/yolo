#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# D0 and D2 acceptance from freshly built release assets, on the build host:
#   D0  install.sh into an empty HOME from the release directory, then `yolo doctor`;
#   D2  `yolo create` with the installed executable, the scaffold's typecheck and tests, `build:bin` and
#       `pack:deploy`, then the extracted archive runs with no Bun, no HOME and a minimal PATH and answers /health.
# usage: smoke_remote.sh <release-dir>
set -euo pipefail
rel=$(cd "$1" && pwd)
work=$(mktemp -d /tmp/yolo-smoke.XXXXXX)
pid=""
cleanup() {
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT INT TERM
export HOME="$work/home" YOLO_NO_MODIFY_PATH=1
mkdir -p "$HOME"
unset YOLO_HOME

echo "--- D0: install from $rel into an empty HOME"
YOLO_RELEASE_DIR="$rel" sh "$rel/install.sh"
yolo="$HOME/.yolo/bin/yolo"
"$yolo" doctor

echo "--- D2: scaffold, check, compile, pack"
cd "$work"
"$yolo" create smoke-app
cd smoke-app
bun install
bun x --bun tsc --noEmit
bun test
bun run build:bin
bun run pack:deploy
archive=$(ls dist/smoke-app-*.tar.gz | head -1)
mkdir -p "$work/srv"
tar -xzf "$archive" -C "$work/srv" --strip-components=1

echo "--- D2: run the extracted archive (no Bun, no HOME, minimal PATH)"
port=$((20000 + RANDOM % 20000))
env -i PATH=/usr/bin:/bin PORT="$port" "$work/srv/run.sh" > "$work/srv.log" 2>&1 &
pid=$!
for _ in $(seq 1 100); do
  curl -fsS "http://127.0.0.1:$port/health" > "$work/health.json" 2>/dev/null && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.2
done
if ! grep -q '"ok":true' "$work/health.json" 2>/dev/null; then
  echo "the deployed archive did not answer /health:"
  cat "$work/srv.log"
  exit 1
fi
echo "deployed archive answers http://127.0.0.1:$port/health -> $(cat "$work/health.json")"
