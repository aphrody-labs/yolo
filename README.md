# ⚡ Aphrody YOLO — L'Usine Native Bun & Refactor Stack

Ce répertoire autonome réunit l'ensemble des forks amonts, outillages natifs de compilation, moteurs de navigation furtive et scripts de synchronisation de la stack Aphrody.

## 📦 Architecture & Packages (`packages/`)

- **`packages/bun`** : Fork haute-performance de Bun avec les branches `google`, `aphrody` et le package FFI `@aphrody/bun-runtime`.
- **`packages/obscura`** : Moteur Rust de navigation furtive, extraction et automatisation CDP (remplaçant Electron).
- **`packages/oxc`** : Toolchain JavaScript/TypeScript en Rust (`oxc-parser`, `oxc-transform`, isolated declarations).
- **`packages/typescript`** : Submodule amont Microsoft TypeScript (spécifications TypeScript 7 Corsa/Go).
- **`packages/vscode`** : Répertoire de travail pour le refactoring et la purge des défauts historiques de VS Code.

## 🏭 Outillage & Pipeline Natif (`/home/aphro/yolo`)

- **TypeScript 7 Native (Corsa/Go)** : Typecheck ultra-rapide.
- **Oxc & NAPI** : Transformateur et émetteur `.d.ts` in-process sans sous-processus.
- **Oxlint** : Linter Rust 16 threads en < 50ms (`bun run lint`).
- **Oxfmt** : Formateur natif ultra-rapide (`bun run fmt`).
- **Obscura CDP** : Contrôle headless et furtif sans surcharge mémoire.

## 🚀 Commandes Rapides

\`\`\`bash
cd /home/aphro/yolo
bun install           # Installe les dépendances hermétiques
bun run status        # État instantané des 5 packages et forks via aphrody git
bun run bun:track     # Intelligence et veille des 50 PRs amonts
bun run bun:sync      # Synchronisation amont du fork Bun
bun run lint          # Linting multithreadé oxlint
\`\`\`
