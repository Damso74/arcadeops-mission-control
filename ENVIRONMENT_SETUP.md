# TrueForge submission environment

Current state: the model, authenticated MCP, Verifier, Daytona sandbox, native human approval, persistence, single rollback and recovered postcondition are verified. The strict integrated receipt passes all 22 checks for session `01m0w4epkt6803zxs2awnhgz8s`.

## Fresh clone

```powershell
git clone https://github.com/Damso74/arcadeops-mission-control.git arcadeops-mission-control
Set-Location arcadeops-mission-control

New-Item -ItemType Directory -Force .runtime | Out-Null
git clone https://github.com/truefoundry/trueforge.git .runtime/trueforge
git -C .runtime/trueforge checkout d421135dcfc802e08655d12c119e18ed715db2ef
```

Until PR #1 is merged, add `--branch codex/hackathon-submission --single-branch` to the first clone command. The TrueForge pin is the 0.1.4 runtime used by the verified evidence. `.runtime/` is intentionally ignored and must be created on every fresh clone.

## Local secrets

Copy `.env.example` to the ignored `.env.requalification` file and fill it locally. Never place a real value in the versioned example, chat, issue, pull request, screenshot, receipt, or video.

```dotenv
TRUEFORGE_BASE_URL=http://127.0.0.1:8791
TRUEFORGE_PROVIDER_TYPE=anthropic
TRUEFORGE_PROVIDER_NAME=
TRUEFORGE_PROVIDER_BASE_URL=
TRUEFORGE_MODEL_ID=claude-sonnet-5
TRUEFORGE_MODEL_NAME=Claude Sonnet 5
TRUEFORGE_MODEL_API_KEY=
TRUEFORGE_MCP_AUTH_TOKEN=<generate-locally>
DAYTONA_API_KEY=
```

Generate `TRUEFORGE_MCP_AUTH_TOKEN` locally with `python -c "import secrets; print(secrets.token_urlsafe(32))"`. Store the result only in `.env.requalification`.

`runner/resume_requalification.ps1` imports the ignored file into the process and writes provider manifests to the local TrueForge Settings API. It reports only presence and validity states.

## Start and configure

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\runner\resume_requalification.ps1 -Configure
docker compose --env-file .env.requalification -f compose.mcp.yml up -d --build
python runner/configure_governed_pivot.py
python runner/configure_submission_agent.py
```

The Daytona configuration gate:

1. reads `DAYTONA_API_KEY` only from the process environment;
2. copies the non-secret defaults from TrueForge's sandbox catalog;
3. configures the official provider through the local Settings API;
4. waits for the image build;
5. returns success only when `/api/v1/capabilities` reports sandbox enabled.

With no key, it must fail with `DAYTONA_API_KEY=ABSENT`. With an invalid or unavailable provider, it must fail rather than produce simulated evidence.

## Local verification

```powershell
Get-ChildItem runner\*.py | ForEach-Object { python -m py_compile $_.FullName }
python -m unittest discover -s runner -p "test_*.py" -v
npm --prefix mcp_server test
npm --prefix mcp_server audit --omit=dev
```

## Real integrated run

```powershell
python runner/start_submission_acceptance.py
```

The script may consume model and Daytona resources. It starts the turn but never makes the human approval decision. Use the TrueForge UI for that decision.

After the allowed turn is terminal:

```powershell
python runner/export_submission_receipt.py `
  --session-id <INTEGRATED_SESSION_ID> `
  --output evidence/submission-evidence-receipt.json
```

The hackathon deadline verified on 25 August 2026 is 30 August 2026 at 19:00 UTC, or 21:00 CEST.
