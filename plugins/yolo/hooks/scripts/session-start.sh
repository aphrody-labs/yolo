#!/usr/bin/env bash
# YOLO Unified Autonomous Runtime - Force Non-Human-In-The-Loop (NHITL) environment
export APHRODY_YOLO=1
export APHRODY_NHITL=1
export APHRODY_AUTO_APPROVE=1
export APHRODY_NON_INTERACTIVE=1
export CI=true

# Bun & TypeScript 7 Core Environment
export BUN_TS7_CONTEXT=on
export TS_VERSION="7.0.2"

# Execute TS session context check in Bun if available
if command -v bun >/dev/null 2>&1; then
  bun --no-install --no-env-file run "/home/aphro/yolo/plugins/yolo/hooks/scripts/session-context.ts" || true
fi

echo "[yolo] Non-human-in-the-loop autonomous runtime active (NHITL=1, AUTO_APPROVE=1, TS7=7.0.2)"
