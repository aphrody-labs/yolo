## 📋 Description des Changements
<!-- Décrivez clairement les modifications apportées et le composant ciblé. -->

### Composant(s) modifié(s) :
- [ ] `crates/yolo-core` (Moteur algorithmique Rust)
- [ ] `crates/yolo-runtime` (C ABI export)
- [ ] `crates/yolo-pyo3` (Extension native PyO3 0.29)
- [ ] `crates/yolo-desktop` (Tauri 3 Shell)
- [ ] `packages/python` (Package Python / uv)
- [ ] `packages/runtime` (SDK Bun FFI)
- [ ] `packages/core` (Librairie Core TypeScript)
- [ ] `apps/cli` (CLI universelle yolo)
- [ ] `apps/web` (Application Web)
- [ ] `docs/` (Documentation)

---

## 🧪 Validations Requises
Avant de soumettre, confirmez que les vérifications suivantes ont été exécutées :
- [ ] `bun apps/cli/src/index.ts verify --json` (Toutes les gates validées)
- [ ] `bun run lint` (Oxlint sans erreur)
- [ ] `bun run fmt:check` (Code TypeScript formaté sans diff)
- [ ] `ruff check .` (Code Python linté et vérifié)
- [ ] `bun test test/` (Tests unitaires 100% verts)
- [ ] `uv run --directory packages/python pytest` (Tests Python verts)
