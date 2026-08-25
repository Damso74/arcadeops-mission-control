# Authority Contract

Le contrat exécutable se trouve dans [`mcp_server/authority_contract.json`](mcp_server/authority_contract.json).

## Autorité accordée

- Mission : `TF-MISSION-20260824-001`.
- Identité logique : `arcadeops-governed-operator`.
- Ressource lisible : `records:demo`.
- Outils autorisés : `inspect_records`, `prepare_status_change`, `apply_status_change`, `export_evidence`.
- Écriture : uniquement le champ `status` de `case-101`.
- Valeurs autorisées : `approved` et `needs_followup`.
- Approbation obligatoire : `apply_status_change`.
- Expiration : 31 août 2026 à 20:00 UTC.

## Autorité refusée

Les suppressions, modifications d'identité et appels réseau externes sont interdits. `case-102` ne figure dans aucune permission d'écriture.

## Application réelle

Chaque appel vérifie l'identifiant de mission, l'expiration, l'outil et la permission. La préparation hors autorité échoue avec `AUTHORITY_DENIED` avant de produire un jeton. L'application revalide la permission et un SHA-256 dérivé de la mission, du dossier et du diff courant ; un jeton rejoué devient invalide après mutation.

Le test black-box prouve :

- préparation sans écriture ;
- application autorisée ;
- anti-rejeu ;
- refus de `case-102` et état inchangé ;
- persistance des refus dans l'audit ;
- absence de perte d'audit sous six appels concurrents.

Commande :

```powershell
npm --prefix mcp_server test
```
