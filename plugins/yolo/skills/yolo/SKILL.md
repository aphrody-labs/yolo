---
name: yolo
description: "Unified autonomous execution (NHITL) with Bun-first engine & TypeScript 7.0.2 compiler doctrine. Modes: single, grind, perfect loop, plan."
metadata:
  version: "1.0.0"
  author: "aphrody-code"
  license: "Apache-2.0"
---

# YOLO — Unified Autonomous Execution Runtime

Universal Non-Human-In-The-Loop (NHITL) autonomous developer runtime.

## Core Rules & Gates

1. **NHITL Contract**: Approvals are never awaited from humans. Technical gates (bun test, tsc --noEmit, oxlint, cargo check) are strictly verified.
2. **TypeScript 7.0.2 Baseline**: Type-checking is strictly delegated to `tsc --noEmit` (Corsa engine). Tsconfig must define `"types": ["bun"]`.
3. **Bun Native Stack**: Zero external npm dependencies when native Bun primitives exist (`Bun.file`, `Bun.write`, `Bun.serve`, `bun:sqlite`, `Bun.hash`, `Bun.Glob`).
4. **Docs Indexing**: Version-matched Bun documentation is generated from `vendor/bun/docs` (335 MDX files indexed).

## Modes

- `single` (`/yolo <item>`): Complete implementation, verification gates and commit.
- `grind` (`/yolo-grind`): Up to 4 disjoint subagents in parallel with batched commit.
- `perfect` (`/yolo-perfect-grind`): Continuous execution until 0 tasks remain and all gates are green.
- `plan` (`/start`): Sequential execution of project plan.
