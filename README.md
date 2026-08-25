# ArcadeOps Mission Control - Approval-Gated Operations

> Delegate work to AI agents without delegating unlimited authority.

ArcadeOps Mission Control is a fictional, local operations workflow built on TrueForge for the 2026 Agent Harness Hackathon. The final path is deliberately narrow:

`MCP inspection -> dynamic Verifier -> generated sandbox validation -> native approval -> governed write -> evidence receipt`

TrueForge is the runtime, not a wrapper. It performs the model turn, discovers and invokes tools, creates the dynamic subagent, provisions the sandbox, pauses the write for a human decision, resumes the call, and persists the session and events. The project adds an executable Authority Contract and a strict evidence exporter.

All records are fictional. No ArcadeOps production system, customer account, or personal record is connected.

## Evidence status

| Capability | Current evidence | Submission gate |
| --- | --- | --- |
| TrueForge 0.1.4 with Postgres and Redis | Verified | PASS |
| Real Claude model turn | Verified, persisted `TRUEFORGE_MODEL_OK` | PASS |
| Four real MCP tools | Verified | PASS |
| Native `@write` approval | Verified Deny and Allow | PASS |
| Executable Authority Contract | Verified authorized write and `AUTHORITY_DENIED` | PASS |
| Restart recovery | Verified for TrueForge and MCP state | PASS |
| Dynamic `Verifier` subagent | Verified through persisted child-thread events and MCP calls | PASS |
| Daytona sandbox execution with bridged MCP reads | Configuration and strict exporter prepared | **PENDING real credential and run** |
| Public repository and complete submission PR | [Repository](https://github.com/Damso74/arcadeops-mission-control) and [PR #1](https://github.com/Damso74/arcadeops-mission-control/pull/1) published | PASS |
| Qodo review trail | PR ready; Qodo installation pending | **PENDING initial and follow-up reviews** |
| Final three-minute video | Storyboard and local draft available | **PENDING final integrated run** |

The repository must not claim `SUBMISSION_ACCEPTANCE_PASS` until `runner/export_submission_receipt.py` succeeds against a real integrated session. The exporter fails closed when Daytona, sandbox execution, the Verifier, approval, or the authorized write is absent.

## Verified core behavior

- `inspect_records` reads only fictional records.
- `prepare_status_change` validates the Authority Contract and returns a state-bound change token without mutating data.
- `apply_status_change` is annotated as a write. TrueForge pauses it and exposes native Allow/Deny controls.
- A Deny decision leaves state unchanged. A later Allow performs exactly one authorized write.
- A request for `case-102`, outside the contract, is rejected with `AUTHORITY_DENIED`.
- Replayed tokens are rejected and concurrent attempts are all audited.
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
DAYTONA_API_KEY=
```

### 3. Start and configure the runtime

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\runner\resume_requalification.ps1 -Configure
docker compose -f compose.mcp.yml up -d --build
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

Expected: four workflow tests, ten MCP black-box tests, and no production dependency vulnerability.

## Integrated acceptance run

Starting this run invokes a real model and can create Daytona resources. It should be done only by an authorized participant.

```powershell
python runner/start_submission_acceptance.py
```

When TrueForge pauses `apply_status_change`, the participant makes the human decision in <http://127.0.0.1:8791>. The script never approves on the participant's behalf.

After an allowed run completes:

```powershell
python runner/export_submission_receipt.py `
  --session-id <INTEGRATED_SESSION_ID> `
  --output evidence/submission-evidence-receipt.json
```

The receipt requires persisted proof of all of the following: the final agent, exactly one `Verifier`, the Verifier's real MCP calls, no Verifier write, a Daytona sandbox id, sandbox `exec`, generated code using TrueForge's MCP bridge for both read-only tools, the exact `SANDBOX_VALIDATION_PASS` marker before the write, native approval, a human Allow decision, and exactly one executed write.

## Demo and evidence

- [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md): three-minute capture sequence.
- [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md): timed narration and shot list.
- [AUTHORITY_CONTRACT.md](AUTHORITY_CONTRACT.md): human-readable policy.
- [mcp_server/authority_contract.json](mcp_server/authority_contract.json): executable policy.
- [evidence/go-pivot-evidence-receipt.json](evidence/go-pivot-evidence-receipt.json): Deny, Allow, one write and authority denial.
- [evidence/verifier-experiment-receipt.json](evidence/verifier-experiment-receipt.json): real dynamic Verifier proof.
- `evidence/submission-evidence-receipt.json`: created only after the real Daytona-integrated acceptance succeeds.

## Qodo Code Review Evidence

**Gate not yet satisfied.** The complete representative change is public in [PR #1](https://github.com/Damso74/arcadeops-mission-control/pull/1). Before submission, add:

- what Qodo found and what was fixed or intentionally dismissed;
- evidence of the follow-up Qodo review against the final code.

The public `main` branch contains only the initialization commit. PR #1 adds all 54 project files in one reviewable change and must receive Qodo's initial review, remediation, and follow-up review before a human merge.

## Publication status and disclosure

The project is licensed under the [MIT License](LICENSE). The repository and complete PR are public. The PR has not yet received the required Qodo review, been merged, or been submitted to the hackathon.

Claude Code assisted with the initial spike skeleton, MCP hardening, and black-box test design. OpenAI Codex assisted with implementation, runtime integration, execution, verification, correction, and documentation. Damien must review and understand the submitted code before the human merge and submission.

Official rules: <https://www.wemakedevs.org/hackathons/trueforge/rules>

TrueForge: <https://github.com/truefoundry/trueforge>
