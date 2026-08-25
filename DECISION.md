# Décision du spike TrueForge

## Spike 1 — 24 août 2026

### Verdict

`NO-GO ENVIRONNEMENTAL`

Qualification : **NO-GO ENVIRONNEMENTAL — aucun runtime modèle disponible**.

Ce verdict ne démontre pas une défaillance du cœur TrueForge. Il signifie que le parcours obligatoire ne pouvait pas être exécuté dans la fenêtre du spike sans nouvelle clé de modèle et sans credential Daytona.

### Durée réelle

- Heure de début : 2026-08-24 11:07:42 CEST
- Heure de fin : 2026-08-24 11:30:59 CEST
- Durée totale : 00:23:17

### Matrice des critères

| Critère | Résultat | Preuve | Blocage |
| --- | --- | --- | --- |
| Démarrage | PASS | Docker sain, migrations réussies, `GET /healthz` HTTP 200, TrueForge 0.1.4 | Le mode `npx` Windows échoue ; Docker fonctionne avec `HOST=0.0.0.0`. |
| Modèle | FAIL | API publique : `0` fournisseur configuré ; variables connues absentes ; endpoints locaux inaccessibles | Aucun runtime modèle disponible. |
| Sandbox | FAIL | API publique : aucun provider configuré (`404`) ; catalogue : Daytona uniquement | Aucun credential Daytona ; test non exécuté. |
| Approbation et reprise | FAIL | Aucun agent/tour modèle n’a pu atteindre un appel d’outil sensible | Dépend des deux blocages précédents ; aucune simulation acceptée. |
| Persistance | FAIL | API publique : `0` session | Aucune session réelle à redémarrer ou retrouver. |
| Evidence Receipt | PARTIAL | `runner/export_nogo_receipt.py` et `evidence/evidence-receipt.json`, issus des API publiques | Reçu d’échec réel, mais aucune trace Mission→approbation à exporter. |

### Architecture observée

TrueForge gère le serveur d’agents, les fournisseurs de modèles, les agents et sessions persistés, les tours/événements, la sandbox-as-tool et l’approbation des outils MCP sensibles. Le mode Docker observé persiste dans Postgres et utilise Redis pour l’exécution distribuée.

Le futur projet devra fournir :

- une Mission ArcadeOps traduite en instructions et données fictives ;
- un outil MCP local d’écriture de patch, annoté `write` pour déclencher l’approbation native ;
- un exporteur qui transforme les sessions/tours/événements publics en Evidence Receipt ;
- l’association des identifiants ArcadeOps (`Mission`, `Decision`, `Deliverable`) aux identifiants TrueForge.

Pour éviter un wrapper décoratif, TrueForge doit rester propriétaire du tour modèle, de l’exécution sandbox, du checkpoint d’approbation, de la reprise et de la session. ArcadeOps ne doit faire que gouverner et présenter ces événements.

### Motif d’abandon

Le premier mécanisme obligatoire après le démarrage — un aller-retour modèle réel — n’était pas disponible. La machine ne contenait aucune variable Anthropic, Google/Gemini, OpenAI ou endpoint compatible, aucun serveur Ollama/LM Studio accessible et aucun modèle déjà configuré dans la base fraîche. L’authentification OAuth de Claude Code ne fournit pas un modèle à TrueForge et n’a pas été réutilisée.

La sandbox obligatoire était indépendamment bloquée : la documentation et le catalogue de TrueForge 0.1.4 n’exposent que Daytona, sans credential disponible. Continuer aurait exigé un compte/credential externe ou aurait produit une fausse intégration, tous deux hors autorisation.

Tentatives réalisées :

1. démarrage officiel local `npx` — échec Windows reproductible sur URL ESM `C:` ;
2. alternative officielle Docker Compose — succès après réglage documenté de l’adresse d’écoute ;
3. inspection non sensible des fournisseurs et endpoints locaux — aucun disponible ;
4. vérification par API publique des modèles, agents, sessions et sandbox — état vide confirmé.

Enseignement réutilisable : l’action sensible ne doit pas être une « évasion » de la sandbox. Elle doit être un outil MCP local annoté en écriture, car TrueForge applique l’approbation aux appels d’outils ; la sandbox reste responsable de l’isolation du code.

## Spike 2 — requalification

### Statut initial (superseded)

`WAITING_FOR_CREDENTIALS` au checkpoint du 24 août 2026 à 12:55 CEST.

Sous-statuts :

- `WAITING_FOR_MODEL_CREDENTIAL` ;
- `WAITING_FOR_DAYTONA_CREDENTIAL`.

L'absence de clé n'est plus traitée comme un NO-GO technique. La participation en ligne est autorisée et TrueForge redémarre correctement ; une courte action manuelle reste indispensable avant le vrai tour modèle.

### Fenêtre de requalification

- Début : 2026-08-24 12:42:48 CEST
- Fin technique : 2026-08-24 12:55:08 CEST
- Durée : 00:12:20, hors attente utilisateur

### Configuration testée, sans secret

- Dépôt du spike : commit `62668c9c825cc1ef246b8f249fbb687620a9fb55`, état propre au début.
- Runtime TrueForge : commit `d421135dcfc802e08655d12c119e18ed715db2ef`, package `0.1.4`, état propre.
- Docker client/serveur : `29.7.2`.
- Variables des fournisseurs courants et Daytona : toutes `ABSENT`; aucune valeur n'a été lue ni affichée.
- Endpoints locaux testés : Ollama `127.0.0.1:11434`, LM Studio `127.0.0.1:1234` et compatible OpenAI `127.0.0.1:8080`, tous indisponibles.
- Stack qualifié : Docker Compose avec Postgres/Redis, `STANDALONE=false`.

