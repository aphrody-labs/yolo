# Architecture

Yolo produces the precompiled native runtime (C ABI `yolo_runtime`), its SDK, the `yolo` CLI and the
vendored Rust crates of the Tauri/Turbopack stack. Aphrody consumes the artifacts and keeps product logic.
The root layout mixes the four main forks (decision D25 in [docs/DECISIONS.md](docs/DECISIONS.md)).

```text
crates/       Rust workspace members. aphrody-* are generated from vendor/ by `yolo import`
              (Tauri, plugins, wry, tao, create-tauri-app, Next/Turbopack); yolo-* are owned here.
vendor/       Fork submodules pinned by commit: bun, obscura, tauri, plugins-workspace, wry, tao,
              create-tauri-app, next. Source inputs only; `main` mirrors upstream, `yolo` carries our changes.
packages/     JS packages. `runtime` is `@aphrody/runtime-sdk` (bun:ffi over the C ABI, runtime:* modules).
apps/         `cli` (the `yolo` executable) and `web` (frontend of the desktop shell).
templates/    `stack.toml` and the templates behind `yolo create`; curated awesome-bun lists.
examples/     Example applications (not vendored from upstream).
scripts/      vendor/ (upstream sync, fork publication) and release/ (release, runtime artifact, SDK
              archive, build-host entry point `ship_remote.sh`).
patches/      Patches proposed to consumers, with the evidence in docs/.
test/         Bun tests (Rust tests live in the crates).
docs/         mdBook sources.
```

Generated or local only (ignored): `target/`, `dist/`, `var/`, `.cache/` (the `vendor` worktree).

## Flows

- **Vendoring**: `vendor/<fork>` (committed revision) -> `yolo import` -> `crates/aphrody-*` on the `vendor`
  branch -> merged into `dev`. Integration changes are made on `dev` only ([docs/VENDORING.md](docs/VENDORING.md)).
- **Runtime**: `crates/yolo-runtime` -> artifact in `dist/runtime/<target>` -> `packages/runtime` loads it
  ([docs/RUNTIME-ABI.md](docs/RUNTIME-ABI.md)).
- **Release**: `scripts/release/release.ts` builds the five-target assets from a `vX.Y.Z` tag
  ([docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)).
- **Build host**: `yolo ship` fetches the pushed commit on the Aphrody build factory (git/`gh`, no
  rsync/rclone) and runs it as a systemd unit behind the heavy lock: the CI gates, the runtime
  artifact, the release assets and the D0/D2 install/deploy smoke, since GitHub Actions is not
  available to this repository ([docs/TOOLING.md](docs/TOOLING.md)).

## Boundaries

Bun and Obscura keep their own build graphs; the Next/Turbopack stack needs its pinned nightly and builds
only on the build factory. The engine profiles are not forced into one Cargo profile.
