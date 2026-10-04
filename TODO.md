<!-- SPDX-License-Identifier: Apache-2.0 -->

# Exécution de l'objectif propriétaire

Objectif intact : binaire Yolo autonome et fermeture vérifiée de tous les GOAL et
plans [Yolo](GOAL.md) / [Aphrody](../aphrody/GOAL.md). La demande actuelle autorise
les implémentations nécessaires ; le périmètre de maintenance hors sources du
2026-10-04 ne ferme aucun jalon et ne remplace pas cet objectif.

## Lot actif — fork Bun desktop et build natif (2026-10-05)

- [x] Corriger et qualifier le build-driver qui transmet les bibliothèques Rust au linker Linux du fork Bun ; compilation du moteur encore ouverte.
- [ ] Préparer uniquement la fermeture des sources nécessaires au build, sous les verrous existants.
- [ ] Raccorder réellement JSC/V8, le fournisseur headless et le plugin desktop ; conserver JSC/WebKit.
- [ ] Qualifier React/Next 16, WebView embarquée et application desktop en un fichier Bun.
- [ ] Compiler le fork épinglé et mesurer les parcours comparables, dont le premier usage moteur.

## Lot de fondation — frontières cœur/modules (2026-10-05)

- [x] Réduire les racines Cargo par défaut aux deux crates cœur, sans altérer les fournisseurs en cours.
- [x] Séparer les recettes et gates cœur, desktop, browser, Python et compilateur.
- [x] Corriger les préalables de validation : aide verify et compilation du CLI autonome.
- [x] Vérifier les consommateurs Aphrody et identifier le blocage de préparation M3.
- [x] Qualifier les changements, livrer les seuls lots possédés et consigner les dépendances restantes.

## Lot précédent — arbitrage crates, vendors et modules Bun

- [x] Recenser les 117 crates et les huit vendors, avec provenance et défauts Cargo.
- [x] Trancher cœur, fournisseurs optionnels, outils et propriété produit Aphrody.
- [x] Valider et livrer la décision et son recensement exhaustif.

Suite d’implémentation : qualifier R3/R4, puis migrer les consommateurs et le compilateur.
Décision : [frontières du cœur et des modules](docs/CORE-MODULE-BOUNDARIES.md).

## Lot précédent — gestionnaire unifié Bun/uv/Cargo (GOAL §3)

- [x] Exposer un plan natif pour les manifestes et locks Bun, uv et Cargo.
- [x] Exécuter la synchronisation réelle avec les binaires globaux, locks conservés et Cargo sérialisé.
- [x] Qualifier des projets temporaires hors ligne, les échecs et l’annulation.
- [x] Livrer les sources et preuves de cette tranche sans fermer le gestionnaire complet.

## Lot précédent — consolidation du cœur

- [x] Auditer tous les modules `packages/core` et leurs parcours incomplets.
- [x] Terminer les transports Gemma/inférence et distinguer profils, calculs et modèles chargés.
- [x] Rendre Redis/vectoriel/datasets persistants et cohérents hors ligne.
- [x] Consolider MCP/API, exports publics et durée de vie des dépendances.
- [x] Corriger supervision des moniteurs et les autres contrats incomplets démontrés.
- [x] Exécuter les gates applicables, livrer les seuls chemins possédés et garder les limites factuelles.

## Lot précédent — autonomie et release courante

- [x] Exécuter les commandes embarquées sans délégation à un Bun externe.
- [x] Qualifier scan, parse, MCP et API du binaire en environnement minimal.
- [x] Corriger les options de scan et le diagnostic de la distribution.
- [ ] Requalifier runtime ABI 1.4, installer et serveur depuis des assets courants.
- [x] Réparer le routage natif de la fabrique pour le dépôt Yolo après sondes réelles.
- [x] Gates propriétaires du lot CLI/synchronisation, revue, commits et push
      des seuls chemins possédés ; aucune qualification globale déduite.
- [x] Synchroniser les commits des trois dépôts vers main et la fabrique SSH,
      avec suivi des tâches en arrière-plan et file de compilation automatique
      sérialisée. Préparation initiale et résultat des builds encore en cours.

## Suite conservée

- D0/D1/D2 : install/upgrade/rollback/uninstall et exécution réelle des cinq cibles.
- R2/R3/R4/D3 : descendants Windows, desktop et navigateur distribués, consommateurs.
- Moteurs optionnels, gestionnaire Bun/uv/Cargo, compilateur d'interface et VFS.
- R5/R6/R8 : contrats et coexistence JSC/V8 ; performances/signatures mesurées.
- Aphrody : acquisition native, R7, variantes produit, sécurité appareil/QR/jetons,
  services et installations Windows/WSL/SSH définis dans son GOAL.
- Serverless et benchmark des hébergements, répartition des propriétaires moteur,
  puis distribution Linux selon les préalables des GOAL.
- D4 : dry-run ; publication registre seulement dans une autorité explicite.

Les preuves et limites restent dans MEMORY.md. Aucun jalon global n'est fermé
par une validation locale, un manifeste ou une modification documentaire.
