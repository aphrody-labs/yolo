<!-- SPDX-License-Identifier: Apache-2.0 -->
# Yolo — current runtime memory

Owner direction, 2026-10-03: build a native precompiled runtime from the Bun fork
with Tauri and Obscura, and sharply reduce Aphrody's routine compilation cost.

- [PLAN.md](PLAN.md) owns producer milestones; [Aphrody PLAN](../aphrody/PLAN.md)
  owns the cross-repository architecture.
- Runtime/SDK live here; application behavior remains in Aphrody. First prove one
  native capability consumed without compiling the heavy engines.
- C ABI/light Rust SDK is the stable boundary. Precompiled rlibs do not guarantee
  cross-version Rust ABI compatibility.
- Stage JavaScriptCore convergence for Obscura; keep V8 until required parity.
  Native WebViews keep platform engines. Preserve unwind where recovery needs it.
- Preserve the Tauri vendor/import workflow and runtime identities while package
  names use aphrody-*. Separate build graphs can produce one unified distribution.
- Implementation phases R0–R8 remain unqualified by this documentation change.
  No runtime build, deployment or performance result is claimed here.
- 2026-10-03: `yolo ship` became this repository's CI and release host (GitHub Actions has no
  billing to run on); see [PLAN.md](PLAN.md) for the current per-phase status and
  [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) for the last verified commit. This line, not the
  one above it, is current; it is kept for the history, not as a standing claim.
- The earlier Rust scan covers Aphrody only and is a lexical navigation aid;
  its profile statements and dependency inventory require scoped verification.
- Keep repositories private, commits owner-authored and existing consumers intact
  until replacement/rollback qualification. The automation plugin named YOLO is
  a separate component, not this runtime repository.
- First R0 slice (C ABI `yolo-runtime`, SDK `packages/runtime`, `just runtime-package`) lives in
  [docs/RUNTIME-ABI.md](docs/RUNTIME-ABI.md); the artifact uses the unwinding `runtime` profile.
- 2026-10-03: Stack report recorded in [docs/STACK-REPORT-2026-10.md](docs/STACK-REPORT-2026-10.md) (Decision D27):
  Dioxus 0.7 for Rust full-stack apps in Tauri; EU bare-metal (OVH fleet + Hetzner auction) + Cloudflare
  for hosting (PaaS avoided due to 2026 RAM price surge); React 19 + Material 3 web components
  (`@aphrody/material-web`) under Bun for UI.
