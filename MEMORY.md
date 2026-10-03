<!-- SPDX-License-Identifier: Apache-2.0 -->
# Yolo — mémoire factuelle

Relevé : 2026-10-03. [PLAN.md](PLAN.md) possède les jalons ;
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
