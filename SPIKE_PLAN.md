# SPIKE_PLAN — TrueForge : Mission → agent → sandbox → approbation réelle → reprise → preuve

- Statut du plan : **arrêté sur NO-GO environnemental après démarrage réussi**.
- Fenêtre : démarrage `2026-08-24 11:07:42 CEST`, limite absolue `2026-08-24 12:37:42 CEST`.
- Dépôt : `C:\Users\credo\Documents\ChatGPT\True Forge` (dédié au spike, aucun lien avec ArcadeOps).

## 1. Objectif

Vérifier **expérimentalement** que TrueForge permet, avec ses surfaces publiques officielles, d'enchaîner :

```
Mission déclarée
   └─> agent TrueForge instancié            (CP1 TRUEFORGE_BOOT)
        └─> aller-retour modèle observable  (CP2 MODEL_ROUND_TRIP)
             └─> exécution en sandbox       (CP3 SANDBOX_EXECUTION)
                  └─> action sensible bloquée
                       └─> approbation humaine RÉELLE + reprise (CP4 APPROVAL_AND_RESUME)
                            └─> session retrouvée après redémarrage (CP5 SESSION_PERSISTENCE)
                                 └─> preuve exportable et vérifiable (CP6 EVIDENCE_EXPORT)
```

## 2. Non-objectifs

- Aucun développement du produit final : ce dépôt est jetable.
- Aucune reproduction/optimisation de performance, aucun packaging, aucun CI.
- Aucun contournement de la sandbox ou du mécanisme d'approbation : le spike **teste** le garde-fou, il ne le neutralise pas.
- Aucune publication, aucun push, aucun déploiement, aucun appel à un service tiers non prévu par le scénario.

## 3. Surfaces officielles validées

TrueForge 0.1.4 expose une UI, une API HTTP/OpenAPI et le SDK TypeScript
`@truefoundry/trueforge-sdk`. Les agents, sessions, tours et événements ont des identifiants stables.
La sandbox est activée dans `config.sandbox.enabled` et n'accepte actuellement que Daytona.
L'approbation native porte sur les outils MCP marqués en écriture/destructifs et reprend le tour
après Allow/Deny dans l'UI.

Le squelette initial reste volontairement non câblé : le blocage environnemental a été constaté
avant tout tour modèle. Le câbler après ce verdict aurait dépassé le spike et risqué un faux PASS.

## 4. Scénario de test

Défini en clair dans `scenario/mission.json` (lisible par un humain, indépendant du SDK).

Mission : *« Produire un rapport dans la sandbox, puis tenter une action sensible qui doit être
interceptée, obtenir une approbation humaine réelle, reprendre, et livrer une preuve. »*

Étapes observables :

| # | Étape | Effet attendu | Observable |
| --- | --- | --- | --- |
| S1 | Lancer `npm test` sur `demo_project/` dans la sandbox | échec de test attendu, règle risquée détectée | événements/outils sandbox |
| S2 | Appeler l’outil MCP local `create_approved_patch` | mis en attente par l’approbation native | événement d’approbation d’outil |
| S3 | Demander l'approbation de S2 | ticket d'approbation créé | identifiant d'approbation |
| S4 | Un humain approuve dans l'interface TrueForge | décision enregistrée | horodatage + identité de l'approbateur |
| S5 | L'agent reprend au point exact | S2 s'exécute enfin | effet de S2 constaté |
| S6 | Export de la trace | artefact signé/horodaté | fichier d'export |

L'action sensible est volontairement **inoffensive et réversible** (création d'un fichier patch dans
`deliverables/`, sous le dépôt du spike). Pas de réseau, pas de suppression, pas de secret.

Une écriture hors du périmètre sandbox n'est pas une action à rendre approuvable : elle doit rester
interdite. L'approbation est testée séparément sur un outil MCP annoté en écriture.

## 5. Critères PASS / FAIL

Un checkpoint ne peut passer à `PASS` que si une **preuve brute** (payload, log, capture) est référencée.
Le runner refuse mécaniquement un `PASS` sans champ `evidence.raw_ref` non vide (`runner/spike_runner.py`).

