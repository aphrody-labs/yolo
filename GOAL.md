<!-- SPDX-License-Identifier: Apache-2.0 -->
# GOAL — Yolo

Directive propriétaire du 2026-10-04, réécrite et vérifiée contre l'état réel du dépôt
(commandes citées en fin de document). Pendants : [Aphrody](../aphrody/GOAL.md) pour les produits
et [aphrody-py](../aphrody-py/GOAL.md) pour la surface Python IA/ML.

## 1. Rôle

Précision propriétaire du 2026-10-05 : **Yolo est un fork Bun orienté desktop**.
Le livrable final conserve le vrai cœur et les crates de Bun et intègre nativement
V8, Tauri, Obscura, Turbopack et uv. Réutiliser leurs sources/API réelles ; les
sous-processus et les imitations de Bun/uv ne constituent pas cette absorption.
Les fournisseurs peuvent être sélectionnés au build et initialisés à la demande
dans le processus. Le démarrage doit être comparable à Bun, avec preuves appariées
sur les mêmes parcours ; ni `--version` seul ni un petit wrapper ne qualifient
le démarrage d’une application desktop. Les deux crates Rust par défaut sont
le socle commun de qualification/interop, pas le remplacement du cœur Bun.

Précision complémentaire du même jour : conserver **JSC et WebKit**, ajouter la
compatibilité V8 à partir d’Obscura, et améliorer les builds React/Next 16 avec
les composants natifs existants. Tauri reste un plugin desktop ; Bun et ce plugin
doivent pouvoir partager le même fournisseur WebView embarqué. Wry utilise
aujourd’hui les moteurs système : un backend embarqué réel reste à implémenter
et qualifier. Obscura fournit le headless ; sa présence ne prouve pas une
implémentation Chromium complète. La cible de packaging est une application
desktop en un fichier Bun, sans qualifier par avance sa réalisation ni ses gains.

Yolo est la **bibliothèque partagée native d'Aphrody**, dans cet ordre de priorité :

1. **Unix et POSIX d'abord** ; Windows (MSVC) reste une cible de compilation croisée.
2. **Bun** : fork de Bun, `bun:ffi` et code amont de Bun réutilisés au maximum.
3. **Serverless.**
4. **Bibliothèque cœur** : OS, shell, HTTP, IA, avec un runtime unifié multiplateforme.
5. **CLI native et SDK MCP natif**, en Rust et en Bun.
6. **Compilateur d'interface natif**, compatible Turbopack, WASM, SWC, Rspack, Tailwind CSS et React Compiler.
7. **Gestion du monorepo** : forks, dépendances, déduplication et nettoyage automatique du code.

Langages (directive du 2026-10-04) :

- **CLI, MCP, API et UI de Yolo** : entièrement en Bun (Aphrody porte les mêmes surfaces en Rust).
- **IA, LLM, RAG et agents** : Rust, Bun et Python (uv) uniquement.
- **.NET, C++, C, Go et autres** : le meilleur outil pour le cas d'usage (installation, sources, CLI ou FFI).

## 2. Qualité du code

Les références sont :

- le style du noyau Linux amont, les standards de la GNU libc et de Bun ;
- `bun:ffi` et le code amont de Bun, réutilisés partout où ils couvrent le besoin ;
- le moins possible de dépendances externes.

Les chaînes de développement natives :

- **Python** : uv natif.
- **TypeScript** : Bun natif, dernière version de TypeScript.
- **Shell** : exécution native par Bun.
- **Compilation et compilation croisée** pour Rust, JS et Python :
  - MSVC et Visual Studio Build Tools 2026 ;
  - LLVM et Clang, Ninja, gcc ;
  - chaînes de build Debian et Ubuntu (GNOME) ;
  - MinGW ;
  - zig seulement si c'est vraiment nécessaire.
- **MSYS2 et Cygwin** : remplacés par des équivalents Rust natifs.

## 3. Moteurs commutables et gestion de paquets

