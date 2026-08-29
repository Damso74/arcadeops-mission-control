# Demo renderer and private inputs

The renderer and verification scripts are versioned. Screenshots, narration
audio and generated video stay local because captures can contain account or
tenant-scoped runtime details.

## Expected local inputs

`video-final.html` expects these 1280x720-compatible visual inputs:

- `01-inspect-verifier.png` - parent inspection and Verifier evidence;
- `02-sandbox-validation.png` - Daytona execution and validation marker;
- `03-human-allow.png` - native TrueForge approval card or resolved approval evidence;
- `04-postcondition-authority.png` - single write and fresh postcondition;
- `04-submission-receipt.png` - correlated Receipt details;
- `05-authority-ledger.png` - public Ledger mission view;
- `06-challenge-rejected.png` - fail-closed mutation result;
- `07-portable-evidence.png` - CLI and 22-check evidence view;
- `narration-final.wav` - final narration track.

Generated outputs include previews and `arcadeops-trueforge-demo-final.webm`.

## Privacy gate

Before rendering or publication, inspect every capture for account email,
provider settings, secrets, `.env` content, tenant-scoped Daytona identifiers,
personal notifications and unrelated conversation history. Keep sufficient
TrueForge UI chrome to establish that the harness is real.

The approval scene must show a real native card. Never fabricate an Allow/Deny
checkpoint from a post-execution recap. The participant must make the decision;
if UI activation is delegated, describe it as delegated rather than claiming a
physically direct click. The Receipt itself does not authenticate the approver.

## Local commands

Serve the repository from its root:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then, from another terminal:

```powershell
npm --prefix demo_assets run preview
npm --prefix demo_assets run render
npm --prefix demo_assets run verify
```

The verification checks duration, 1280x720 resolution, audio decoding, complete
playback and distinct visual progression. It does not replace a full human watch
at normal speed with sound.
