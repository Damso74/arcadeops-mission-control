# Submission copy

## Name

ArcadeOps Mission Control - Approval-Gated Operations

## Tagline

The agent proposes. The sandbox proves. You decide.

## Short description

ArcadeOps is an approval firewall for autonomous agents. TrueForge runs an AI operator that reaches real MCP tools, delegates independent verification, validates a proposed change with generated code in an isolated Daytona sandbox, and pauses at a native human approval gate before execution. One correlated Evidence Receipt proves what was allowed, executed, recovered, or blocked.

## Full description

AI agents can operate increasingly powerful tools, but capability is not authority. ArcadeOps Mission Control demonstrates a practical separation between the two with a narrow, fictional operations workflow.

The operator runs inside TrueForge. It inspects fictional incident `INC-2026-042` through a real Streamable HTTP MCP server and observes `checkout-api` degraded on `v42` with an 18.4% error rate. It delegates exactly one read-only dynamic subagent named `Verifier`, prepares a state-bound rollback to stable `v41`, and generates a fail-closed Python validator for execution through TrueForge's Daytona sandbox. The generated code calls `inspect_incident` and `prepare_rollback` through TrueForge's sandbox MCP bridge and validates their structured results. Only an exact `SANDBOX_VALIDATION_PASS` result allows the operator to attempt the rollback. TrueForge then pauses the explicitly configured `execute_rollback` tool with its native approval checkpoint and resumes only after the human chooses Allow or Deny.

The MCP server independently enforces an executable Authority Contract. The contract permits only one rollback of `checkout-api` from `v42` to `v41` for the named incident, forbids new deployments and production access, requires approval, and expires. It is not prompt decoration. A request targeting `INC-2026-077`, `identity-api`, or another version pair returns `AUTHORITY_DENIED`, and a state-bound token prevents replay after the service changes.

TrueForge is the actual harness. It performs the Claude model turns, discovers and invokes MCP tools, creates the Verifier child thread, provisions the Daytona sandbox, persists session and tool events in Postgres, creates the human approval checkpoint, and resumes the pending tool call. The project does not recreate those capabilities.

The Evidence Receipt exporter reads only TrueForge's public session, turn, event, capability, and sandbox-provider APIs. It fails unless persisted evidence includes the final agent identity, the Verifier and its MCP calls, no Verifier write attempt, a ready Daytona provider, a real sandbox id, sandbox `exec`, generated-code use of the MCP bridge, the validation marker before the write, native approval, the human decision, exactly one authorized rollback, and a post-action inspection proving `v41`, `healthy`, and an error rate below threshold. The public Authority Ledger turns this persisted chain into an event-by-event Evidence Inspector. Its Challenge view runs six adversarial mutations against an in-memory copy using the same fail-closed validator. It also validates a historical TrueForge receipt proving human Deny and server-side scope refusal with zero state change. It never claims to be a live execution, and it hides every success state if any required proof is invalid.

All records and writes are fictional and local. No production account, personal record, or customer system is connected.

## Current submission gate

The complete Safe Rollback path is verified in persisted TrueForge session `01m0w4epkt6803zxs2awnhgz8s`: one Verifier with two direct MCP calls, a real Daytona sandbox, generated read-only MCP-bridge validation, the exact pass marker, native human approval correlated to exactly one rollback, and pre- and post-action inspections. The strict public Receipt passes all 22 checks and powers a fail-closed Authority Ledger plus portable CLI verifier. That TrueForge session is local by design, so the public audit surface is the versioned Receipt and Ledger. The Daytona sandbox identifier is published only as a SHA-256 digest to keep the tenant-scoped id confidential, and it stays correlated to the run through the persisted provider readiness and sandbox execution evidence. The human decision was not instantaneous: approval was requested at `2026-08-25T09:38:46Z` and the Allow was recorded at `2026-08-25T09:53:35Z`, roughly 14 minutes and 48 seconds later. The branch passes twenty Python workflow and console tests, twelve Receipt-validator and CLI tests, sixteen MCP black-box tests, responsive rendered checks, and the npm audit locally. Seven public PRs were human-merged after automated checks, with Qodo review on substantive code changes. The repository, Authority Ledger and 118-second YouTube demo are public. The participant has confirmed hackathon registration; final submission-form receipt remains the last administrative proof to retain.

## Submission links

- Repository: <https://github.com/Damso74/arcadeops-mission-control>
- Authority Ledger: <https://damso74.github.io/arcadeops-mission-control/evidence_console/>
- Video: <https://www.youtube.com/watch?v=4SeSywZ2WL0>
- Qodo-reviewed code PRs: [#1](https://github.com/Damso74/arcadeops-mission-control/pull/1), [#2](https://github.com/Damso74/arcadeops-mission-control/pull/2), [#3](https://github.com/Damso74/arcadeops-mission-control/pull/3), [#5](https://github.com/Damso74/arcadeops-mission-control/pull/5), [#6](https://github.com/Damso74/arcadeops-mission-control/pull/6), and [#7](https://github.com/Damso74/arcadeops-mission-control/pull/7)

## AI assistance disclosure

Claude Code assisted with the initial spike skeleton, MCP hardening, and black-box test design. OpenAI Codex assisted with implementation, runtime integration, execution, verification, correction, and documentation. Damien reviews the final repository and confirms that he understands and can explain the code before submission.

## Known limitations

- The workflow uses fictional local records rather than production systems.
- TrueForge 0.1.4 events identify the decision as coming from the authenticated local user but do not expose a richer approver profile.
- The Authority Ledger is an audit and adversarial-verification surface for persisted missions, not a live operations interface.
