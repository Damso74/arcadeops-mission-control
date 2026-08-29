from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLAIM_FILES = (
    "README.md",
    "ARCHITECTURE.md",
    "AUTHORITY_CONTRACT.md",
    "SUBMISSION.md",
    "DEMO_RUNBOOK.md",
    "VIDEO_SCRIPT.md",
    "demo_assets/NARRATION_DRAFT.txt",
)


class SubmissionClaimTests(unittest.TestCase):
    def texts(self) -> dict[str, str]:
        return {
            relative: (ROOT / relative).read_text(encoding="utf-8")
            for relative in CLAIM_FILES
        }

    def test_stale_or_overstated_claims_are_absent(self) -> None:
        combined = "\n".join(self.texts().values()).lower()
        forbidden = (
            "all seven",
            "seven public prs",
            "authenticated local trueforge user",
            "cannot access the write tool",
            "cannot touch the write tool",
            "replay verified mission",
            "sealed receipt",
            "0 write capability",
        )
        for claim in forbidden:
            self.assertNotIn(claim, combined, claim)

    def test_required_disclosures_and_qodo_evidence_are_present(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        submission = (ROOT / "SUBMISSION.md").read_text(encoding="utf-8")
        boundaries = (ROOT / "docs" / "EVIDENCE_BOUNDARIES.md").read_text(encoding="utf-8")

        for pull_request in ("pull/8", "pull/9"):
            self.assertIn(pull_request, readme)
            self.assertIn(pull_request, submission)
        self.assertIn("## Qodo Code Review Evidence", readme)
        self.assertIn("does not independently authenticate or identify the approver", readme)
        self.assertIn("does not verify a cryptographic approval grant", readme)
        self.assertIn("does not cryptographically attest", boundaries)

    def test_demo_assets_are_described_as_private_inputs(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        demo = (ROOT / "demo_assets" / "README.md").read_text(encoding="utf-8")
        self.assertIn("private capture inputs stay local", readme)
        self.assertIn("Never fabricate an Allow/Deny", demo)


if __name__ == "__main__":
    unittest.main()
