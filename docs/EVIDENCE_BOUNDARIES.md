# Evidence boundaries

ArcadeOps publishes a versioned Receipt exported from persisted TrueForge APIs.
The public validator checks a fixed set of required correlations and fails closed
when any required field, identity, event order, tool result or postcondition is
missing or inconsistent.

## What the Receipt validates

- one persisted TrueForge session and resolved submission agent;
- exactly one Verifier child with two observed MCP reads and zero write attempts;
- a ready Daytona provider, sandbox execution and the exact validation marker;
- validation before the governed write;
- a native approval request and approval input correlated to the write call;
- exactly one applied rollback inside the declared mission scope;
- a fresh postcondition on the target version and healthy error threshold;
- all required checks before any operational success is displayed.

## What the Receipt does not attest

The Receipt does not cryptographically attest its runtime origin or the human
identity behind the approval input. In particular, it does not provide:

- the cryptographic origin or authenticity of the exported JSON;
- the civil or independently authenticated identity of the approver;
- a public recomputation from raw TrueForge events, which remain local;
- a signed approval grant consumed and verified by the MCP server;
- protection against fabrication of an entirely new, internally consistent JSON.

TrueForge enforces the native Allow/Deny pause and resumes the pending call.
Separately, the Governed Operations MCP server enforces mission scope, current
state, token expiry, anti-replay and the one-write budget. The public Receipt
records and correlates those outcomes; it is not a cryptographic attestation.