- **Moteurs** : V8, JSC, Tauri et WebGPU sont des interrupteurs (variable d'environnement, configuration, binaire).
  - Yolo se compile avec ou sans V8, avec ou sans Tauri, avec ou sans WebGPU.
- **Bun et V8** : explorer Deno, Node, leurs dépendances runtime amont, bibliothèques partagées, issues, PR, forks et documentation.
  - Objectif : un patch V8 natif dans le fork Bun de Yolo, sur un fork V8 d'Obscura aux dépendances amont précises.
  - Modèle : le fork WebKit/JSC que Bun a patché et optimisé pour son code interne.
- **Gestionnaire de paquets unifié** dans le cœur de Yolo : Bun (`bun pm`, `bunx`, `bun add`), uv et Cargo, en natif.
  - Obscura, Turbopack, Tauri et les autres moteurs sont des paquets optionnels et interchangeables au build, au packaging, au lint et aux tests, comme dans un système POSIX.
- **Serverless** : Yolo transforme, lint, formate et compile RG et Shenron pour un hébergement serverless (Vercel, Fly.io, Docker ou Coolify après benchmark), en natif serveur et web selon les guides 2026.
- **Distribution Linux** : quand Yolo, Aphrody, Windows, WSL et les deux VPS sont prêts, recherche approfondie puis fork d'une distribution libre (Rust, Bun ou agents, noyau récent, compatible), pour exploiter son gestionnaire de paquets.

## 4. Exposition à Aphrody

- WASM et FFI au maximum, zéro copie, aucune duplication.
- Synchronisation des crates, paquets et applications communs avec Aphrody, ainsi que des documents, scripts, tests et de l'infra.
- Le VFS IEVR est chargé comme plugin Bun natif à travers cette bibliothèque partagée.

## 5. Ordre d'exécution et fin

1. Valider ce GOAL et celui d'Aphrody.
2. Effectuer un scan complet de `dev` et des sous-modules sur du code commité.
3. Compiler réellement :
   - sur l'usine SSH, une fois réprovisionnée ;
   - en WSL pour la vérification ;
   - sous Windows avec MSVC.
4. Mettre à jour ensuite seulement : README, plan, AGENTS.md, docs, scripts, configuration MCP et plugins.

## 6. État vérifié (2026-10-04)

| Élément | Constat | Source |
| --- | --- | --- |
| CLI | `yolo 0.1.0`, Bun 1.4.2, cible `x86_64-unknown-linux-gnu` ; la build Windows renvoie `x86_64-pc-windows-msvc` sous wine | `yolo version --json` |
| Crates | 117 : 47 Tauri, 29 Turbopack, 21 Turbo, 7 Next, 4 `yolo-*` (core, runtime, desktop, pyo3), tao, wry, swc… | `ls crates` |
| Paquets et apps | paquets `core`, `plugins`, `python`, `runtime` ; apps `cli`, `web` | `ls packages apps` |
| Sous-modules | `vendor/bun`, `vendor/obscura`, `vendor/tauri`, `vendor/plugins-workspace`, `vendor/create-tauri-app`, `vendor/wry`, `vendor/tao`, `vendor/next`, `plugins` | `.gitmodules` |
| Python | `packages/python` (uv, PyO3) | `ls packages/python` |
| Branche | `dev` synchronisée avec `origin/dev` ; le sous-module `plugins` est modifié | `git status -sb` |

## 7. Écarts et préalables

- **Tauri et GUI** : Yolo porte aujourd'hui les crates Tauri, wry et tao, alors que la directive place ce focus dans Aphrody.
  - Décider le propriétaire de ces sources avant de les déplacer ; Yolo garde les compilateurs d'interface.
- **Python** : `packages/python` est une liaison PyO3 du cœur ; la surface Python IA/ML appartient à `aphrody-py`.
- **Usine de compilation** : le VPS est runtime-only depuis le 2026-10-03, sans toolchains.
  - Décision du 2026-10-04 : les deux VPS seront réprovisionnés comme usine (compilation, VFS lourds, bases lourdes, IA sur CPU).
- **Moteurs commutables** : aucun interrupteur V8/Tauri/WebGPU n'existe encore au build ; le gestionnaire unifié Bun/uv/Cargo reste à écrire.
- **macOS** : compilation seulement, aucune exécution réelle.
