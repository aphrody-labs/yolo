#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Runs inside the tmux session `yolo ship` starts on the build host: serializes behind the heavy lock, then runs
# ship_remote.sh as a transient systemd unit with every kernel (cgroup v2) resource ceiling lifted for the build:
# full CPU share, no memory cap, no swap cap, no task or fd limit, protected from the OOM killer.
# usage: ship_unit.sh <sha> <workspace> <artifact-dir> <lock>
set -uo pipefail
sha=$1; ws=$2; out=$3; lock=$4
name="yolo-ship-${sha:0:12}"
user=$(id -un); group=$(id -gn)
echo queued > "$out/STATUS"
exec 9>"$lock"
flock 9
sudo -n systemctl stop "$name.service" 2>/dev/null || true
sudo -n /usr/bin/systemd-run --unit="$name" --collect --wait --pipe --quiet \
  --uid="$user" --gid="$group" --working-directory="$ws" \
  -p CPUWeight=10000 -p CPUQuota= -p IOWeight=10000 -p CPUSchedulingPolicy=batch \
  -p MemoryMin=0 -p MemoryLow=0 -p MemoryHigh=infinity -p MemoryMax=infinity -p MemorySwapMax=infinity \
  -p TasksMax=infinity -p LimitNOFILE=infinity -p LimitNPROC=infinity -p LimitMEMLOCK=infinity -p LimitCORE=0 \
  -p OOMScoreAdjust=-500 -p Delegate=yes \
  -- bash "$ws/scripts/release/ship_remote.sh" "$sha" "$ws" "$out" 2>&1 | tee -a "$out/ship.log"
rc=${PIPESTATUS[0]}
# a stopped unit exits 0 while ship_remote.sh never reached ok/failed: report it instead of leaving "running"
grep -qE '^(ok|failed)' "$out/STATUS" || echo "stopped: unit $name ended before the build finished" > "$out/STATUS"
echo "unit $name exited $rc" | tee -a "$out/ship.log"
exit "$rc"
