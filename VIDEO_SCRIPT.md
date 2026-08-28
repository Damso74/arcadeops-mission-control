# Final demo video script

Target: 1:58 to 2:00. These timings match the verified 118.7-second natural
narration track used by the reproducible renderer.

## 0:00-0:12 - Hook

**Visual:** ArcadeOps title card and bounded-authority thesis.

**Narration:** “An AI agent can roll back a broken service. The hard question is
not whether it can act. It is who gets to say yes, what is allowed, and whether
the result can be proved. This is ArcadeOps.”

## 0:12-0:25 - One bounded mission

**Visual:** Executable Authority Contract beside the fictional incident.

**Narration:** “Inside TrueForge, checkout API is degraded on version forty-two.
The mission is narrow: investigate, verify, and, only if every gate passes, roll
back to version forty-one. An executable Authority Contract permits exactly one
write. Nothing broader.”

## 0:25-0:43 - Independent Verifier

**Visual:** TrueForge Verifier child and its two persisted MCP calls.

**Narration:** “The agent starts with a real MCP inspection: eighteen point four
percent errors. Then TrueForge creates one read-only Verifier. It independently
checks the incident and prepares the same rollback. It can challenge the plan,
but it cannot touch the write tool.”

## 0:43-1:02 - Daytona

**Visual:** Daytona sandbox execution and exact validation marker.

**Narration:** “Next, the agent generates a fail-closed Python validator and runs
it inside a Daytona sandbox. The code calls the MCP tools again and checks the
incident, service, versions, threshold, and token. Without the exact Sandbox
Validation Pass result, the workflow stops.”

## 1:02-1:21 - Human authority

**Visual:** Native TrueForge approval checkpoint, held long enough to read the
tool and target. Do not click on behalf of the reviewer.

**Narration:** “Only then does the agent request the rollback. TrueForge
recognizes the irreversible tool call and pauses. The human sees the exact
action and chooses Allow or Deny. No approval is inferred. No click is automated.
Authority stays human.”

## 1:21-1:36 - One write, fresh proof

**Visual:** Governed write, then postcondition `v41`, `healthy`, `0.7%`.

**Narration:** “After approval, exactly one rollback executes. A fresh inspection
proves version forty-one is healthy and the error rate has fallen to zero point
seven percent. Replay fails. Concurrent attempts still allow one write.
Out-of-scope actions return Authority Denied.”

## 1:36-1:43 - Authority Ledger

**Visual:** Select the Human Allow event, show expected versus observed identity,
then open the source records.

**Narration:** “Finally, the Evidence Console turns the persisted session into a
receipt anyone can inspect.”

## 1:43-1:47 - Portable evidence

**Visual:** Evidence tab with the CLI and exact 22/22 check groups.

**Narration:** “Twenty-two checks bind the MCP calls, Verifier, Daytona run,
validation result, human decision, single write, and recovered service.”

## 1:47-1:50 - Break it

**Visual:** Challenge tab. Click `Duplicate the write`, then `Break call identity`.
Show `MODIFIED RECEIPT REJECTED` and `0 displayed`.

**Narration:** “Remove one proof and success disappears. Evidence, not trust.”

## 1:50-1:59 - Close

**Visual:** ArcadeOps end card and complete five-step rail.

**Narration:** “TrueForge supplies the harness. ArcadeOps makes authority
enforceable. The agent does the work. The human keeps the decision. The receipt
proves the outcome.”

## Recording checks

- No credential, account email, provider setting, or `.env` content is visible.
- Show each page at a readable scale before any detail zoom.
- Keep the native approval visibly human-controlled.
- Use the real Authority Ledger, not a composited mockup.
- Audio is natural-speed and manually reviewed from start to finish.
- Final file passes duration, 1280×720 resolution, audio, complete playback, and
  distinct-frame progression checks.
