<!-- SPDX-License-Identifier: Apache-2.0 -->
# Yolo — plan producteur

Décision propriétaire : 2026-10-03. Livrer un runtime natif Bun/Tauri/Obscura,
un SDK léger et un CLI autonome, installables et déployables en une commande.

L'[architecture Aphrody](../aphrody/PLAN.md) possède les contrats communs,
le workflow no-human-in-the-loop et les critères globaux.
[AGENTS.md](AGENTS.md) fixe les règles Yolo ; [MEMORY.md](MEMORY.md) conserve
les preuves producteur. Les applications et R7 appartiennent à Aphrody.

## Livraison cible

Une installation sous `~/.yolo` : CLI avec Bun embarqué, runtime vérifié,
SDK, templates et rollback. Un scaffold fournit serveur/web/desktop avec pins
dans `templates/stack.toml` (frontend `web` ou `react` : React 19 et composants Material 3
sur le bundler HTML de Bun). Le serveur distribué fonctionne sans Bun/Rust
installés sur la cible. Install, upgrade, doctor, rollback et uninstall sont qualifiés.

| Composant | Propriétaire source |
| --- | --- |
| Hôte Bun et preload | `vendor/bun`, plugin `runtime:*` |
| Runtime C ABI | `crates/yolo-runtime` |
| SDK | `packages/runtime` |
| Desktop | `crates/aphrody-*`, Tauri/Wry/Tao/plugins retenus |
| Headless | `vendor/obscura`, moteur actuel avant parité JSC |
| Distribution | `scripts/release/`, `install.sh`, `install.ps1` |

## Jalons uniques

| Phase | Livrable et gate de fermeture | État daté |
| --- | --- | --- |
| R0 | ABI/SDK/packaging : runtime/core tests et Clippy strict, artefact vérifié | Tranche ABI 1.4 qualifiée Linux x64 |
| R1 | `runtime:system`/`runtime:process` : tests SDK, erreurs/annulation/lifetime | Tranche actuelle qualifiée |
| R2 | Supervision partagée : tests Web Aphrody, groupe Unix, capture binaire bornée | Consommateur migré ; descendants Windows ouverts |
| D0 | CLI/installer : installation et doctor | Preuve Linux antérieure ; requalification release courante ouverte |
| D1 | Release cinq cibles : hashes, install/upgrade/rollback, santé | Non qualifiée sur toute la matrice |
| D2 | Serveur : compile/pack, exécution de l'archive sur cible | Preuve antérieure ; requalification courante ouverte |
| R3 | Desktop : fenêtre rendue, événements, refus de droits, annulation, arrêt | Ouvert ; module réservé |
| R4 | Headless : navigation, DOM, capture, contextes isolés dans la distribution | Ouvert ; module réservé |
| D3 | Bundles desktop : installation et démarrage par cible | Ouvert |
| D4 | Packages : dry-run et publication dans le périmètre explicitement autorisé | Publication registre non autorisée par ce plan seul |
| R5 | Backend JSC : cas difficiles et suite browser requise | Ouvert |
| R6 | Retrait V8 : mêmes contrats consommateur sans ancien backend | Dépend de R5/parité |
| R8 | Gains et signature : mesures reproductibles froid/chaud par cible | Ouvert |

Les résultats et limites exacts sont uniquement dans [MEMORY.md](MEMORY.md)
et les reçus liés. Metadata check ne qualifie ni exécution ni packaging.

## Ordre d'exécution

1. Désigner l'hôte de fabrique et y pointer `config/build-factory.json` d'Aphrody :
   le `vps` n'en est plus un (voir Build et release).
2. Acquisition/distribution native avec SDK épinglé ; requalifier D0/D2,
   installer/upgrade/rollback et release privée courante.
3. R3 puis R4 avec leurs propriétaires ; D3 dès qualification desktop.
4. Compléter D1 : Linux x64/ARM64, Windows x64, macOS x64/ARM64 ;
   descendants Windows via ownership qualifié.
5. R5/R6 puis R8 ; D4 seulement dans son autorité explicite.

Exécuter sans confirmation intermédiaire dans le périmètre autorisé, avec gates
et livraison de chaque lot. Checkouts existants uniquement ; aucun clone/copie
de travail pour vérification. Ne pas repartir sur un audit global.

## Build et release

Moteurs lourds via la fabrique Workspace/Infra ; runtime léger et CLI locaux
selon les gates propriétaires. Cargo sérialisé et sccache conservé.
Imports reproductibles : `vendor.toml`, `vendor.lock`, workflow
[VENDORING](docs/VENDORING.md). `dev` intègre ; `main` reçoit les releases par tag.
Préserver notices, révisions et identités compatibles.

Fabrique (2026-10-03, décision propriétaire) : le `vps` est un hôte d'exécution
seulement (nginx, docker, bases, secrets, services déployés). Toolchains Rust/Bun,
agents et `/srv/aphrody-build` y ont été retirés ; `/srv` occupe tout le disque `sdb`.
`yolo ship` ne construit donc plus tant qu'aucun hôte de fabrique n'est désigné ;
les déployables D2 n'ont besoin d'aucune toolchain sur la cible.

Avant chaque lot, `yolo verify` exécute les gates locaux en graphe parallèle et
écrit un rapport JSON/Markdown dans `var/verify/` ; les gates lourds y sont listés
non exécutés. `yolo ship` refuse sous le plancher d'espace libre de l'hôte, une
variable (`--min-free`, `YOLO_MIN_FREE`, `[space] min_free`, défaut 0,2) que
`yolo host audit` signale aussi ; `yolo host space` donne le gain réel d'une suppression.

[Distribution](docs/DISTRIBUTION.md) décrit le propriétaire release/fabrique.
Sa disponibilité se vérifie lors du lot, sans supposer un ancien statut CI actuel.
Dépôts privés ; source, tests, artefact, installation et activation sont distincts.

## Références

- [Contrat ABI](docs/RUNTIME-ABI.md)
- [Packaging et consommateurs SDK](docs/CONSUMERS.md)
- [Décisions détaillées](docs/DECISIONS.md)
- [Commandes et gates](docs/TOOLING.md)
- [Serveur, espace disque et plancher](docs/SERVER.md)
- [Rapport de stack 2026-10](docs/STACK-REPORT-2026-10.md)
- [Architecture Agent-First & Maturation Stack](docs/STACK-DECISION.md)
