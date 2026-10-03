<!-- SPDX-License-Identifier: Apache-2.0 -->
# Yolo — mémoire factuelle

Relevé : 2026-10-04. [PLAN.md](PLAN.md) possède les jalons ;
[plan Aphrody](../aphrody/PLAN.md) possède architecture et workflow autonome.

| Livraison | Preuve | Limite |
| --- | --- | --- |
| ABI 1.4 | `01300fb2f935` : capture binaire bornée sans troncature silencieuse, workers joints, arrêt du groupe Unix après sortie leader, guards SDK | Descendants quittant le groupe hors ownership ; Windows child direct seulement |
| Capacité partagée | `0ade1c71ccb5` : 32 slots SDK pour processus/probes | Pas qualification globale desktop/headless |
| Gates natifs | 31 tests runtime/core, Clippy strict ; Linux x64 exécuté | Windows x64, macOS x64/ARM64, Linux ARM64 : metadata checks seulement |
| SDK packaging | `27403350547d` : sources SDK commitées et LICENSE, hash/provenance, conflits/symlinks refusés ; ancien patch consommateur retiré | Aucun build moteur ni activation produit |
| Gates packaging | 4 tests/16 assertions, TypeScript, lint strict et format | Suite 168 pass antérieure aux derniers guards ; composant rerun ensuite |
| Templates | `4596954` : `yolo create --with react` (React 19, `@aphrody/material-web` via `@lit/react`, bundler HTML Bun ; `build:bin` en `NODE_ENV=production`). Fork create-tauri-app : `516da1d` vanilla-ts sur `Bun.serve`/`Bun.build`, `c7692bb` yew 0.23 | Rendu vérifié dans Chromium 157 headless seulement ; WebViews système, `tauri dev/build`, `trunk` non exécutés |
| Espace disque | `6b3d315`, `ed7ab7e` : `yolo host space` (gain réel par inode, liens physiques compris), scan récursif parallèle ; plancher variable appliqué par `audit` et `ship` (`dfdf8cc`) | 79 000 fichiers en local : ~200 ms sériel, ~120 ms parallèle 8 ; latence SSH et refus `ship` sur disque plein non exécutés |
| Gates locaux | `313bc40` : `yolo verify`, rapport `yolo.verify/1` dans `var/verify/` | Ici 13,1 s sériel, 4,2 s parallèle ; clippy, nextest, `cargo deny` et runtime natif listés non exécutés |
| Agent-First & MCP/API | `yolo scan` (wyhash composite), `yolo mcp` (stdio MCP 2024-11-05), `yolo api` (REST OpenAPI 3.1), protocoles `--json` et `--md` généralisés sur toutes les commandes (`status`, `parse`, `bench`, `docs`, `doctor`, `scan`, `version`), runner `./bin/yolo` ; 225 tests unitaires passés en 4,9 s, gates `yolo verify` en 5,7 s (speedup 2,5x) | FFI et supervision locale qualifiés ; agents distants et transport SSE temps réel ouverts |
| Élévation & Privilèges (NHITL) | `9f320c3` : détection POSIX via `libc::geteuid`, sonde `sudo -n`, enveloppement Unix ; 4 tests Bun/8 assertions requalifiés | Deux tests dans privilege, neuf dans le cœur entier ; exécution Rust/Clippy/MSVC non requalifiée. Sondes synchrones sans timeout ; aucune preuve de latence zéro. Windows utilise `net session`, sans token/UAC, et retourne la commande inchangée |
| A2A Coordination & Fédération | `355b423` : `ai.json`, `.coord` ignoré ; CLI résout les six IDs `shenron`, `codex`, `agycli`, `claude`, `ocr`, `rag` | URLs nulles ; aucun listener local sur 8788 observé ; résolution ne prouve ni raccordement, ni broadcast, ni santé des pairs |
| Windows 11 / WSL | Windows 11 build 28000 : Rust/Cargo 1.99.0 et Bun 1.4.2 exécutés ; Visual Studio Build Tools localisé via vswhere ; WSL Ubuntu 24.04 avec `appendWindowsPath=false` | Versions/installations seulement ; builds et exécution runtime Windows non requalifiés |
| Requalification locale | Dix gates de `yolo verify` passent sur `7e545c549c54` ; kernel actif via MCP, 14 sous-systèmes et 166 outils WinClean observés | Gates lourds non exécutés ; `shell status` affiche des constantes et ne prouve pas un bridge actif ; Nushell installé 0.116.0 |
| Archives présentes | Quatre entrées de `dist/release/0.1.0/SHA256SUMS` vérifiées | Manifest : commit `ee1a466528fd`, ABI 1.3 ; ces assets antérieurs ne qualifient pas HEAD ni ABI 1.4 |

Runtime Linux x64 installé localement via le propriétaire release :
ABI 1.4, révision native `0ade1c71ccb5`,
SHA-256 `ae14394bcfb291b9da4a4aa79acdcac2193f30966ae5672f02adf9f6b3ec695e`.
SDK : archive `c81812ea`, source `27403350547d36ef208068df929bc4e2eeb22218` ;
pin consommateur dans [Aphrody config](../aphrody/config/sibling-checkouts.json).

Reçus : [ABI/lifetime](docs/runtime-lossless-2026-10-03.json),
[capacité](docs/runtime-shared-capacity-2026-10-03.json),
[SDK packaging](docs/runtime-sdk-acquisition-2026-10-03.json).
Les preuves antérieures D0/D2 et leurs révisions sont dans
[DISTRIBUTION](docs/DISTRIBUTION.md), pas une qualification de la release courante.
Consommateur : [mémoire Aphrody](../aphrody/MEMORY.md).

Hôte `vps` (2026-10-03, décision propriétaire) : exécution seulement. `/` = `sda1`
(290 Gio, 30 Gio utilisés, réserve root 1 %) ; `/srv` = `sdb1` (305 Gio ext4 `data`,
une seule partition, montée par UUID). Conservés : `/etc` (nginx, letsencrypt, secrets),
Postgres 18 et redis (arrêtés avant l'intervention), volume docker `stack_meilidata`, `/root`,
`~/.ssh`, `~/.config`, `~/bxc-crawls`, `~/preserved` (SQLite et secrets extraits).
Retirés : toolchains, agents, dépôts, Shenron, jeu Steam, `/srv/aphrody-build`, `/mnt/backup`.
Cassés par conception : `aphrody-discord-dev` (bun retiré) et `yolo ship` vers `vps`.
Rapport de stack 2026-10 : suivis 1 à 3 faits, 4 (cible linux-arm64) ouvert.

Desktop/browser restent réservés. JSC/parité V8, distribution cinq cibles,
Job Objects, activation complète et gains mesurés restent ouverts.
Mémoire fichier uniquement ; aucune mémoire fournisseur synchronisée.

Requalification et corrections : [fact-check du 2026-10-04](docs/FACT-CHECK-2026-10-04.md),
[reçu](docs/fact-check-2026-10-04.json). Les anciens résultats restent des preuves datées.
