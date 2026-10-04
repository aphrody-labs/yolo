<!-- SPDX-License-Identifier: Apache-2.0 -->
# GOAL — Yolo

Directive propriétaire du 2026-10-04, réécrite et vérifiée contre l'état réel du dépôt
(commandes citées en fin de document). Pendants : [Aphrody](../aphrody/GOAL.md) pour les produits
et [aphrody-py](../aphrody-py/GOAL.md) pour la surface Python IA/ML.

## 1. Rôle

Yolo est la **bibliothèque partagée native d'Aphrody**, dans cet ordre de priorité :

1. **Unix et POSIX d'abord** ; Windows (MSVC) reste une cible de compilation croisée.
2. **Bun** : fork de Bun, `bun:ffi` et code amont de Bun réutilisés au maximum.
3. **Serverless.**
4. **Bibliothèque cœur** : OS, shell, HTTP, IA, avec un runtime unifié multiplateforme.
5. **CLI native et SDK MCP natif**, en Rust et en Bun.
6. **Compilateur d'interface natif**, compatible Turbopack, WASM, SWC, Rspack, Tailwind CSS et React Compiler.
7. **Gestion du monorepo** : forks, dépendances, déduplication et nettoyage automatique du code.

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

## 3. Exposition à Aphrody

- WASM et FFI au maximum, zéro copie, aucune duplication.
- Synchronisation des crates, paquets et applications communs avec Aphrody, ainsi que des documents, scripts, tests et de l'infra.
- Le VFS IEVR est chargé comme plugin Bun natif à travers cette bibliothèque partagée.

## 4. Ordre d'exécution et fin

1. Valider ce GOAL et celui d'Aphrody.
2. Effectuer un scan complet de `dev` et des sous-modules sur du code commité.
3. Compiler réellement :
   - sur l'usine SSH, une fois réprovisionnée ;
   - en WSL pour la vérification ;
   - sous Windows avec MSVC.
4. Mettre à jour ensuite seulement : README, plan, AGENTS.md, docs, scripts, configuration MCP et plugins.

## 5. État vérifié (2026-10-04)

| Élément | Constat | Source |
| --- | --- | --- |
| CLI | `yolo 0.1.0`, Bun 1.4.2, cible `x86_64-unknown-linux-gnu` ; la build Windows renvoie `x86_64-pc-windows-msvc` sous wine | `yolo version --json` |
| Crates | 117 : 47 Tauri, 29 Turbopack, 21 Turbo, 7 Next, 4 `yolo-*` (core, runtime, desktop, pyo3), tao, wry, swc… | `ls crates` |
| Paquets et apps | paquets `core`, `plugins`, `python`, `runtime` ; apps `cli`, `web` | `ls packages apps` |
| Sous-modules | `vendor/bun`, `vendor/obscura`, `vendor/tauri`, `vendor/plugins-workspace`, `vendor/create-tauri-app`, `vendor/wry`, `vendor/tao`, `vendor/next`, `plugins` | `.gitmodules` |
| Python | `packages/python` (uv, PyO3) | `ls packages/python` |
| Branche | `dev` synchronisée avec `origin/dev` ; le sous-module `plugins` est modifié | `git status -sb` |

## 6. Écarts et préalables

- **Tauri et GUI** : Yolo porte aujourd'hui les crates Tauri, wry et tao, alors que la directive place ce focus dans Aphrody.
  - Décider le propriétaire de ces sources avant de les déplacer ; Yolo garde les compilateurs d'interface.
- **Python** : `packages/python` est une liaison PyO3 du cœur ; la surface Python IA/ML appartient à `aphrody-py`.
- **Usine de compilation** : le VPS est runtime-only depuis le 2026-10-03, sans toolchains.
- **macOS** : compilation seulement, aucune exécution réelle.
