# Three-minute video script

Target: 2:50 to 3:05. Record the real integrated session only after the strict exporter passes.

## 0:00-0:15 - The problem

**Visual:** Title card, then the TrueForge agent library.

**Narration:** “AI agents can operate powerful tools, but access is not authority. ArcadeOps Mission Control delegates the work while keeping the final decision and the permitted scope under explicit control.”

## 0:15-0:35 - TrueForge and the contract

**Visual:** `authority_contract.json`, then the saved `arcadeops-mission-control-v2` agent.

**Narration:** “TrueForge runs the model, tools, subagents, sandbox, approval checkpoint, and persistent session. This executable Authority Contract independently permits one fictional rollback: checkout API from version forty-two to stable version forty-one.”

## 0:35-1:05 - MCP inspection and Verifier

**Visual:** Parent `inspect_incident` showing `18.4%`; expand the single `Verifier` child thread and its two MCP calls.

**Narration:** “The parent observes the degraded service through a real MCP server, then delegates exactly one read-only Verifier. The child independently inspects the incident and prepares the rollback token. It cannot call the write tool.”

## 1:05-1:35 - Generated code in Daytona

**Visual:** TrueForge sandbox card, generated Python validator, `sandbox.created` trace, and `SANDBOX_VALIDATION_PASS` output.

**Narration:** “Next, the agent generates a fail-closed Python validator and executes it in TrueForge's Daytona sandbox. Through TrueForge's MCP bridge, that code inspects the incident and prepares the rollback itself, then checks the mission, service, versions, error rate, threshold, and token. A write is forbidden unless the persisted result contains this exact pass marker.”

## 1:35-2:05 - Native approval and write

**Visual:** Native `execute_rollback` approval card. Human clicks Allow. Show the resumed call and final `inspect_incident`: `v41`, healthy, `0.7%`.

**Narration:** “Only then does the agent attempt the rollback. TrueForge recognizes the MCP write annotation and pauses before execution. The human chooses Allow in the native interface. TrueForge resumes the same turn, performs exactly one rollback, and re-inspects the service to prove recovery.”

## 2:05-2:20 - Fail-closed authority

**Visual:** Test/evidence summary showing replay denial, concurrent single-write enforcement, and `AUTHORITY_DENIED` for `identity-api`.

**Narration:** “The controls fail closed. A stale token cannot be replayed, concurrent attempts produce only one write, and even human approval cannot expand the contract to another incident or service.”

## 2:20-2:50 - Evidence receipt

**Visual:** Evidence Console. Show the recovered result, the six-step path, `22 checks passed`, then open the technical evidence panel.

**Narration:** “The console reads a receipt generated from TrueForge's persisted public APIs. Twenty-two checks bind the model, Verifier, Daytona sandbox, human approval, single rollback, and recovered service. If one proof is missing, both the exporter and this success state fail closed.”

## 2:50-3:00 - Close

**Visual:** Project title and architecture line.

**Narration:** “TrueForge provides the harness. ArcadeOps adds enforceable authority and verifiable evidence. Delegate the work, never unlimited authority.”

## Recording checks

- No credential, account email, provider settings, or `.env` content is visible.
- The sandbox card and exact validation marker are readable at normal video resolution.
- The native approval click is performed by the participant, not automated.
- The final frame includes repository and demo links only after they are public.
