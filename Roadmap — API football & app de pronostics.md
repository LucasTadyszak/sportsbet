# Roadmap — API football & app de pronostics

Sep 26, 2026 · @Lucas

## Phase 1 — Sandbox gratuit

Brancher des données réelles sans dépenser, pour valider tout le pipeline avant tout achat.

- [ ] Activer le connecteur `football-data.org` avec une clé API gratuite (matchs, équipes, classements sur 12 compétitions)
- [ ] Créer l'adapter cotes branché sur le sandbox gratuit (1 000 requêtes/mois)
- [ ] Programmer le job d'ingestion une fois par jour, dans les plafonds gratuits (10 req/min)
- [ ] Vérifier que le pipeline complet (ingestion → base → API → dashboard) tourne sur des données réelles

Durée indicative : 1 à 2 semaines à temps partiel.

## Phase 2 — Validation

Confirmer que le signal de value bet tient sur de vraies données avant d'investir dans du payant.

- [ ] Relancer le backtest avec les cotes historiques réelles collectées en phase 1
- [ ] Comparer les probabilités du modèle (Poisson + ML) aux cotes réelles du marché
- [ ] Vérifier que le signal de value bet résiste face à un marché efficient, pas seulement aux cotes simulées

Durée indicative : 2 à 4 semaines, le temps d'accumuler assez de matchs réels. Ne pas passer à la phase 3 avant que ce signal soit confirmé.

## Phase 3 — Bascule payante

Choisir la solution payante selon le manque réellement identifié en phase 2, pas par anticipation.

| Manque identifié | Solution | Coût |
| --- | --- | --- |
| Peu de championnats, besoin de simplicité | TheStatsAPI (tout-en-un, cotes incluses) | \~46€/mois |
| Fournisseur stats stable, cotes à faire évoluer à part | Sportmonks Starter + API cotes dédiée | \~57€/mois |
| Projet sérieux, besoin de profondeur (xG, Pressure Index) | Sportmonks Growth + Odds Premium Lite | \~228€/mois |

- [ ] Identifier le manque réel (couverture, profondeur stats, ou nombre de bookmakers)
- [ ] Choisir la solution correspondante dans le tableau ci-dessus
- [ ] Vérifier les tarifs actuels directement sur les pages officielles avant de souscrire

## Phase 4 — Durcissement

Rendre l'architecture prête à scaler et à changer de fournisseur sans tout casser.

- [ ] Ajouter un cache TTL au niveau des repositories pour limiter les appels aux fournisseurs
- [ ] Ajouter une gestion des erreurs et un retry/backoff sur le job d'ingestion
- [ ] Vérifier que l'archi hexagonale permet de changer de fournisseur en ne touchant qu'un adapter
