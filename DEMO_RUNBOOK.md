# Three-minute integrated demo runbook

Use only the fictional incidents `INC-2026-042` and `INC-2026-077` and the fictional services `checkout-api` and `identity-api`. Never display credentials, provider settings, browser account details, or unredacted environment files.

## Preflight

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\runner\resume_requalification.ps1
docker compose --env-file .env.requalification -f compose.mcp.yml up -d --build
python runner/configure_submission_agent.py
python -m unittest discover -s runner -p "test_*.py" -v
npm --prefix mcp_server test
```

Required before recording:

- TrueForge, Postgres, Redis and MCP are healthy;
- sandbox capability is `VALID`;
- `arcadeops-mission-control-v2` exists;
- sixteen Python workflow and console tests and fifteen MCP black-box tests pass;
- for a new live run, `checkout-api` is degraded on `v42` and the stable target is `v41`; for the final video, the verified persisted session may be opened instead;
- the final integrated session is either ready to run or already persisted.

## Capture sequence

1. Open <http://127.0.0.1:8791> and select `arcadeops-mission-control-v2`.
2. Show `mcp_server/authority_contract.json`: only one rollback of `checkout-api` from `v42` to `v41` is permitted and `execute_rollback` requires approval.
3. Start the integrated mission with `python runner/start_submission_acceptance.py`, or open the persisted integrated session.
4. Show the parent calling `inspect_incident` and the degraded `18.4%` error rate.
5. Expand Agent steps and show exactly one child thread named `Verifier` calling `inspect_incident` and `prepare_rollback`, with no write tool.
6. Show TrueForge sandbox `exec` running the generated fail-closed Python validator and returning the exact marker `SANDBOX_VALIDATION_PASS`.
7. Show `execute_rollback` paused on TrueForge's native approval card. The participant chooses **Allow** in the UI.
8. Show the same turn resume, exactly one authorized rollback, and the final `inspect_incident` proving `v41`, `healthy`, and `0.7% <= 2.0%`.
9. Open the Evidence Console at <http://127.0.0.1:4173/evidence_console/>. Show the recovered result, the six-step path, and `22 checks passed`, then open the technical evidence panel for the TrueForge, Verifier, Daytona and approval details.

## Evidence export

```powershell
python runner/export_submission_receipt.py `
  --session-id <INTEGRATED_SESSION_ID> `
  --output evidence/submission-evidence-receipt.json
```

The final receipt is valid only if every `verification_results` value is `true` and `final_status` is `SUBMISSION_ACCEPTANCE_PASS`.

## Persisted supporting evidence

- Final integrated Safe Rollback, Daytona, Verifier, human Allow and recovery: session `01m0w4epkt6803zxs2awnhgz8s`.
- Core Deny, Allow, authority denial and restart recovery: session `01m0t3dpxbyaxe7asnrgxvna05`.
- Real model smoke: session `01m0t2sa252t94hczve49naac3`.
- Dynamic Verifier experiment: session `01m0ty0hgxxe6fywrgbjzbjdkg`.

## Stop conditions

Do not record or claim the final path if any of these is true:

- Daytona is absent, pending, failed, or represented only by configuration;
- no `sandbox.created` event exists;
- `exec` did not return `SANDBOX_VALIDATION_PASS`;
- the Verifier attempted `execute_rollback`;
- approval was bypassed or performed by automation;
- more or fewer than one authorized rollback executed;
- no post-action inspection proves the recovery invariant;
- the exporter fails;
- credentials or personal information are visible.
