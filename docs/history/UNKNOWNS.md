# UNKNOWNS — surfaces TrueForge vérifiées

> **Historical document.** Preserved exactly as written during the spike and
> upgrade phases. It is superseded by the final submission state described in
> README.md and SUBMISSION.md, and is kept only for traceability.

Les surfaces ont été vérifiées après le squelette initial. Les réponses proviennent de la documentation officielle ou de l'API publique TrueForge 0.1.4.

| Id | Question | Statut | Réponse / source officielle |
| --- | --- | --- | --- |
| U0 | Le brief complet a-t-il été relu ? | RÉPONDUE | Codex a lu la pièce jointe complète et contrôlé les livrables. |
| U1 | Quelles surfaces publiques ? | RÉPONDUE | UI, API HTTP/OpenAPI et SDK TypeScript `@truefoundry/trueforge-sdk` — <https://trueforge.dev/api/overview> |
| U2 | Agent instanciable avec identifiant stable ? | RÉPONDUE | `POST /api/v1/agents` — <https://trueforge.dev/create-agent/overview> |
| U3 | Soumission et trace d'un tour ? | RÉPONDUE | sessions, turns, events et subscribe sous `/api/v1/sessions/...` — <https://trueforge.dev/api/overview> |
| U4 | Sandbox de premier ordre ? | RÉPONDUE | sandbox-as-tool, `config.sandbox.enabled`, Daytona seul provider documenté — <https://trueforge.dev/sandbox> |
| U5 | Approbation humaine hors-process ? | RÉPONDUE | appels d'outils MCP sensibles suspendus ; Allow/Deny dans l'UI — <https://trueforge.dev/create-agent/overview> |
| U6 | Reprise exacte après approbation ? | PARTIELLE | La documentation annonce la reprise du tour ; non testée faute de modèle. |
| U7 | Persistance après arrêt ? | PARTIELLE | SQLite/Postgres et API de session documentés ; aucune session agent réelle n'a pu être redémarrée. |
| U8 | Export de preuve natif ? | PARTIELLE | Événements publics exportables ; aucun Evidence Receipt natif signé confirmé. |
| U9 | Authentification fournisseur ? | RÉPONDUE | Credentials configurés dans Settings/API ; l'OAuth Claude Code n'est pas réutilisable. |
| U10 | Runtime entièrement local ? | RÉPONDUE | Serveur local possible ; modèle externe/compatible requis ; Daytona requis pour la sandbox en 0.1.4. |
| U11 | Mode gratuit/hors-ligne disponible ici ? | RÉPONDUE | Non : aucun modèle ni sandbox disponible dans cet environnement. |

## Décision d'architecture

La sandbox et l'approbation ne doivent pas être confondues. La sandbox exécute les vérifications et interdit les sorties de périmètre. Une action sensible approuvable doit être exposée par un outil MCP local annoté en écriture/destructif ; TrueForge suspend alors l'appel, collecte Allow/Deny dans l'UI et reprend le tour.
