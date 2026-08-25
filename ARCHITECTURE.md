# Architecture

## Integrated submission path

```mermaid
flowchart LR
    H[Human in TrueForge UI] -->|mission| TF[TrueForge 0.1.4]
    TF -->|real model turn| M[Claude Sonnet 5]
    M -->|tool calls| TF
    TF -->|Streamable HTTP| MCP[Governed Operations MCP]
    TF -->|dynamic child thread| V[Verifier]
    V -->|read-only MCP calls| MCP
    TF -->|generated Python via exec| D[Daytona sandbox]
    MCP --> AC[Executable Authority Contract]
    MCP --> DS[(Fictional state and audit)]
    TF -->|tool.approval_required| H
    H -->|Allow or Deny| TF
    TF --> PG[(Postgres sessions, turns, events)]
    PG --> EX[Strict evidence exporter]
    EX --> ER[Submission Evidence Receipt]
```

## Sensitive flow

1. The parent calls `inspect_records` for the fictional target.
2. TrueForge creates exactly one dynamic child thread named `Verifier`.
3. The Verifier independently calls `inspect_records` and `prepare_status_change`. It cannot call the write tool.
4. The parent prepares its own current-state-bound change token.
5. The parent generates a fail-closed Python validator and runs it with TrueForge sandbox `exec`.
6. Inside Daytona, the generated code uses TrueForge's pre-installed `mcp_client` bridge to call `inspect_records` and `prepare_status_change`, then checks the observed mission, record, field, before/after values and non-empty token. It prints `SANDBOX_VALIDATION_PASS` only on success.
7. Only after that persisted result does the parent call `apply_status_change`.
8. TrueForge pauses the annotated write and waits for the human Allow/Deny decision.
9. On Allow, the MCP server revalidates the executable contract and current token before one atomic state update.
10. The exporter reconstructs ordering and evidence from public TrueForge APIs and fails if any required link is missing.

## Trust boundaries

- Model instructions are workflow guidance, not a security boundary.
- The Verifier provides independent analysis, not permission.
- Sandbox validation provides isolated deterministic checking, not permission.
- TrueForge is the human-approval and execution-orchestration boundary.
- The executable Authority Contract is the business-authorization boundary.
- The MCP server owns atomic writes, anti-replay and the fictional audit trail.
- The exporter reads public TrueForge APIs. It does not read Postgres directly.
- Model and Daytona credentials stay in local TrueForge settings and never enter the MCP server, repository, receipt, or demo.

## Persistence

TrueForge persists sessions, turns, child threads, sandbox identity and events in Postgres. The MCP uses a Docker volume, atomic file replacement, and an in-process serialization queue so concurrent attempts cannot silently drop evidence.

## Evidence split

- `go-pivot-evidence-receipt.json` proves Deny, Allow, one write, authority denial and restart recovery.
- `verifier-experiment-receipt.json` proves a real dynamic child thread with read-only MCP calls.
- `submission-evidence-receipt.json` is created only by a real integrated Daytona run and must bind the final sequence together.
