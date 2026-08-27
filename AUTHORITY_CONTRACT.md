# Authority Contract

The executable contract lives in [`mcp_server/authority_contract.json`](mcp_server/authority_contract.json).

## Granted authority

- Mission: `TF-SAFE-ROLLBACK-001`.
- Logical identity: `arcadeops-mission-control`.
- Readable resources: `incidents:demo` and `services:demo`.
- Allowed tools: `inspect_incident`, `prepare_rollback`, `execute_rollback`, `export_evidence`.
- Write: a single rollback of `checkout-api`, bound to `INC-2026-042`, from `v42` to `v41`.
- Maximum: exactly zero or one write depending on the human decision, never more.
- Approval required for: `execute_rollback`.
- Expiry: 31 December 2026 at 23:59:59 UTC.

## Denied authority

New deployments, identity changes, external network calls and any contact with
production are forbidden. `INC-2026-077`, `identity-api` and every other version
pair appear in no write permission.

## Real enforcement

Every call verifies the mission id, the expiry, the tool and the permission.
Preparation outside the granted authority fails with `AUTHORITY_DENIED` before
any token is issued. Execution revalidates the permission and a SHA-256 derived
from the mission, the incident, the service and the current state; a replayed
token becomes invalid once the state has mutated. After the write, the parent
must inspect the incident again and prove `v41`, the `healthy` status and an
error rate at or below the threshold.

The black-box test proves:

- preparation without any write;
- an authorized and atomic rollback;
- anti-replay;
- refusal of the out-of-scope incident and service with unchanged state;
- persistence of refusals in the audit log;
- exactly one success under concurrent calls with the same token;
- no audit loss under concurrent calls.

Command:

```powershell
npm --prefix mcp_server test
```
