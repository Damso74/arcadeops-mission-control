# Submission copy

## Name

ArcadeOps - Human Authority for Autonomous Agents

## Tagline

One action. One human decision. One portable evidence receipt.

## Short description

ArcadeOps demonstrates proof-carrying approval for autonomous agents. TrueForge runs an AI operator that reaches real MCP tools, delegates independent verification, validates a proposed change with generated code in an isolated Daytona sandbox, and pauses at a native human approval gate before execution. A correlated Evidence Receipt carries the records of what was allowed, executed, recovered, or blocked.

## Full description

AI agents can operate increasingly powerful tools, but capability is not authority. ArcadeOps Mission Control demonstrates a practical separation between the two with a narrow, fictional operations workflow.

The operator runs inside TrueForge. It inspects fictional incident `INC-2026-042` through a real Streamable HTTP MCP server and observes `checkout-api` degraded on `v42` with an 18.4% error rate. It delegates exactly one dynamic subagent named `Verifier`, assigned a read-only task; in the observed run that child made two MCP reads and zero write attempts. The operator prepares a state-bound rollback to stable `v41` and generates a fail-closed Python validator for execution through TrueForge's Daytona sandbox. The generated code calls `inspect_incident` and `prepare_rollback` through TrueForge's sandbox MCP bridge and validates their structured results. Only an exact `SANDBOX_VALIDATION_PASS` result allows the operator to attempt the rollback. TrueForge then pauses the explicitly configured `execute_rollback` tool with its native approval checkpoint and resumes only after an Allow or Deny input is received through the local UI.

The MCP server independently enforces the scope declared by an executable Authority Contract. The contract permits only one rollback of `checkout-api` from `v42` to `v41` for the named incident, forbids new deployments and production access, declares that the write requires approval, and expires. TrueForge enforces the native approval pause; separately, the MCP enforces mission, service, versions, state, token expiry, anti-replay and write budget. A request targeting `INC-2026-077`, `identity-api`, or another version pair returns `AUTHORITY_DENIED`.

TrueForge is the actual harness. It performs the Claude model turns, discovers and invokes MCP tools, creates the Verifier child thread, provisions the Daytona sandbox, persists session and tool events in Postgres, creates the human approval checkpoint, and resumes the pending tool call. The project does not recreate those capabilities.

The Evidence Receipt exporter reads only TrueForge's public session, turn, event, capability, and sandbox-provider APIs. It fails unless persisted evidence includes the final agent identity, the Verifier and its MCP calls, no Verifier write attempt, a ready Daytona provider, a real sandbox id, sandbox `exec`, generated-code use of the MCP bridge, the validation marker before the write, native approval, an approval input, exactly one authorized rollback, and a post-action inspection showing `v41`, `healthy`, and an error rate below threshold. The public Authority Ledger turns this persisted chain into an event-by-event Evidence Inspector. Its Challenge view runs six adversarial mutations against an in-memory copy using the same fail-closed validator. It also validates a historical TrueForge receipt recording human Deny and server-side scope refusal with zero state change. It never claims to be a live execution, and it hides every success state if any required proof is invalid.

All records and writes are fictional and local. No production account, personal record, or customer system is connected. This standalone repository's public implementation history begins during the August 24-30 hackathon window and does not connect to the pre-existing ArcadeOps SaaS codebase.

## Current submission gate

The complete Safe Rollback path is verified in persisted TrueForge session `01m15rnk2bggz4dqdbhmcfr7js`: one Verifier with two direct MCP calls and zero write attempts, a real Daytona sandbox, generated read-only MCP-bridge validation, the exact pass marker, a native approval request and Allow input correlated to exactly one rollback, plus pre- and post-action inspections. The strict public Receipt passes all 22 checks and powers a fail-closed Authority Ledger plus portable CLI verifier. That TrueForge session is local by design, so the public audit surface is the versioned Receipt and Ledger. The Daytona sandbox identifier is published only as a SHA-256 digest to keep the tenant-scoped id confidential. Approval was requested at `2026-08-29T03:24:09.170Z` and the Allow input was recorded at `2026-08-29T03:24:42.589Z`, roughly 33 seconds later. The Receipt proves the persisted input and ordering, not an independently authenticated approver identity. All required Python, Receipt-validator, CLI, MCP, responsive-render and dependency-audit suites pass. Nine public PRs were human-merged with automated checks and Qodo evidence; the final submission PR must additionally receive Qodo's final review on its exact SHA before merge. The repository, Authority Ledger and 118-second YouTube demo are public. The participant has confirmed hackathon registration; final submission-form confirmation remains the last administrative proof to retain.

## Submission links

- Repository: <https://github.com/Damso74/arcadeops-mission-control>
- Authority Ledger: <https://damso74.github.io/arcadeops-mission-control/evidence_console/>
- Video: <https://www.youtube.com/watch?v=U9GKftMHWjM>
- Qodo evidence: [#1](https://github.com/Damso74/arcadeops-mission-control/pull/1), [#2](https://github.com/Damso74/arcadeops-mission-control/pull/2), [#3](https://github.com/Damso74/arcadeops-mission-control/pull/3), [#5](https://github.com/Damso74/arcadeops-mission-control/pull/5), [#6](https://github.com/Damso74/arcadeops-mission-control/pull/6), [#7](https://github.com/Damso74/arcadeops-mission-control/pull/7), [#8](https://github.com/Damso74/arcadeops-mission-control/pull/8), and [#9](https://github.com/Damso74/arcadeops-mission-control/pull/9)

## AI assistance disclosure

Claude Code assisted with the initial spike skeleton, MCP hardening, and black-box test design. OpenAI Codex assisted with implementation, runtime integration, execution, verification, correction, and documentation. Damien reviews the final repository and confirms that he understands and can explain the code before submission.

## Known limitations

- The workflow uses fictional local records rather than production systems.
- The persisted event records an approval input received through the local TrueForge UI; the Receipt does not independently authenticate or identify the approver.
- The Authority Ledger is an audit and adversarial-verification surface for persisted missions, not a live operations interface.
- The Receipt validates internal consistency but does not cryptographically attest the JSON's runtime origin or enable public recomputation from the local raw events.
