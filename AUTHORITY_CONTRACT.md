# Authority Contract

Le contrat exécutable se trouve dans [`mcp_server/authority_contract.json`](mcp_server/authority_contract.json).

## Autorité accordée

- Mission : `TF-SAFE-ROLLBACK-001`.
- Identité logique : `arcadeops-mission-control`.
- Ressources lisibles : `incidents:demo` et `services:demo`.
- Outils autorisés : `inspect_incident`, `prepare_rollback`, `execute_rollback`, `export_evidence`.
- Écriture : un seul rollback de `checkout-api`, lié à `INC-2026-042`, de `v42` vers `v41`.
- Maximum : exactement zéro ou une écriture selon la décision humaine, jamais davantage.
- Approbation obligatoire : `execute_rollback`.
- Expiration : 31 août 2026 à 20:00 UTC.

## Autorité refusée

Les nouveaux déploiements, modifications d'identité, appels réseau externes et contacts avec la production sont interdits. `INC-2026-077`, `identity-api` et toute autre paire de versions ne figurent dans aucune permission d'écriture.

## Application réelle

Chaque appel vérifie l'identifiant de mission, l'expiration, l'outil et la permission. La préparation hors autorité échoue avec `AUTHORITY_DENIED` avant de produire un jeton. L'exécution revalide la permission et un SHA-256 dérivé de la mission, de l'incident, du service et de l'état courant ; un jeton rejoué devient invalide après mutation. Après écriture, le parent doit relire l'incident et prouver `v41`, l'état `healthy` et un taux d'erreur inférieur ou égal au seuil.

Le test black-box prouve :

- préparation sans écriture ;
- rollback autorisé et atomique ;
- anti-rejeu ;
- refus de l'incident et du service hors périmètre avec état inchangé ;
- persistance des refus dans l'audit ;
- une seule réussite sous appels concurrents avec le même jeton ;
- absence de perte d'audit sous appels concurrents.

Commande :

```powershell
npm --prefix mcp_server test
```
