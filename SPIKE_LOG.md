# TrueForge — journal du spike

- Heure de début : 2026-08-24 11:07:42 CEST (Europe/Berlin)
- Heure de fin : 2026-08-24 11:30:59 CEST
- Durée réelle : 00:23:17
- Limite absolue : 2026-08-24 12:37:42 CEST
- Objectif : vérifier expérimentalement le parcours `Mission → agent → sandbox → action sensible → approbation humaine → reprise → preuve` sans développer le projet final.
- Répertoire : `C:\Users\credo\Documents\ChatGPT\True Forge`

## Checkpoints

| Checkpoint | État | Temps écoulé | Preuve / décision |
| --- | --- | ---: | --- |
| Cadrage | PASS | 00:08 | Règles et documentation officielles vérifiées ; environnement inspecté sans lire les valeurs. |
| Squelette de spike | FAIT | — | `SPIKE_PLAN.md`, `UNKNOWNS.md`, `scenario/`, `config/`, `runner/`, `evidence/` créés. Aucune commande lancée. |
| TRUEFORGE_BOOT | PASS | 00:16 | Docker sain ; migrations réussies ; `/healthz` HTTP 200, version 0.1.4. |
| MODEL_ROUND_TRIP | FAIL | 00:17 | 0 provider configuré, aucune variable connue, aucun endpoint local accessible. |
| SANDBOX_EXECUTION | FAIL | 00:17 | Provider absent (`404`) ; catalogue Daytona uniquement ; non exécuté. |
| APPROVAL_AND_RESUME | FAIL | 00:17 | Aucun tour agent ; aucune approbation simulée. |
| SESSION_PERSISTENCE | FAIL | 00:17 | 0 session réelle à redémarrer/retrouver. |
| EVIDENCE_EXPORT | PARTIAL | 00:22 | Reçu de NO-GO exporté via API publique ; aucune trace de mission disponible. |

## Journal détaillé

### T+00 — démarrage

- Commande : inspection en lecture seule de l’heure, du répertoire et de l’état Git.
- Résultat : heure `2026-08-24T11:07:42+02:00`, répertoire dédié existant, dépôt Git détecté.
- Décision : utiliser ce dépôt dédié ; ne pas toucher au dépôt ArcadeOps.
- Sécurité : aucune valeur de variable d’environnement n’a été lue ou affichée.

### T+~00 — squelette d’intégration locale (aucune exécution)

- Action : création du squelette minimal et testable du scénario
  `Mission → agent TrueForge → sandbox → approbation réelle → reprise → preuve`.
- Fichiers créés : `SPIKE_PLAN.md`, `UNKNOWNS.md`, `.gitignore`, `scenario/mission.json`,
  `config/trueforge.spike.example.json`, `runner/trueforge_adapter.py`,
  `runner/spike_runner.py`, `evidence/EVIDENCE_TEMPLATE.md`, `evidence/.gitkeep`.
- **Aucune commande n’a été lancée**, aucun test exécuté, aucun secret lu ni écrit,
  aucun push / déploiement / publication.
- Décision de conception : **aucune API TrueForge n’a été inventée**. Tout le contact avec
  TrueForge est isolé dans `runner/trueforge_adapter.py`, où chaque fonction lève
  `UnknownTrueForgeAPI` en renvoyant à l’inconnue correspondante de `UNKNOWNS.md`.
  Le runner traduit ces levées en `BLOCKED_UNKNOWN_API` — jamais en `PASS`.
- Garde anti-faux-PASS : `Report.record()` rétrograde en `FAIL` tout `PASS` dépourvu de
  référence de preuve brute ; le mode d’approbation `local-file` ne peut pas valider CP4.
- Limite rencontrée : le fichier de brief
  `~/.codex/attachments/219dc684-5879-4dd2-b622-52fb8103bf31/pasted-text.txt` **n’a pas pu être
  lu** (hors répertoire de travail, accès refusé). Le squelette a été dérivé de la consigne
  utilisateur et des checkpoints déjà présents dans ce journal. Voir `UNKNOWNS.md` § U0 :
  relire le brief pour vérifier qu’aucune exigence n’a été omise.
- État des 6 checkpoints : inchangé, tous `À TESTER`. Rien n’a été validé.

### Prochaine action pour Codex

Suivre `SPIKE_PLAN.md` §7, dans l’ordre : lever U1/U2 sur la documentation publique officielle
**avant** d’écrire la moindre ligne d’appel. Si TrueForge n’expose publiquement ni agent ni
sandbox, arrêter le spike et le consigner ici — un échec documenté est un résultat valide.

### T+05 — délégation Claude Code

- Commande : wrapper Claude Code officiel, une invocation en mode édition.
- Résultat : code de sortie `0` ; squelette anti-faux-PASS créé. Claude n’a exécuté aucun test et n’a déclaré aucun checkpoint réussi.
- Contrôle Codex : état Git inspecté ; validation fonctionnelle encore requise.

### T+08 — cadrage officiel et environnement