### Commandes et résultats

| Vérification | Résultat |
| --- | --- |
| `git rev-parse HEAD` et `git status --short` | Commit attendu, arbre propre avant modification |
| `docker version` | Client et serveur disponibles |
| `docker compose up -d` | Postgres, Redis et serveur démarrés |
| `GET /healthz` | HTTP 200, `status=ok`, version `0.1.4` |
| `GET /api/v1/catalogs/model-providers` | 9 presets de fournisseurs |
| `GET /api/v1/settings/model-providers` | 0 fournisseur configuré |
| `GET /api/v1/models` | 0 modèle disponible |
| `GET /api/v1/agents` | 0 agent |
| `GET /api/v1/sessions` | 0 session |
| `GET /api/v1/capabilities` | `sandbox.enabled=false`, `skill.enabled=false` |
| `GET /api/v1/settings/sandbox-providers` | HTTP 404, aucun provider persistant |
| `runner/resume_requalification.ps1` sans secret | Runtime `VALID`, modèle et Daytona `ABSENT` |
| `docker compose stop` | Services arrêtés proprement, données locales préservées |

### Interprétation technique

Le schéma 0.1.4 accepte les fournisseurs `openai`, `anthropic`, `google-gemini`, `fireworks`, `zai`, `moonshot`, `alibaba`, `together` et `custom`. Les clés ne sont pas consommées comme variables d'environnement natives du serveur : elles sont enregistrées via `manifest.auth.api_key` dans l'API Settings locale. Le script de reprise traduit explicitement le fichier Git-ignoré vers ce format.

Le code contient un fallback sandbox local, mais seulement en mode standalone Linux. Il n'est pas actif dans le stack Docker Postgres/Redis réellement qualifié. Daytona reste donc requis pour `GO_FULL`; un futur `GO_PIVOT` ne pourra être déclaré qu'après preuve d'un modèle et des outils MCP avec approbation native.

### Preuves

- Historique du Spike 1 : [`SPIKE_LOG.md`](SPIKE_LOG.md)
- Reçu historique honnête : [`evidence/evidence-receipt.json`](evidence/evidence-receipt.json)
- Instructions de reprise : [`ENVIRONMENT_SETUP.md`](ENVIRONMENT_SETUP.md)
- Vérificateur local : [`runner/resume_requalification.ps1`](runner/resume_requalification.ps1)
- Règles officielles : <https://www.wemakedevs.org/hackathons/trueforge/rules>
- Documentation sandbox : <https://trueforge.dev/sandbox>

### Prochaine décision

Après ajout manuel d'une clé modèle, exécuter le vrai tour `Réponds uniquement par TRUEFORGE_MODEL_OK` dans TrueForge et vérifier sa persistance. Ensuite :

- `GO_FULL` si Daytona et les événements persistés réussissent aussi ;
- `GO_PIVOT` si le modèle, MCP et l'approbation native réussissent sans Daytona ;
- `NO_GO_TECHNICAL` seulement si une configuration valide échoue réellement.

### Qualification finale — 24 août 2026

`GO_PIVOT`

La clé Anthropic a ensuite été ajoutée localement par Damien dans le fichier Git-ignoré. Sa valeur n'a jamais été affichée, copiée dans un rapport ou versionnée. Daytona est resté absent ; la matrice impose donc la branche **Governed Operations Assistant**.

#### Matrice finale

| Critère | Résultat | Preuve | Blocage / limite |
| --- | --- | --- | --- |
| Démarrage | PASS | TrueForge 0.1.4, Postgres/Redis sains, `/healthz=200` | Mode `npx` Windows toujours non retenu. |
| Modèle | PASS | Session `01m0t2sa252t94hczve49naac3`, sortie persistée exacte `TRUEFORGE_MODEL_OK` | Appel Anthropic API requis. |
| Sandbox | FAIL attendu pour le pivot | `sandbox.enabled=false`, aucun credential Daytona | Aucune sandbox simulée ou revendiquée. |
| Approbation et reprise | PASS | Session `01m0t3dpxbyaxe7asnrgxvna05`, deux `tool.approval_required`, décisions Deny puis Allow | Identité détaillée de l'approbateur non exposée. |
| Persistance | PASS | Sessions et état MCP relus après redémarrage des deux services | Persistance locale Docker uniquement. |
| Evidence Receipt | PASS | `evidence/go-pivot-evidence-receipt.json`, dérivé des API publiques | Reçu spécifique à la branche pivot. |

#### Démonstration réellement exécutée

1. Un vrai agent TrueForge utilisant `anthropic/claude-sonnet-5` a inspecté les dossiers fictifs via MCP.
2. Il a préparé `case-101: pending_review → needs_followup` sans écrire.
3. TrueForge a suspendu `apply_status_change` avant l'appel MCP.
4. `Deny` a repris le tour avec une erreur et l'état est resté inchangé.
5. Dans la même session, un nouvel essai a été suspendu puis autorisé ; exactement une écriture a été exécutée.
6. Une préparation sur `case-102`, hors contrat, a été bloquée par `AUTHORITY_DENIED`.
7. Les événements publics ont produit le reçu et ont survécu au redémarrage.

#### Décision produit

La soumission pivot est techniquement crédible et prête pour revue : TrueForge reste central pour le modèle, les outils, l'approbation, la reprise et la persistance. Le projet ajoute l'autorité métier et la preuve sans reconstruire le harness. L'absence de Daytona et de sous-agents doit être présentée comme limite, jamais masquée.

Recommandation : **soumettre après revue humaine, vidéo et publication explicitement autorisées**.
