# Final demo video script

Target: 1:50 to 2:05. The first 25 seconds must make the problem, product, and
TrueForge fit obvious without requiring repository context.

## 0:00-0:10 - Hook

**Visual:** Authority Ledger hero, then the copper approval boundary.

**Narration:** “Would you trust an autonomous agent with production? You do not
have to. ArcadeOps separates what an agent can do from what a human actually
authorizes.”

## 0:10-0:24 - One bounded mission

**Visual:** Executable Authority Contract beside the fictional incident.

**Narration:** “Inside TrueForge, checkout API is degraded on version forty-two.
The mission is narrow: inspect, verify, and, only if every gate passes, roll back
to stable version forty-one. The server permits one write. Nothing broader.”

## 0:24-0:40 - Independent Verifier

**Visual:** TrueForge Verifier child and its two persisted MCP calls.

**Narration:** “TrueForge creates a read-only Verifier. It independently inspects
the incident and prepares the same rollback through real MCP tools. It can
challenge the plan, but it never receives the write tool.”

## 0:40-0:56 - Daytona

**Visual:** Daytona sandbox execution and exact validation marker.

**Narration:** “The agent then generates a fail-closed validator. Daytona runs it
in isolation through the read-only MCP bridge. It checks the incident, target,
threshold, and token. Without the exact pass result, the workflow stops.”

## 0:56-1:13 - Human authority

**Visual:** Native TrueForge approval checkpoint, held long enough to read the
tool and target. Do not click on behalf of the reviewer.

**Narration:** “Only then can the agent request execution. TrueForge pauses the
governed write and shows the exact action to a human. Allow releases this single
identity. Deny produces zero writes. Approval is explicit, state-bound, and not
reusable.”

## 1:13-1:27 - One write, fresh proof

**Visual:** Governed write, then postcondition `v41`, `healthy`, `0.7%`.

**Narration:** “After Allow, exactly one rollback executes. A fresh MCP inspection
proves version forty-one is healthy and the error rate fell from eighteen point
four to zero point seven percent. Replay and concurrent writes still fail.”

## 1:27-1:43 - Authority Ledger

**Visual:** Select the Human Allow event, show expected versus observed identity,
then open the source records.

**Narration:** “The public Authority Ledger reconstructs that persisted chain.
Every event exposes the source records and correlation: Verifier, Daytona,
human decision, one write, and recovery. Twenty-two checks must agree.”

## 1:43-1:55 - Break it

**Visual:** Challenge tab. Click `Duplicate the write`, then `Break call identity`.
Show `MODIFIED RECEIPT REJECTED` and `0 displayed`.

**Narration:** “Do not take our word for it. Duplicate the write or break its
identity: the same validator rejects the copy and hides every success claim.
Human Deny and out-of-scope refusal are also backed by a persisted TrueForge
trial.”

## 1:55-2:02 - Close

**Visual:** Evidence tab with CLI command, then end card.

**Narration:** “The agent proposes. The sandbox proves. You decide. ArcadeOps
makes autonomous authority visible, enforceable, and independently verifiable.”

## Recording checks

- No credential, account email, provider setting, or `.env` content is visible.
- Show each page at a readable scale before any detail zoom.
- Keep the native approval visibly human-controlled.
- Use the real Authority Ledger, not a composited mockup.
- Audio is natural-speed and manually reviewed from start to finish.
- Final file passes duration, 1280×720 resolution, audio, complete playback, and
  distinct-frame progression checks.
