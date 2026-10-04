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

Autonomie CLI (2026-10-04) : `e65a36d59c9c` embarque scan, parse, MCP et API ;
six tests compilent le binaire bytecode et l'exécutent sans Bun dans le PATH.
Upgrade hors réseau vérifie les hashes avant l'installateur. Onze gates locaux
passent sur `f7855a572b90` avec les corrections Python et les commandes du lot
`4fe098e` présentes dans l'arbre. Ce résultat ne compile pas le runtime courant.

Synchronisation (2026-10-04) : service utilisateur `aphrody-source-sync` actif,
trois dépôts seulement, push normal des commits vers main et file de builds SSH
par SHA. Le watcher a poussé les commits Python en attente et de nouveaux commits
Yolo/Aphrody ; son redémarrage conserve le même worker Yolo. Le VPS possède de
nouveau les toolchains sondées ; préparation récursive des sous-modules et
contrôle Cargo restent en cours derrière le verrou partagé. Aucun build courant
achevé n'est déduit de la file. Reçu : [commit-sync](docs/commit-sync-2026-10-04.json).

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


## Gestionnaire unifié — première tranche (2026-10-04)

Le jalon encore ouvert du GOAL §3 possède maintenant un propriétaire Bun
`packages/core/src/pm` : plan de manifestes/locks puis synchronisation explicite
Bun/uv/Cargo avec les binaires globaux. Cargo reste sérialisé par Aphrody ; les
processus sont supervisés par le runtime natif installé ABI 1.4,
source `0ade1c71ccb5`. Sept tests/39 assertions exécutent réellement les trois
outils sur des projets temporaires, préservent les locks et annulent un
téléchargement HTTP local bloqué. `yolo mcp` expose `yolo_package_sync` et un
appel stdio réel, sans newline terminale, retourne un preflight prêt/non appliqué.

Le lot core préalable compte 134 tests réussis/0 échec, 18 fichiers ; TypeScript,
oxlint strict, format et whitespace passent. La suite générale du checkout
concurrent compte 411 pass, 20 skip et deux échecs de compilation déjà présents
avant ce lot : top-level await du benchmark de supervision dans les tests
standalone/installer. Ces fichiers concurrents restent préservés.

Le gestionnaire complet reste ouvert : add/remove/update, acquisition des outils,
sélection des moteurs et autres cibles n'ont pas été qualifiés. Redis conserve
une mémoire hors ligne volatile et KNN exact O(N) ; Gemma qualifie des transports
HTTP locaux, pas des poids, un tokenizer numérique ou un entraînement.
Preuves : [gestionnaire et lot core](docs/package-manager-2026-10-04.json).

Sources livrées dans `1494e008d1aa` et poussées normalement sur `origin/dev`.
`origin/main` vérifié au même commit par le suivi natif ; fabrique encore en préparation/file, aucun résultat de build déduit.

## Arbitrage crates et vendors (2026-10-04)

L’audit des manifestes recense 117 crates directes : deux cœur, deux adaptateurs
propres optionnels, 54 imports desktop et 59 imports compilateur. Les huit vendors
restent épinglés. Décision : absorber les contrats communs dans le cœur Yolo,
produire les moteurs comme fournisseurs optionnels et garder le produit Aphrody.
Les quatre modules Bun `runtime:*` existent ; VFS/GPU et l’adaptateur compilateur
restent proposés. Les 48 racines Cargo par défaut restent à réduire ; aucune
modification du manifeste concurrent ni qualification R3/R4 n’est déduite.

Deux graphes Obscura avec patches différents existent encore dans Yolo/Aphrody.
Leur déduplication exige réconciliation et qualification des consommateurs.
[Décision détaillée](docs/CORE-MODULE-BOUNDARIES.md) et
[recensement avec provenance](docs/core-module-boundaries-2026-10-04.json).

Validation : 117 hashes de manifestes, 18 fichiers de preuve et 71 liens locaux
conformes ; gates natifs `whitespace,docs` réussis. L’appel CLI `verify --help`
a déclenché toute la suite (option non traitée) : deux tests et `rust-fmt` échouent
dans le checkout concurrent. Ce lot documentaire ne les corrige pas et ne
revendique aucune qualification globale ni compilation moteur.

## Profils natifs et mesure initiale (2026-10-05)

Les 117 membres Cargo restent présents ; les racines par défaut passent de 48
à `yolo-core` et `yolo-runtime`. Ce socle d’interopérabilité ne remplace pas le
vrai cœur Bun. Recettes et CI séparent cœur, desktop, browser, Python,
compilateur et imports. Le wrapper Cargo conserve sérialisation et sccache.
L’aide `verify` n’exécute plus les gates ; les arguments invalides sont refusés
avant effets. Le benchmark de supervision compile dans le CLI autonome.

Qualification locale du checkout concurrent : 37 tests Rust, check, Clippy
strict et format cœur réussis ; les 11 gates du CLI source passent. Le format
global rapporte encore 103 fichiers Obscura, préservés et couverts par une gate
upstream explicite. Les cinq tests de dispatch Just/80 assertions ne prouvent
pas un build moteur. Aphrody conserve son consommateur runtime ABI 1.4 déjà
qualifié ; 14 tests/55 assertions passent. Son aide installée peut désormais
être capturée pour un seul binaire, sans parcourir ses sous-commandes.
[Reçu du lot](docs/core-modules-implementation-2026-10-05.json).