- Règles : <https://www.wemakedevs.org/hackathons/trueforge/rules>
- Documentation : <https://trueforge.dev/quickstart>, <https://trueforge.dev/sandbox>, <https://trueforge.dev/create-agent/overview>
- Divergences / précisions : les participants en ligne apportent leur propre clé modèle ; Daytona est le seul fournisseur sandbox documenté ; Qodo est requis uniquement pour être éligible au prix Best Code Quality.
- Environnement : Node `v24.19.0`, npm/npx `11.17.0`, Docker client/serveur `29.7.2`, Python `3.12.14`.
- Fournisseurs : aucune des variables `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL` n’est présente. Seule la présence a été testée ; aucune valeur n’a été affichée.

### T+08 — démarrage local TrueForge

- Commande : `npx --yes @truefoundry/trueforge --port 8790` avec `SQLITE_PATH` local au dépôt.
- Résultat : code de sortie `1`, TrueForge `v0.1.4` ne démarre pas sous Windows.
- Erreur : `Only URLs with a scheme ... absolute paths must be valid file:// URLs. Received protocol 'c:'`.
- Avertissement : `LocalSandboxProvider supports macOS and Linux only (got win32)`.
- Décision : essayer l’unique alternative officielle autorisée, Docker Compose, sans modifier le cœur.

### T+16 — alternative Docker et démarrage confirmé

- Commande : clone shallow officiel puis `docker compose up --build` dans `.runtime/trueforge`.
- Configuration locale : `.env` runtime non versionné avec credentials de développement fictifs du compose et `HOST=0.0.0.0`, réglage documenté nécessaire à l'accès via le port publié.
- Résultat : image construite ; Postgres et Redis sains ; 15 migrations exécutées ; serveur et frontend démarrés.
- Validation : `curl http://127.0.0.1:8791/healthz` → HTTP `200`, `{"status":"ok","version":"0.1.4"}`.
- Checkpoint : `TRUEFORGE_BOOT = PASS`.

### T+17 — arrêt fonctionnel sur blocage environnemental

- API publique : `0` fournisseur modèle configuré, `0` agent, `0` session.
- Sandbox : `GET /api/v1/settings/sandbox-providers` → `404`; catalogue public → un seul type, `daytona`.
- Environnement : aucune variable modèle ou Daytona connue ; aucun endpoint local Ollama/LM Studio/OpenAI-compatible accessible.
- Décision : `NO-GO ENVIRONNEMENTAL — aucun runtime modèle disponible`.
- Conséquence : aucun tour modèle, aucune sandbox, aucune approbation/reprise et aucune persistance de session n'ont été simulés.

### T+22 — preuves et validations finales

