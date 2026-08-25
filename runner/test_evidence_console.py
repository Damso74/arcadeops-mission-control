from __future__ import annotations

import json
import subprocess
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class IdCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()

    def handle_starttag(self, _tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name == "id" and value:
                self.ids.add(value)


class EvidenceConsoleTests(unittest.TestCase):
    def test_console_binds_only_to_a_passing_public_receipt(self) -> None:
        receipt = json.loads((ROOT / "evidence" / "submission-evidence-receipt.json").read_text(encoding="utf-8"))
        self.assertEqual(receipt["final_status"], "SUBMISSION_ACCEPTANCE_PASS")
        self.assertTrue(all(receipt["verification_results"].values()))
        self.assertEqual(len(receipt["approval_correlated_writes"]), 1)
        self.assertTrue(receipt["precondition_inspections"])
        self.assertTrue(receipt["postcondition_inspections"])

    def test_console_has_one_clear_surface_and_fail_closed_copy(self) -> None:
        html = (ROOT / "evidence_console" / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "evidence_console" / "app.js").read_text(encoding="utf-8")
        parser = IdCollector()
        parser.feed(html)
        required_ids = {
            "console-root",
            "page-title",
            "evidence-state",
            "proof",
            "check-list",
            "session-link",
        }
        self.assertTrue(required_ids.issubset(parser.ids))
        self.assertEqual(html.count("<h1"), 1)
        self.assertIn("Evidence unavailable", script)
        self.assertNotIn("innerHTML", script)
        self.assertIn('data-evidence-status="loading"', html)
        self.assertNotIn("Mission complete · human approved", html)
        self.assertNotIn("Checkout recovered.", html)

    def test_receipt_validator_rejects_incomplete_or_uncorrelated_evidence(self) -> None:
        result = subprocess.run(
            ["node", "--test", str(ROOT / "evidence_console" / "test_receipt_validator.mjs")],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
