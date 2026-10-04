<!-- SPDX-License-Identifier: Apache-2.0 -->
# Exécution de l'objectif propriétaire

Objectif intact : binaire Yolo autonome et fermeture vérifiée de tous les GOAL et
plans [Yolo](GOAL.md) / [Aphrody](../aphrody/GOAL.md). La demande actuelle autorise
les implémentations nécessaires ; le périmètre de maintenance hors sources du
2026-10-04 ne ferme aucun jalon et ne remplace pas cet objectif.

## Lot actif — autonomie et release courante

- [ ] Exécuter les commandes embarquées sans délégation à un Bun externe.
- [ ] Qualifier scan, parse, MCP et API du binaire en environnement minimal.
- [ ] Corriger les options de scan et le diagnostic de la distribution.
- [ ] Requalifier runtime ABI 1.4, installer et serveur depuis des assets courants.
- [ ] Réparer le routage natif de la fabrique pour le dépôt Yolo après sondes réelles.
- [ ] Gates propriétaires, revue, commits et push des seuls chemins possédés.

## Suite conservée

- D0/D1/D2 : install/upgrade/rollback/uninstall et exécution réelle des cinq cibles.
- R2/R3/R4/D3 : descendants Windows, desktop et navigateur distribués, consommateurs.
- Moteurs optionnels, gestionnaire Bun/uv/Cargo, compilateur d'interface et VFS.
- R5/R6/R8 : parité JSC avant retrait V8 ; performances/signatures mesurées.
- Aphrody : acquisition native, R7, variantes produit, sécurité appareil/QR/jetons,
  services et installations Windows/WSL/SSH définis dans son GOAL.
- Serverless et benchmark des hébergements, répartition des propriétaires moteur,
  puis distribution Linux selon les préalables des GOAL.
- D4 : dry-run ; publication registre seulement dans une autorité explicite.

Les preuves et limites restent dans MEMORY.md. Aucun jalon global n'est fermé
par une validation locale, un manifeste ou une modification documentaire.