- `python -m py_compile runner/export_nogo_receipt.py runner/spike_runner.py runner/trueforge_adapter.py` → code `0`.
- `python runner/export_nogo_receipt.py ...` → code `0`; reçu issu des API publiques écrit dans `evidence/evidence-receipt.json`.
- `npm --prefix demo_project test` → code `1` attendu : 1 test réussi, 1 test échoué sur `requires_human_approval=false`.
- `python runner/spike_runner.py --config config/trueforge.spike.example.json --only boot` → arrêt non nul avec `BLOCKED_UNKNOWN_API`; aucun faux PASS.
- Recherche de motifs de secrets courants via `rg` → code `1` signifiant aucun motif trouvé.
- `docker compose stop` → code `0`; services arrêtés proprement, données locales préservées.
- Checkpoint : `EVIDENCE_EXPORT = PARTIAL` (reçu d'échec réel, pas une preuve de mission complète).

### T+23 — fin

- Heure : 2026-08-24 11:30:59 CEST.
- Durée : 00:23:17, sous la limite de 90 minutes.
- Verdict final : `NO-GO ENVIRONNEMENTAL — aucun runtime modèle disponible`.

## Spike 2 — requalification environnementale

- Début : 2026-08-24 12:42:48 CEST
- Fin technique : 2026-08-24 12:55:08 CEST
- Durée hors attente utilisateur : 00:12:20
- Statut : `WAITING_FOR_CREDENTIALS`

### Audit initial

- Le commit `62668c9c825cc1ef246b8f249fbb687620a9fb55` est confirmé et le dépôt était propre.
- Le checkout runtime ignoré est propre au commit `d421135dcfc802e08655d12c119e18ed715db2ef`.
- Les preuves du Spike 1 ont été lues avant toute modification et préservées.
- Docker client et serveur répondent en version `29.7.2`.

### Règles actuelles

- Participation en ligne, open source, vrai travail dans TrueForge, dépôt public, README, vidéo d'environ trois minutes, courte présentation et divulgation des assistants confirmés sur la page officielle.
- Les règles et la page principale consultées donnent le 30 août 2026 à 20:00 heure de Londres, soit le 30 août à 21:00 CEST à Paris. Cette heure est retenue comme échéance opérationnelle.
- Aucune publication, soumission, création de compte ou écriture externe n'a été réalisée.

### Runtime modèle

- Présence uniquement vérifiée pour OpenAI, Anthropic, Gemini/Google, Fireworks, Z.ai, Moonshot, Together, Alibaba et Daytona : tous `ABSENT`.
- Les valeurs n'ont jamais été lues ni affichées.
- Ollama sur le port 11434, LM Studio sur le port 1234 et un endpoint compatible sur le port 8080 : indisponibles.
- Le code 0.1.4 montre que TrueForge reçoit les clés dans `manifest.auth.api_key` via l'API Settings, pas depuis des variables provider natives.
- Catalogue : 9 presets ; configuration persistée : 0 provider et 0 modèle.
- Aucun vrai tour n'a été tenté, car aucune piste modèle n'était disponible. Aucun résultat n'a été simulé.

### Sandbox

- Le catalogue persistant expose Daytona.
- Aucun credential Daytona n'est présent et `GET /api/v1/settings/sandbox-providers` renvoie 404.
- Le fallback local découvert dans le code exige le mode standalone Linux ; le stack Postgres/Redis qualifié annonce `sandbox.enabled=false`.
- Aucun test Daytona n'a été tenté et aucun identifiant n'a été inventé.

### Redémarrage et état persistant

- `docker compose up -d` : succès.
- `/healthz` : HTTP 200, TrueForge `0.1.4`.
- État public : 0 agent, 0 session, sandbox désactivée.
- `runner/resume_requalification.ps1` exécuté sans secret : runtime `VALID`, clés `ABSENT`, 0 provider, 0 modèle, sandbox `ABSENT`.
- `docker compose stop` : services arrêtés proprement, volumes et preuves locales préservés.

### Décision

`WAITING_FOR_CREDENTIALS`, avec `WAITING_FOR_MODEL_CREDENTIAL` et `WAITING_FOR_DAYTONA_CREDENTIAL`. Le projet n'est ni clos ni déclaré techniquement impossible. La construction s'arrête avant tout développement de soumission conformément à la matrice imposée.

## Spike 2 — reprise après ajout de la clé et branche GO_PIVOT

- Reprise : 24 août 2026, après ajout manuel de la clé Anthropic dans `.env.requalification` ignoré.
- Sécurité : seule la présence de la clé a été observée ; aucune valeur n'a été affichée, journalisée ou versionnée.
- Configuration : fournisseur `anthropic`, modèle `claude-sonnet-5`, Daytona `ABSENT`.

### Modèle réel et persistance

- Agent smoke : `trueforge-model-smoke-20260824` (`01m0t2sa1pqzn7tshr7w7nwz2j`).
- Session : `01m0t2sa252t94hczve49naac3`.
- Tour : `01m0t2sa6jzsh88rvy50699zmy.xgbxag`.
- Résultat exact : `TRUEFORGE_MODEL_OK`, statut `done`, 3 événements persistés, 2 259 tokens au total.
- Après redémarrage du serveur TrueForge : session retrouvée, tour `done`, sortie inchangée.
- Checkpoint : `MODEL_ROUND_TRIP = PASS`, `SESSION_PERSISTENCE = PASS`.

### Scénario Governed Operations Assistant

- Serveur MCP Streamable HTTP local, données fictives, volume Docker persistant.
- Outils découverts par TrueForge : `inspect_records`, `prepare_status_change`, `apply_status_change`, `export_evidence`.
- `apply_status_change` annoncé `readOnlyHint=false`; agent configuré avec approbation native `@write`.
- Agent : `arcadeops-governed-operator-v1` (`01m0t3c90a3y56p5zpmewmcwgm`).
- Session d'acceptation : `01m0t3dpxbyaxe7asnrgxvna05`.

### Tests d'acceptation réels

- Deny : événement `tool.approval_required`, décision humaine `deny`, aucune mutation de `case-101`.
- Allow : second événement `tool.approval_required` dans la même session, décision `allow`, reprise et unique écriture `pending_review → needs_followup`; action `e2fda8ce-e554-432d-a124-60140117f927`.
- Hors autorité : `case-102 → approved` refusé avec `AUTHORITY_DENIED`; état `verified` inchangé.
- Audit MCP corrigé : refus `case-102` persisté avec `outcome=blocked`.
- Redémarrage MCP + TrueForge : session, sortie modèle, écriture unique et refus d'autorité retrouvés.
- Checkpoint : `APPROVAL_AND_RESUME = PASS`, `EVIDENCE_EXPORT = PASS`.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `runner/resume_requalification.ps1 -Configure` | Runtime et modèle `VALID`; Daytona `ABSENT`. |
| Smoke turn TrueForge | `TRUEFORGE_MODEL_OK`, événements persistés. |
| `npm --prefix mcp_server test` | 10/10 réussis, y compris concurrence et anti-rejeu. |
| `docker compose -f compose.mcp.yml up -d --build` | Image construite, audit npm : 0 vulnérabilité, service sain. |
| `python runner/configure_governed_pivot.py` | 4 outils validés, agent mis à jour idempotemment. |
| `python runner/export_go_pivot_receipt.py ...` | `GO_PIVOT_ACCEPTANCE_PASS`, 7 contrôles vrais. |
| redémarrage des deux services puis relecture | Session et états persistés. |

### Décision finale

`GO_PIVOT` — modèle réel, outils MCP réels, approbation native, Deny, Allow, reprise, autorité, persistance et preuve réussis. Daytona et les sous-agents restent non disponibles et non simulés.
