# Three-minute video script

Target: 2:50 to 3:05. Record the real integrated session only after the strict exporter passes.

## 0:00-0:15 - The problem

**Visual:** Title card, then the TrueForge agent library.

**Narration:** “AI agents can operate powerful tools, but access is not authority. ArcadeOps Mission Control delegates the work while keeping the final decision and the permitted scope under explicit control.”

## 0:15-0:35 - TrueForge and the contract

**Visual:** `authority_contract.json`, then the saved `arcadeops-mission-control-v1` agent.

**Narration:** “TrueForge runs the model, tools, subagents, sandbox, approval checkpoint, and persistent session. This executable Authority Contract independently limits the mission to one fictional record, one field, and two allowed values.”

## 0:35-1:05 - MCP inspection and Verifier

**Visual:** Parent `inspect_records`; expand the single `Verifier` child thread and its two MCP calls.

**Narration:** “The parent reads the record through a real MCP server, then delegates exactly one read-only Verifier. The child independently inspects the same data and prepares the proposed transition. It cannot call the write tool.”

## 1:05-1:35 - Generated code in Daytona

**Visual:** TrueForge sandbox card, generated Python validator, `sandbox.created` trace, and `SANDBOX_VALIDATION_PASS` output.

**Narration:** “Next, the agent generates a fail-closed Python validator and executes it in TrueForge's Daytona sandbox. Through TrueForge's MCP bridge, that code reads and prepares the change itself, then checks the mission, target, state, allowed value, and token. A write is forbidden unless the persisted result contains this exact pass marker.”

## 1:35-2:05 - Native approval and write

**Visual:** Native `apply_status_change` approval card. Human clicks Allow. Show resumed call and before/after result.

**Narration:** “Only then does the agent attempt the write. TrueForge recognizes the MCP write annotation and pauses before execution. The human chooses Allow in the native interface. TrueForge resumes the same turn, and the server performs exactly one authorized state change.”

## 2:05-2:25 - Deny and authority refusal

**Visual:** Short cuts from the prior persisted session: Deny with unchanged state, then `AUTHORITY_DENIED` for `case-102`.

**Narration:** “The controls fail closed. A recorded Deny left the state untouched. Human approval cannot expand the contract either: an attempted change to case one zero two was rejected as outside authority.”

## 2:25-2:50 - Evidence receipt

**Visual:** `submission-evidence-receipt.json`, highlighting verification results, sandbox id, child thread, approval, and executed write.

**Narration:** “The receipt is generated from TrueForge's persisted public APIs. It verifies the model, Verifier, Daytona sandbox, generated-code result, approval, ordering, and single write. If any proof is missing, the exporter fails.”

## 2:50-3:00 - Close

**Visual:** Project title and architecture line.

**Narration:** “TrueForge provides the harness. ArcadeOps adds enforceable authority and verifiable evidence. Delegate the work, never unlimited authority.”

## Recording checks

- No credential, account email, provider settings, or `.env` content is visible.
- The sandbox card and exact validation marker are readable at normal video resolution.
- The native approval click is performed by the participant, not automated.
- The final frame includes repository and demo links only after they are public.
