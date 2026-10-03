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
git tag v0.1.0 && git push origin v0.1.0                 # yolo ship publishes when it ships that tag (see note)
```

GitHub Actions is not currently available to this repository (account billing); `.github/workflows/{ci,release,
runtime}.yml` are written and correct but their runs do not start. Until that is resolved, `yolo ship` on the
Aphrody build factory is both the CI and the release host: `scripts/release/ship_remote.sh` runs the same gates,
and `scripts/release/publish_remote.sh` publishes the GitHub release when the shipped commit is the `v<VERSION>`
tag and `main` contains it ([TOOLING.md](TOOLING.md#building-and-releasing-yolo-ship)). A `vX.Y.Z` tag still needs an
explicit `yolo ship --apply --sha <tag-commit>` to publish; it is not pushed automatically on tag like the Actions
workflow would be.

## Verified

The linux-x64 target, through `yolo ship` on the Aphrody build factory (one target per run; the acceptance is the
`yolo/ship` commit status, reproducible with `scripts/release/smoke_remote.sh dist/release/<version>` on any
linux-x64 host): the gates of `ci.yml`, the runtime artifact and its tests, the release assets, then D0 (install
into an empty `HOME` from those assets, `yolo doctor`) and D2 (`yolo create` from the installed executable,
`bun install`, `tsc`, `bun test`, `build:bin`, `pack:deploy`, running the extracted archive with a minimal `PATH`
and no environment, answering `/health`). Last green: commit `bbe1522` (2026-10-03). Not run anywhere: the macOS,
Windows and Linux ARM targets, the Docker image, actually starting the generated systemd unit, and `install.ps1`
beyond a syntax check (`pwsh -Command '[scriptblock]::Create(...)'`) — there is no Windows host in this loop.
