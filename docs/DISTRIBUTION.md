<!-- SPDX-License-Identifier: Apache-2.0 -->
# Distribution: one command to install, one archive to deploy

## Install

```bash
# public release assets
curl -fsSL https://github.com/aphrody-labs/yolo/releases/latest/download/install.sh | bash
# private repository (uses gh auth or GITHUB_TOKEN)
gh release download -R aphrody-labs/yolo -p install.sh -O - | bash
# Windows
irm https://github.com/aphrody-labs/yolo/releases/latest/download/install.ps1 | iex
```

The installer detects the target, downloads the release assets, **verifies SHA-256**, installs into
`~/.yolo` (`YOLO_HOME`), installs and verifies the runtime artifact, and puts `~/.yolo/bin` on `PATH`.
Variables: `YOLO_VERSION`, `YOLO_HOME`, `YOLO_REPO`, `GITHUB_TOKEN`, `YOLO_RELEASE_DIR` (offline install from a
local release directory), `YOLO_NO_CRATES`, `YOLO_NO_MODIFY_PATH`.

```text
~/.yolo/
  bin/yolo            standalone executable (Bun embedded, bun build --compile)
  runtime/<target>/   verified runtime artifacts: <version>-<hash8>/, current, previous (rollback)
  packages/runtime/   @aphrody/runtime-sdk (file: dependency of scaffolded projects)
  templates/          stack.toml, templates, curated awesome-bun
  crates/             aphrody-* Rust sources for the desktop scaffold
  VERSION
```

Then:

```bash
yolo doctor                 # installation check: runtime verified and loadable
yolo create my-app          # Bun server + runtime SDK + web   (--with web,desktop --framework hono)
cd my-app && bun install && bun run dev
yolo upgrade                # latest release, same installer;  yolo upgrade --check
yolo runtime rollback       # previous runtime artifact
yolo uninstall --yes
```

## Deploy

A scaffolded project compiles to one executable and packs into one archive that needs no Bun and no Rust on
the server:

```bash
bun run build:bin      # dist/<name>: the server compiled with Bun.build({ compile })
bun run pack:deploy    # dist/<name>-<target>.tar.gz: executable + runtime library + run.sh + systemd unit
```

`Dockerfile` and `DEPLOY.md` in the project describe the server side. Desktop bundles come from the Tauri crate
(`cargo tauri build` with the forked CLI, `just install-cli`).

## Release pipeline

`scripts/release/release.ts` (per target) builds `yolo-<version>-<target>.tar.gz` (executable, runtime artifact, SDK, templates,
icons), `yolo-<version>-crates.tar.gz`, the installers, `SHA256SUMS` and `release.json`;
`scripts/release/release_merge.ts` merges the per-target directories. `.github/workflows/release.yml` runs both for the five
targets on a `vX.Y.Z` tag and publishes the GitHub release. The version is `VERSION`.

```bash
just runtime-package && bun run scripts/release/release.ts       # local release for this host in dist/release/<version>/
YOLO_RELEASE_DIR=dist/release/0.1.0 sh install.sh        # install it from disk
git tag v0.1.0 && git push origin v0.1.0                 # CI builds all targets and publishes
```

## Verified

On the development host (Linux x64, 2026-10-03): the install into an empty `HOME` from the local release directory,
`yolo doctor`, a re-install over an existing install (runtime history kept), `yolo create` from the installed
executable followed by `bun install`, `bun test`, `tsc` and the dev server, `cargo check` of the desktop scaffold
against the installed crates, and `build:bin` + `pack:deploy` + running the extracted archive with a minimal
`PATH` and no environment. Not run here: the macOS, Windows and Linux ARM jobs, `install.ps1`, the Docker image and
the systemd unit.
