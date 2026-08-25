# Submission copy

## Name

ArcadeOps Mission Control - Approval-Gated Operations

## Tagline

Delegate work to AI agents without delegating unlimited authority.

## Short description

TrueForge runs an AI operator that reaches real MCP tools, delegates independent verification, validates a proposed change with generated code in an isolated sandbox, and pauses before execution. An executable Authority Contract and a persisted Evidence Receipt prove what was allowed, denied, executed, or blocked.

## Full description

AI agents can operate increasingly powerful tools, but capability is not authority. ArcadeOps Mission Control demonstrates a practical separation between the two with a narrow, fictional operations workflow.

The operator runs inside TrueForge. It inspects local case records through a real Streamable HTTP MCP server, delegates exactly one read-only dynamic subagent named `Verifier`, prepares a state-bound status change, and generates a fail-closed Python validator for execution through TrueForge's sandbox. The generated code calls the two read-only tools through TrueForge's sandbox MCP bridge and validates their structured results. Only an exact `SANDBOX_VALIDATION_PASS` result allows the operator to attempt the write. TrueForge then pauses the `@write` tool with its native approval checkpoint and resumes only after the human chooses Allow or Deny.

The MCP server independently enforces an executable Authority Contract. The contract fixes the mission identity, allowed tools, readable resource, writable record and field, allowed values, forbidden actions, approval requirement, evidence requirements, and expiry. It is not prompt decoration. An out-of-scope request for `case-102` returns `AUTHORITY_DENIED`, and a state-bound token prevents replay after the record changes.

TrueForge is the actual harness. It performs the Claude model turns, discovers and invokes MCP tools, creates the Verifier child thread, provisions the Daytona sandbox, persists session and tool events in Postgres, creates the human approval checkpoint, and resumes the pending tool call. The project does not recreate those capabilities.

The Evidence Receipt exporter reads only TrueForge's public session, turn, and event APIs. It fails unless persisted evidence includes the final agent identity, the Verifier and its MCP calls, no Verifier write attempt, a Daytona sandbox id, sandbox `exec`, generated-code use of the MCP bridge, the validation marker before the write, native approval, the human decision, and exactly one authorized write. Earlier receipts separately preserve the real Deny, Allow, authority denial, anti-replay, and restart-recovery paths.

All records and writes are fictional and local. No production account, personal record, or customer system is connected.

## Current submission gate

The MCP, approval, persistence, authority-denial, restart-recovery, and dynamic-Verifier paths are verified. The repository and complete [submission PR](https://github.com/Damso74/arcadeops-mission-control/pull/1) are public, and a clean network clone passes four workflow tests, ten MCP black-box tests, and the npm audit. The final Daytona-integrated receipt remains pending until the participant supplies a real Daytona credential and completes the human approval run. The initial and follow-up Qodo reviews are also pending. Do not submit this copy as final until those gates are replaced by public evidence.

## AI assistance disclosure

Claude Code assisted with the initial spike skeleton, MCP hardening, and black-box test design. OpenAI Codex assisted with implementation, runtime integration, execution, verification, correction, and documentation. Damien reviews the final repository and confirms that he understands and can explain the code before submission.

## Known limitations

- The workflow uses fictional local records rather than production systems.
- TrueForge 0.1.4 events identify the decision as coming from the authenticated local user but do not expose a richer approver profile.
- The custom product UI is intentionally minimal; the demo uses TrueForge's native interface so the harness work remains visible.
