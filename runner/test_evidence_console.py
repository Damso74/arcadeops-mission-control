from __future__ import annotations

import json
import re
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
            "mission-replay",
            "replay-control",
            "step-control",
            "gate-card",
            "outcome-strip",
            "check-groups",
            "session-link",
        }
        self.assertTrue(required_ids.issubset(parser.ids))
        self.assertEqual(html.count("<h1"), 1)
        self.assertIn("Evidence unavailable", script)
        self.assertIn("https://github.com/Damso74/arcadeops-mission-control#evidence-status", script)
        self.assertIn("Open TrueForge session", script)
        self.assertIn("Inspect public evidence", script)
        self.assertIn("Agents can prepare. Humans authorize.", script)
        self.assertIn("paused at human approval", script)
        self.assertIn("Receipt verified", script)
        self.assertIn("Waiting for human approval", script)
        self.assertIn("Exactly one write unlocked", script)
        self.assertIn("receipt.service_id", script)
        self.assertIn("serviceBefore.deployed_version", script)
        self.assertNotIn("checkout service is degraded", script)
        self.assertNotIn("after a deployment", script)
        self.assertIn("Deterministic replay from persisted evidence", html)
        self.assertIn('aria-live="polite"', html)
        self.assertNotIn("innerHTML", script)
        self.assertIn('data-evidence-status="loading"', html)
        self.assertNotIn("Agents can prepare. Humans authorize.", html)
        self.assertNotIn("SUBMISSION_ACCEPTANCE_PASS", html)

    def test_small_label_contrast_meets_wcag_aa(self) -> None:
        css = (ROOT / "evidence_console" / "styles.css").read_text(encoding="utf-8")

        def token(name: str) -> str:
            match = re.search(rf"--{name}:\s*(#[0-9a-fA-F]{{6}})", css)
            self.assertIsNotNone(match, f"missing CSS token --{name}")
            return match.group(1)

        def luminance(color: str) -> float:
            channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
            linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in channels]
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]

        def contrast(foreground: str, background: str) -> float:
            values = sorted((luminance(foreground), luminance(background)), reverse=True)
            return (values[0] + 0.05) / (values[1] + 0.05)

        subtle = token("subtle")
        for surface in ("page", "surface", "surface-raised", "surface-soft"):
            self.assertGreaterEqual(contrast(subtle, token(surface)), 4.5, surface)

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