La mesure appariée de 40 lancements par série donne, en conditions préparées,
0,753 ms de médiane pour `bun --version`, 11,646 ms pour l’ancien Yolo installé
et 9,298 ms pour le lanceur source. Avec une sortie identique, le surcoût médian
apparié de Yolo installé est de 8,989 ms. Processus neufs, cache OS non contrôlé,
binaire installé antérieur de révision source inconnue : ni le fork reconstruit
ni une fenêtre desktop ne sont qualifiés. L’outil a trois tests/136 assertions,
types/lint/format conformes. [Mesure et provenance](docs/startup-baseline-2026-10-05.json).

Directive propriétaire précisée : conserver JSC/WebKit, supporter V8 via
Obscura, Tauri en plugin desktop et WebView embarquée partagée, améliorer les
builds React/Next 16, puis empaqueter l’application dans un fichier Bun. Les
sous-processus existants restent des transitions, pas l’absorption demandée.
Le linker natif du fork et la sélection des sources de fabrique sont les lots
suivants. Le 4 octobre à 22:21 UTC, la préparation SSH distincte attend toujours
un fetch M3 sous verrou ; l’ancien job watcher est en échec. Le nightly Bun
requis manque au VPS, aucun nouveau binaire fork n’a été produit ou installé.

La fondation est livrée dans `d26eee678144` ; `origin/dev` et `origin/main`
vérifiés à ce SHA. Aphrody livre l’aide ciblée et les contrats JSC/V8 dans
`adec4dd67`, poussé sur son remote `workspace`.

Le fork Bun porte maintenant `cf4e249669` : les directives natives Linux
des `build.rs` atteignent son linker Clang final, avec dépendances Ninja,
exclusion des proc-macros hôte et absence de double liaison des archives déjà
embarquées dans les rlibs. Cinquante-trois tests/128 assertions passent ; une
petite bibliothèque partagée est réellement compilée, liée et exécutée via
la réponse produite. Types du build-driver et lint strict passent. Cinq fichiers
passent le format ; la divergence antérieure de `timings.ts` reste identique.
Le test porte sur le build-driver TS, pas un moteur Bun reconstruit.
[Preuve et hashes](docs/bun-native-link-2026-10-05.json).

Le chemin commun des buffers ABI transmet désormais le `Vec` d’origine, sans
le convertir en slice réallouée. Son pointeur, sa longueur utile et sa capacité
restent ceux de l’allocateur propriétaire jusqu’à `yolo_buffer_free`. Les cinq
nouveaux tests couvrent transfert, capacité excédentaire, buffers vides et
libération ; 42 tests cœur/runtime et check/Clippy strict/format passent avec
Cargo sérialisé. Le SDK Bun copie encore les octets avant libération et la
capacité inutilisée reste allouée jusque-là : aucun gain RAM global ni artefact
installé n’est revendiqué. [Preuve native](docs/native-buffers-2026-10-05.json).

## Doublon de budget Turbopack et sources de fabrique (2026-10-05)

Le fork Next `d2f222004293` place les sémaphores de concurrence/démarrage dans
l’état partagé du pool de workers. Deux interfaces de même répertoire/point
d’entrée réutilisent ce propriétaire ; une limite incompatible échoue sans
allouer un deuxième budget. Le module de production exact a cinq tests exécutés,
compilation et Clippy strict avec rustc/Tokio précompilés compatibles, sous le
verrou commun ; aucune copie ni moteur factice. Les deux tests du registre et
check/test/Clippy du crate entier restent à exécuter en fabrique. Le générateur
importe ce patch dans `vendor` (`cb27145`), fusionné dans `dev`, et `vendor.lock`
est cohérent avec le gitlink Next. [Preuve et limites](docs/turbopack-worker-pool-2026-10-05.json).

Aphrody `62a8934c4` ajoute `build-factory prepare|plan|run --submodules` et propage
le périmètre aux jobs durables. La sélection vérifie le commit parent et la
fermeture récursive choisie, conserve les autres sous-modules et les verrous,
et ne prétend pas qualifier tout le dépôt. Quarante-deux tests/402 assertions,
types/lint/format passent. Yolo propose `just factory bun <sha>` avec
`vendor/bun`, préflight du nightly épinglé et vrai build release `-j2` ; neuf
tests/100 assertions qualifient le routage, pas la compilation du moteur.

À 22:38 UTC le 4 octobre, l’ancienne préparation M3 conserve le verrou lourd
depuis environ 1 h 50 ; aucun nouveau build n’est lancé en concurrence. Le
checkout Bun du VPS reste ancien et son nightly requis absent. Ni addon
Turbopack complet, ni fork Bun reconstruit, ni réduction globale de RAM,
ni fusion de tous les moteurs/dépendances ne sont qualifiés par ces lots.

## AI vector owner 2026-10-05

Redis et Gemma utilisent le même module pur `packages/core/src/math/vectors.ts` ;
les exports Gemma restent compatibles. Le bundle Redis vérifié ne contient plus
le graphe Gemma. 38 tests/452 assertions passent, ainsi que TypeScript core,
oxlint strict et oxfmt ciblés. Aucun changement numérique ni gain runtime mesuré.
[Preuve et limites](docs/ai/vector-owner-2026-10-05.md). Aucun build Rust ni
modification des chemins desktop/runtime concurrents dans ce lot.

## AI adapters — 2026-10-05

Schemas, validation, contexts and execution moved from MCP to the common
capability registry. MCP remains a compatibility protocol adapter; HTTP/OpenAPI
and `yolo ai list|call` use the same owner. `yolo_ai_infer` delegates to the
existing configured provider with cancellation. 135 core tests/1544 assertions
and 43 focused tests/198 assertions pass (overlap); root/core TypeScript and
scoped strict lint/format pass. [Contracts and limits](docs/ai/shared-adapters-2026-10-05.md).
No installed binary, persistent MCP restart, model weights or Rust build.