| CP | PASS si… | FAIL si… |
| --- | --- | --- |
| CP1 `TRUEFORGE_BOOT` | serveur/API et stockage démarrent, `/healthz` répond | démarrage ou initialisation du stockage impossible |
| CP2 `MODEL_ROUND_TRIP` | la mission produit au moins une réponse de modèle tracée | aucune trace exploitable de l'aller-retour |
| CP3 `SANDBOX_EXECUTION` | les vérifications s'exécutent réellement dans Daytona et remontent leur sortie | exécution faite par le shell hôte ou provider absent |
| CP4 `APPROVAL_AND_RESUME` | approbation faite par un **humain réel** hors du process, puis reprise au point d'arrêt | approbation simulable par le code, ou reprise impossible (réexécution depuis le début ≠ reprise) |
| CP5 `SESSION_PERSISTENCE` | la session est retrouvée après arrêt complet du process | état uniquement en mémoire |
| CP6 `EVIDENCE_EXPORT` | export contenant mission, décisions, approbateur, horodatages | export absent, tronqué, ou non rejouable |

Statuts autorisés : `NOT_RUN`, `BLOCKED_UNKNOWN_API`, `FAIL`, `PASS`. **`PASS` ne se met jamais à la main.**

### Règle anti-faux-PASS (CP4)

CP4 est le cœur du spike. Il n'est valide que si les trois conditions suivantes tiennent :

1. L'approbation est émise **depuis une surface TrueForge**, pas depuis le runner ;
2. le runner **ne dispose d'aucun moyen** de s'auto-approuver (pas de jeton d'approbation dans sa config) ;
3. la décision porte une **identité d'approbateur** distincte de l'identité de l'agent.

Si TrueForge n'expose pas d'approbation humaine hors-process, CP4 est `FAIL` — pas `PASS` avec réserve.
Le mode `--approval-mode=local-file` existe uniquement pour instrumenter la *reprise* (S5) en isolation ;
il est marqué `FALLBACK` et **ne peut pas** valider CP4.

## 6. Arborescence produite par ce spike

```
SPIKE_PLAN.md                    ce fichier
SPIKE_LOG.md                     journal chronologique (préexistant, mis à jour)
UNKNOWNS.md                      inventaire des API à valider avant toute exécution
.gitignore                       protège evidence/ et tout fichier de secret
scenario/mission.json            la mission, en clair, indépendante du SDK
config/trueforge.spike.example.json   config d'exemple — noms de variables d'env uniquement
runner/trueforge_adapter.py      frontière unique vers TrueForge (tout y lève UnknownTrueForgeAPI)
runner/spike_runner.py           orchestrateur des 6 checkpoints + garde anti-faux-PASS
evidence/EVIDENCE_TEMPLATE.md    gabarit de preuve, à remplir uniquement après exécution réelle
```

## 7. Exécution et arrêt

1. Les règles et surfaces officielles ont été vérifiées.
2. Le mode `npx` a échoué sous Windows ; l'alternative Docker officielle a réussi.
3. L'API publique a confirmé l'absence de modèle, agent, session et sandbox configurée.
4. Conformément au seuil environnemental du brief, les checkpoints agent ont été arrêtés sans simulation.
5. Seuls les documents, la fixture et le reçu de non-exécution ont ensuite été finalisés.

## 8. Critères d'arrêt

- **Succès du spike** : CP1→CP6 tous `PASS` avec preuves ⇒ conclusion « parcours faisable sur surfaces publiques ».
- **Échec instructif** : premier `FAIL` documenté ⇒ conclusion « parcours non faisable en l'état, cause X ».
  Un échec documenté est un résultat valide et suffisant pour ce spike.
- **Butée horaire** `12:37:42 CEST` : geler l'état, remplir `SPIKE_LOG.md` avec les checkpoints restés
  `NOT_RUN` / `BLOCKED_UNKNOWN_API`. Ne pas prolonger, ne pas combler les trous par déduction.

## 9. Sécurité du spike

- Aucun secret n'est écrit dans le dépôt ; la config ne contient que des **noms** de variables d'env.
- `evidence/` est ignoré par Git par défaut : les traces peuvent contenir des identifiants d'approbateur.
- L'action sensible reste locale, réversible et limitée à `sandbox_escape_target/`.
- Aucun accès au dépôt ArcadeOps, aucun push, aucun déploiement.
