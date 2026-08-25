# Upgrade compétitif — budget maximal 90 minutes

## Cadre

- Début : 2026-08-25T00:21:55+02:00.
- Snapshot protégé : branche locale `submission-go-pivot` au commit `2622a7b`.
- Branche jetable : `codex/daytona-verifier-spike`.
- Règle d'arrêt : aucun PASS simulé ; ne pas modifier l'agent stable ; arrêter Daytona si le credential manque ; ne jamais exposer un secret.

## P0 — snapshot et répétition

- `submission-go-pivot` créé et vérifié au commit exact `2622a7b95bfcd09e11aaf6675c0a761df395969d`.
- Runbook rejoué : TrueForge, Postgres, Redis et MCP sains.
- Modèle : `PRESENT`, configuration `VALID`, un modèle disponible.
- MCP : quatre outils découverts, agent stable mis à jour idempotemment.
- Tests black-box : 10/10.
- Reçu de répétition généré dans un fichier ignoré : `GO_PIVOT_ACCEPTANCE_PASS`, sept contrôles vrais.
- Le reçu historique versionné n'a pas été régénéré.

## Correction réglementaire importante

Les règles officielles consultées le 25 août 2026 imposent Qodo à **toute** soumission : chaque changement substantiel doit passer par une PR GitHub revue avant fusion, puis le README doit contenir `## Qodo Code Review Evidence` avec un lien public, les décisions prises et une revue de suivi. Qodo n'est donc pas un simple bonus post-publication.

État : gate externe non satisfaite. Aucun dépôt n'a été publié et aucune PR n'a été créée.

## P1a — Daytona

- Variable `DAYTONA_API_KEY` : statut `ABSENT`.
- `sandbox.enabled=false`.
- La documentation officielle confirme que Daytona est l'unique fournisseur sandbox pris en charge et qu'une clé API doit être configurée.
- Aucun compte, achat, credential ou sandbox n'a été créé ou simulé.

Verdict Daytona : `WAITING_FOR_DAYTONA_CREDENTIAL`. Le test d'exécution sandbox reste `NOT_RUN`.

## P1b — sous-agent Verifier

- Agent expérimental distinct : `arcadeops-governed-operator-verifier-v1` (`01m0ty0hb86t05h8w09k54t4wh`).
- Agent stable `arcadeops-governed-operator-v1` inchangé.
- Session : `01m0ty0hgxxe6fywrgbjzbjdkg`.
- Tour : `01m0ty0hktnrt0t603ra7jv80k.sm0s40`, statut `done`.
- Un événement `thread.created` pour un unique sous-agent nommé `Verifier`.
- Le Verifier a utilisé MCP via le wrapper natif différé `call_tool` : `inspect_records` et `prepare_status_change`.
- Aucun appel `apply_status_change` dans le tour.
- État après exécution : `case-101=needs_followup`, `case-102=verified`, toujours une seule écriture exécutée au total.
- Reçu : `evidence/verifier-experiment-receipt.json`.

Verdict Verifier : `PASS`.

## Décision

`PARTIAL_UPGRADE`

Le sous-agent réel peut renforcer la candidature. Daytona ne peut pas être qualifié sans action manuelle sur le credential. Le snapshot GO_PIVOT reste le fallback sûr ; aucune fusion automatique n'est recommandée avant un run sandbox réel et un nouveau parcours complet stable.

## Premier brouillon vidéo

- Montage local reproductible : `demo_assets/video-draft.html`.
- Narration : `demo_assets/NARRATION_DRAFT.txt`, synthétisée hors ligne.
- Durée cible : 188 secondes.
- Captures utilisées : approbation refusée, approbation acceptée, refus d'autorité et sous-agent Verifier.
- Binaire local ignoré par Git : `demo_assets/arcadeops-trueforge-demo-draft.webm`.
- Lecture vérifiée dans Chromium : piste vidéo décodée, `readyState=4`, 1280 × 720 et progression réelle.
- Limite du brouillon : le WebM MediaRecorder n'expose pas de durée finie dans les métadonnées ; prévoir un remux ou réencodage avant téléversement si la plateforme le refuse.
- Ce brouillon n'a pas été publié ni téléversé.

## Finalisation de soumission - 25 août 2026

- Branche locale dédiée : `codex/hackathon-finalization`, créée depuis le Verifier vérifié.
- Licence MIT ajoutée.
- Installation d'un clone frais documentée avec TrueForge épinglé au commit `d421135dcfc802e08655d12c119e18ed715db2ef`.
- Agent final préparé : `arcadeops-mission-control-v1`, avec MCP, un Verifier, sandbox activée et approbation `@write`.
- Configuration Daytona préparée avec lecture du catalogue officiel, attente du build et gate `/capabilities`; aucun credential n'est présent et aucune configuration n'a été envoyée.
- Mission intégrée, démarreur et exporteur strict ajoutés. L'exporteur refuse une session Verifier existante car elle ne contient ni Daytona, ni `exec`, ni approval/write intégré.
- Quatre tests unitaires du workflow et les dix tests black-box MCP passent.
- Narration finale hors ligne générée : 173,54 secondes. Le renderer vidéo final reste volontairement bloqué tant que les captures réelles Daytona et reçu final n'existent pas.
- Formulaire d'inscription officiel encore ouvert, mais aucune confirmation d'inscription n'a été retrouvée.
- GitHub CLI authentifié; le nom `Damso74/arcadeops-mission-control` est disponible. Aucun dépôt, permission Qodo, push, PR, merge ou soumission n'a été créé.

État : `LOCAL_FINALIZATION_READY / WAITING_FOR_EXTERNAL_AUTHORIZATION_AND_DAYTONA_CREDENTIAL`.
