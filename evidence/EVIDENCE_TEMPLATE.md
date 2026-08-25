# Preuve d'exécution — spike TrueForge

> **GABARIT VIERGE — AUCUNE EXÉCUTION N'A EU LIEU.**
> Copier en `evidence/EVIDENCE_<horodatage>.md` et ne remplir qu'avec des valeurs
> **réellement observées**. Un champ non observé reste vide ou marqué `NON OBSERVÉ`.
> Ne jamais compléter par déduction, par analogie ou « pour faire propre ».
> Ne jamais coller ici une clé d'API ou un jeton.

## Contexte

| Champ | Valeur |
| --- | --- |
| Date/heure de l'exécution | |
| Opérateur (humain) | |
| Version de TrueForge (surface publique utilisée) | |
| Source de la doc officielle consultée | |
| Commit du dépôt de spike | |
| Commande exacte lancée | |

## Résultats par checkpoint

Statuts autorisés : `NOT_RUN`, `BLOCKED_UNKNOWN_API`, `FAIL`, `PASS`.
Un `PASS` sans référence de preuve brute est invalide.

| Checkpoint | Statut | Preuve brute (chemin/id) | Observation |
| --- | --- | --- | --- |
| TRUEFORGE_BOOT | | | |
| MODEL_ROUND_TRIP | | | |
| SANDBOX_EXECUTION | | | |
| APPROVAL_AND_RESUME | | | |
| SESSION_PERSISTENCE | | | |
| EVIDENCE_EXPORT | | | |

## Approbation humaine (cœur du spike)

À remplir uniquement si l'approbation a été émise par un humain **hors du process du runner**.

| Champ | Valeur |
| --- | --- |
| Identifiant de la demande d'approbation | |
| Surface où l'approbation a été faite (UI / CLI / autre) | |
| Identité de l'approbateur | |
| Identité de l'agent (doit différer de la précédente) | |
| Horodatage de la demande | |
| Horodatage de la décision | |
| Le runner pouvait-il s'auto-approuver ? (oui ⇒ CP4 invalide) | |

## Reprise

| Champ | Valeur |
| --- | --- |
| Étape de reprise observée | |
| S1 a-t-il été rejoué ? (oui ⇒ relance, pas reprise) | |
| Effet de S2 constaté après approbation (fichier, horodatage) | |

## Export

| Champ | Valeur |
| --- | --- |
| Chemin de l'artefact exporté | |
| Contient mission / interception / décision / approbateur / horodatages ? | |
| Rejouable ou vérifiable par un tiers ? | |

## Conclusion

- Parcours `Mission → agent → sandbox → approbation réelle → reprise → preuve` :
  `FAISABLE` / `NON FAISABLE` / `INDÉTERMINÉ` — rayer les mentions inutiles, justifier :
- Premier point de rupture (le cas échéant) :
- Inconnues restées ouvertes (renvoi à `UNKNOWNS.md`) :
