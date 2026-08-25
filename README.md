# ArcadeOps Mission Control - Approval-Gated Operations

> Delegate work to AI agents without delegating unlimited authority.

ArcadeOps Mission Control is a fictional, local incident-response workflow built on TrueForge for the 2026 Agent Harness Hackathon. Its hero mission is deliberately narrow: recover a degraded `checkout-api` by rolling back `v42` to the stable `v41`, without giving the agent open-ended deployment authority.

`MCP inspection -> dynamic Verifier -> generated sandbox validation -> native approval -> governed write -> evidence receipt`

TrueForge is the runtime, not a wrapper. It performs the model turn, discovers and invokes tools, creates the dynamic subagent, provisions the sandbox, pauses the write for a human decision, resumes the call, and persists the session and events. The project adds an executable Authority Contract and a strict evidence exporter.

All records are fictional. No ArcadeOps production system, customer account, or personal record is connected.

## Evidence status

| Capability | Current evidence | Submission gate |
| --- | --- | --- |
| TrueForge 0.1.4 with Postgres and Redis | Verified | PASS |
| Real Claude model turn | Verified, persisted `TRUEFORGE_MODEL_OK` | PASS |
| Four real Safe Rollback MCP tools | Verified | PASS |
| Native approval checkpoint | Verified human Allow for `execute_rollback` in the final session | PASS |
| Executable Authority Contract | Verified authorized write and `AUTHORITY_DENIED` | PASS |
| Restart recovery | Verified for TrueForge and MCP state | PASS |
| Dynamic `Verifier` subagent | Verified through persisted child-thread events and two direct MCP calls | PASS |
| Daytona sandbox execution with bridged MCP reads | Verified with a real Daytona sandbox and `SANDBOX_VALIDATION_PASS` | PASS |
| Strict integrated Evidence Receipt | 22/22 persisted checks in session `01m0w4epkt6803zxs2awnhgz8s` | PASS |
| Human-readable Evidence Console | Receipt-backed, responsive, and fail-closed | PASS |
| Public repository and complete submission PRs | [Repository](https://github.com/Damso74/arcadeops-mission-control), [PR #1](https://github.com/Damso74/arcadeops-mission-control/pull/1), and [PR #2](https://github.com/Damso74/arcadeops-mission-control/pull/2) published | PASS |
| Qodo review trail | [PR #1](https://github.com/Damso74/arcadeops-mission-control/pull/1): 6/6 resolved; [PR #2](https://github.com/Damso74/arcadeops-mission-control/pull/2): 8/8 findings from two passes remediated | PASS |
| Final three-minute video | 169-second, 1280×720 final render verified locally | PASS — upload pending |

The strict exporter produced `SUBMISSION_ACCEPTANCE_PASS` for persisted session `01m0w4epkt6803zxs2awnhgz8s`. It validated all 22 required links and still fails closed when the degraded precondition, Daytona, read-only sandbox validation, the Verifier, correlated human approval, the authorized write, or the recovered postcondition is absent.

## Evidence Console

The console turns the receipt into one simple answer: what changed, who approved it, and whether every proof is present. It reads the versioned public receipt directly and shows no success state unless the receipt is `SUBMISSION_ACCEPTANCE_PASS` and every verification result is true.

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Open <http://127.0.0.1:4173/evidence_console/>. The first screen stays outcome-focused; the 22 technical checks remain available behind one disclosure.

## Verified core behavior

- `inspect_incident` reads only the fictional incident and service state.
- `prepare_rollback` validates the Authority Contract and returns a state-bound change token without mutating data.
- `execute_rollback` is annotated as destructive and is explicitly configured for TrueForge's native Allow/Deny pause.
- The contract permits exactly one rollback for `INC-2026-042`: `checkout-api` from `v42` to `v41`.
- A request for `INC-2026-077` or `identity-api`, outside the contract, is rejected with `AUTHORITY_DENIED`.
- Replayed tokens are rejected and concurrent attempts are all audited.
- After an allowed rollback, a fresh MCP inspection must prove `v41`, `healthy`, and an error rate at or below the configured threshold.
- The `Verifier` independently calls the read-only MCP tools and never calls the write tool.

## Responsibility boundaries

| Concern | Owner |
| --- | --- |
| Model loop, sessions, events and persistence | TrueForge |
| MCP discovery and invocation | TrueForge |
| Dynamic subagent lifecycle | TrueForge |
| Daytona sandbox provisioning and `exec` | TrueForge |
| Native Allow/Deny pause and resumption | TrueForge |
| Mission and write scope | Executable Authority Contract |
| Fictional records, atomic state update and audit | Project MCP server |
| Submission receipt | Exporter reading TrueForge public APIs |

## Reproducible setup

Prerequisites: Docker Desktop, Git, Node.js 24, Python 3.12+, one supported model API key, and a Daytona API key. Secrets must remain in the ignored `.env.requalification` file.

### 1. Clone this project and pin TrueForge

```powershell
git clone https://github.com/Damso74/arcadeops-mission-control.git arcadeops-mission-control
Set-Location arcadeops-mission-control

New-Item -ItemType Directory -Force .runtime | Out-Null
git clone https://github.com/truefoundry/trueforge.git .runtime/trueforge
git -C .runtime/trueforge checkout d421135dcfc802e08655d12c119e18ed715db2ef
```

The pinned TrueForge checkout is intentionally ignored by this repository. The commands above are required on a fresh clone.

### 2. Configure secrets locally

```powershell
Copy-Item .env.example .env.requalification
```

Fill only the ignored copy. Never paste credentials into issues, pull requests, logs, screenshots, or the demo video.

```dotenv
TRUEFORGE_BASE_URL=http://127.0.0.1:8791
TRUEFORGE_PROVIDER_TYPE=anthropic
TRUEFORGE_MODEL_ID=claude-sonnet-5
TRUEFORGE_MODEL_NAME=Claude Sonnet 5
TRUEFORGE_MODEL_API_KEY=
TRUEFORGE_MCP_AUTH_TOKEN=<generate-locally>
DAYTONA_API_KEY=
```

Generate the MCP bearer locally and keep it only in the ignored file:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3. Start and configure the runtime

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\runner\resume_requalification.ps1 -Configure
docker compose --env-file .env.requalification -f compose.mcp.yml up -d --build
python runner/configure_governed_pivot.py
python runner/configure_submission_agent.py
```

`configure_daytona.py` reads the official catalog defaults, configures the provider, waits for the TrueForge image build, and exits successfully only when the sandbox capability is actually ready.

### 4. Run the local gates

```powershell
python -m unittest discover -s runner -p "test_*.py" -v
npm --prefix mcp_server test
npm --prefix mcp_server audit --omit=dev
```

Expected: eighteen Python workflow and console tests, seven adversarial Receipt-validator tests, fifteen MCP black-box tests, and no production dependency vulnerability.

## Integrated acceptance run

Starting this run invokes a real model and can create Daytona resources. It should be done only by an authorized participant.

```powershell
python runner/start_submission_acceptance.py
```

When TrueForge pauses `execute_rollback`, the participant makes the human decision in <http://127.0.0.1:8791>. The script never approves on the participant's behalf.

After an allowed run completes:

```powershell
python runner/export_submission_receipt.py `
  --session-id <INTEGRATED_SESSION_ID> `
  --output evidence/submission-evidence-receipt.json
```

The receipt requires persisted proof of all of the following: the final agent, exactly one `Verifier`, the Verifier's real MCP calls, no Verifier write, a Daytona sandbox id, sandbox `exec`, generated code using TrueForge's MCP bridge for both read-only tools, the exact `SANDBOX_VALIDATION_PASS` marker before the write, native approval, a human Allow decision, exactly one executed rollback, and a post-write inspection proving recovery.

## Demo and evidence

- [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md): three-minute capture sequence.
- [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md): timed narration and shot list.
- [AUTHORITY_CONTRACT.md](AUTHORITY_CONTRACT.md): human-readable policy.
- [mcp_server/authority_contract.json](mcp_server/authority_contract.json): executable policy.
- [evidence/go-pivot-evidence-receipt.json](evidence/go-pivot-evidence-receipt.json): historical precursor proving Deny, Allow, one write and authority denial on the earlier status-change spike.
- [evidence/verifier-experiment-receipt.json](evidence/verifier-experiment-receipt.json): historical precursor proving a real dynamic Verifier.
- [evidence/submission-evidence-receipt.json](evidence/submission-evidence-receipt.json): final real Daytona-integrated acceptance, 22/22 checks.
- [evidence_console/index.html](evidence_console/index.html): human-readable, receipt-backed Evidence Console.

## Qodo Code Review Evidence

**Gate satisfied on PR #1.** Qodo found six issues: three high, two medium, and one low. Commit `0adf7f1` replaced forgeable deterministic tokens with random single-use prepared tokens, added fail-closed expiry and caller identity enforcement, derived receipt identities from persisted evidence, prohibited sandbox writes, derived the mission id, and correlated approval, Allow, and execution by tool-call id. Qodo's automatic follow-up against that commit reports **0 bugs** and marks all six findings resolved.

The PR remains intentionally unmerged until the participant performs the required human review and merge. [PR #2](https://github.com/Damso74/arcadeops-mission-control/pull/2) is already open as a stacked PR and contains the Safe Rollback, strict Receipt, and Evidence Console. Across two PR #2 passes, Qodo found eight issues; all eight are covered by the current remediation and adversarial tests.

## Publication status and disclosure

The project is licensed under the [MIT License](LICENSE). The repository and both PRs are public. PR #1 has passed CI, GitGuardian, and the Qodo remediation cycle; PR #2 contains the completed product and its Qodo remediation. Human merge and the final hackathon submission are still pending.

Claude Code assisted with the initial spike skeleton, MCP hardening, and black-box test design. OpenAI Codex assisted with implementation, runtime integration, execution, verification, correction, and documentation. Damien must review and understand the submitted code before the human merge and submission.

Official rules: <https://www.wemakedevs.org/hackathons/trueforge/rules>

TrueForge: <https://github.com/truefoundry/trueforge>
