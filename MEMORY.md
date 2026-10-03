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

Desktop/browser restent réservés. JSC/parité V8, distribution cinq cibles,
Job Objects, activation complète et gains mesurés restent ouverts.
Mémoire fichier uniquement ; aucune mémoire fournisseur synchronisée.
