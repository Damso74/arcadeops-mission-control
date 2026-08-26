# Final demo video script

Target: 1:52 to 2:05. Keep every screen readable and every transition intentional.

## 0:00-0:12 - Hook

**Visual:** ArcadeOps title card.

**Narration:** “Agents can prepare. Humans authorize. ArcadeOps is an approval firewall for autonomous operations: the sandbox proves the change, the human decides, and the receipt proves the outcome.”

## 0:12-0:25 - One bounded mission

**Visual:** Executable Authority Contract.

**Narration:** “Inside TrueForge, checkout API is degraded on version forty-two. The mission is narrow: investigate, verify, and, only if every gate passes, roll back to version forty-one. An executable Authority Contract permits exactly one write. Nothing broader.”

## 0:25-0:42 - Independent verification

**Visual:** Full TrueForge Verifier page and its MCP calls.

**Narration:** “The agent starts with a real M C P inspection: eighteen point four percent errors. Then TrueForge creates one read-only Verifier. It independently checks the incident and prepares the same rollback. It can challenge the plan, but it cannot touch the write tool.”

## 0:42-1:01 - Daytona validation

**Visual:** Full sandbox validation page and `SANDBOX_VALIDATION_PASS`.

**Narration:** “Next, the agent generates a fail-closed Python validator and runs it inside a Daytona sandbox. The code calls the M C P tools again and checks the incident, service, versions, threshold, and token. Without the exact Sandbox Validation Pass result, the workflow stops.”

## 1:01-1:20 - Human authority

**Visual:** Native TrueForge approval checkpoint.

**Narration:** “Only then does the agent request the rollback. TrueForge recognizes the irreversible tool call and pauses. The human sees the exact action and chooses Allow or Deny. No approval is inferred. No click is automated. Authority stays human.”

## 1:20-1:35 - Recovery and containment

**Visual:** Full recovered-state page: `v41`, healthy, `0.7%`.

**Narration:** “After approval, exactly one rollback executes. A fresh inspection proves version forty-one is healthy and the error rate has fallen to zero point seven percent. Replay fails. Concurrent attempts still allow one write. Out-of-scope actions return Authority Denied.”

## 1:35-1:49 - Evidence Receipt

**Visual:** Evidence Console hero, then click `Replay verified mission`. Show the flow pause at the copper human boundary, cross it once, recover the service, and seal `22/22`.

**Narration:** “Finally, the Mission Replay reconstructs the persisted authority chain. Twenty-two checks bind the M C P calls, Verifier, Daytona run, human decision, single write, and recovered service. Remove one proof and every success state disappears.”

## 1:49-1:57 - Close

**Visual:** ArcadeOps end card and the complete five-step rail.

**Narration:** “The agent proposes. The sandbox proves. You decide. TrueForge supplies the harness, and ArcadeOps makes its authority visible, enforceable, and verifiable.”

## Recording checks

- No credential, account email, provider setting, or `.env` content is visible.
- Each live page is shown in full before its gentle detail zoom.
- The native approval is visibly human-controlled.
- Audio plays at natural speed with no artificial time compression.
- The final file passes duration, resolution, audio, complete-playback, and frozen-content checks.
