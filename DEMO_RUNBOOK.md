# Three-minute integrated demo runbook

Use only the fictional records `case-101` and `case-102`. Never display credentials, provider settings, browser account details, or unredacted environment files.

## Preflight

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\runner\resume_requalification.ps1
docker compose --env-file .env.requalification -f compose.mcp.yml up -d --build
python runner/configure_governed_pivot.py
python runner/configure_submission_agent.py
python -m unittest discover -s runner -p "test_*.py" -v
npm --prefix mcp_server test
```

Required before recording:

- TrueForge, Postgres, Redis and MCP are healthy;
- sandbox capability is `VALID`;
- `arcadeops-mission-control-v1` exists;
- four workflow tests and ten MCP black-box tests pass;
- `case-101` is in the expected pre-demo state;
- the final integrated session is either ready to run or already persisted.

## Capture sequence

1. Open <http://127.0.0.1:8791> and select `arcadeops-mission-control-v1`.
2. Show `mcp_server/authority_contract.json`: only `case-101.status` is writable and `apply_status_change` requires approval.
3. Start the integrated mission with `python runner/start_submission_acceptance.py`, or open the persisted integrated session.
4. Show the parent calling `inspect_records`.
5. Expand Agent steps and show exactly one child thread named `Verifier` calling `inspect_records` and `prepare_status_change`, with no write tool.
6. Show TrueForge sandbox `exec` running the generated fail-closed Python validator and returning the exact marker `SANDBOX_VALIDATION_PASS`.
7. Show `apply_status_change` paused on TrueForge's native approval card. The participant chooses **Allow** in the UI.
8. Show the same turn resume and exactly one authorized write complete.
9. Briefly show the earlier persisted Deny path and `AUTHORITY_DENIED` path from session `01m0t3dpxbyaxe7asnrgxvna05`.
10. Show `evidence/submission-evidence-receipt.json`, then the two prior receipts it references.

## Evidence export

```powershell
python runner/export_submission_receipt.py `
  --session-id <INTEGRATED_SESSION_ID> `
  --output evidence/submission-evidence-receipt.json
```

The final receipt is valid only if every `verification_results` value is `true` and `final_status` is `SUBMISSION_ACCEPTANCE_PASS`.

## Persisted supporting evidence

- Core Deny, Allow, authority denial and restart recovery: session `01m0t3dpxbyaxe7asnrgxvna05`.
- Real model smoke: session `01m0t2sa252t94hczve49naac3`.
- Dynamic Verifier experiment: session `01m0ty0hgxxe6fywrgbjzbjdkg`.

## Stop conditions

Do not record or claim the final path if any of these is true:

- Daytona is absent, pending, failed, or represented only by configuration;
- no `sandbox.created` event exists;
- `exec` did not return `SANDBOX_VALIDATION_PASS`;
- the Verifier attempted the write tool;
- approval was bypassed or performed by automation;
- more or fewer than one authorized write executed;
- the exporter fails;
- credentials or personal information are visible.
