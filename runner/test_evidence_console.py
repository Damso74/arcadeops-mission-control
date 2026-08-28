from __future__ import annotations

import json
import re
import subprocess
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

RECEIPT_DERIVED_IDS = (
    "summary-service",
    "summary-version-before",
    "summary-version-after",
    "summary-rate-before",
    "summary-rate-after",
    "incident-id",
    "mission-id",
    "receipt-check-count",
    "receipt-check-total",
)


class IdCollector(HTMLParser):
    def __init__(self, tracked: tuple[str, ...] = ()) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.text: dict[str, str] = {}
        self._tracked = set(tracked)
        self._current: str | None = None
        self._depth = 0

    def handle_starttag(self, _tag: str, attrs: list[tuple[str, str | None]]) -> None:
        element_id = next((value for name, value in attrs if name == "id" and value), None)
        if element_id:
            self.ids.add(element_id)
        if self._current is not None:
            self._depth += 1
        elif element_id in self._tracked:
            self._current = element_id
            self._depth = 0
            self.text[element_id] = ""

    def handle_endtag(self, _tag: str) -> None:
        if self._current is None:
            return
        if self._depth == 0:
            self._current = None
        else:
            self._depth -= 1

    def handle_data(self, data: str) -> None:
        if self._current is not None:
            self.text[self._current] += data


class EvidenceConsoleTests(unittest.TestCase):
    def test_console_binds_only_to_passing_public_receipts(self) -> None:
        receipt = json.loads((ROOT / "evidence" / "submission-evidence-receipt.json").read_text(encoding="utf-8"))
        trial = json.loads((ROOT / "evidence" / "go-pivot-evidence-receipt.json").read_text(encoding="utf-8"))
        self.assertEqual(receipt["final_status"], "SUBMISSION_ACCEPTANCE_PASS")
        self.assertTrue(all(receipt["verification_results"].values()))
        self.assertEqual(len(receipt["approval_correlated_writes"]), 1)
        self.assertEqual(trial["final_status"], "GO_PIVOT_ACCEPTANCE_PASS")
        self.assertEqual([item["decision"] for item in trial["human_decisions"]], ["deny", "allow"])

    def test_authority_ledger_is_clear_interactive_and_fail_closed(self) -> None:
        html = (ROOT / "evidence_console" / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "evidence_console" / "app.js").read_text(encoding="utf-8")
        parser = IdCollector()
        parser.feed(html)
        required_ids = {
            "console-root",
            "workbench",
            "event-ledger",
            "inspector-comparison",
            "mutation-list",
            "challenge-result",
            "check-groups",
            "trial-disclosure",
        }
        self.assertTrue(required_ids.issubset(parser.ids))
        self.assertIn("Would you trust an agent with production?", html)
        self.assertIn("Break a copy. Watch the real validator refuse it.", html)
        self.assertEqual(html.count('data-mutation="'), 6)
        self.assertIn("browser-local integrity test", html)
        self.assertIn("validateReceipt(receipt)", script)
        self.assertIn("validateReceiptReport(candidate)", script)
        self.assertIn("validateAuthorityTrial(trial)", script)
        self.assertIn("renderFailure(error)", script)
        self.assertIn("0 displayed", script)
        self.assertNotIn("innerHTML", script)
        self.assertIn('data-evidence-status="loading"', html)
        self.assertNotIn("SUBMISSION_ACCEPTANCE_PASS", html)

    def test_markup_carries_no_hardcoded_receipt_identity_or_metrics(self) -> None:
        html = (ROOT / "evidence_console" / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "evidence_console" / "app.js").read_text(encoding="utf-8")
        parser = IdCollector(RECEIPT_DERIVED_IDS)
        parser.feed(html)

        for element_id in RECEIPT_DERIVED_IDS:
            self.assertIn(element_id, parser.text, f"missing element #{element_id}")
            placeholder = parser.text[element_id].strip()
            self.assertTrue(placeholder, f"#{element_id} must keep a visible placeholder")
            self.assertIsNone(re.search(r"\d", placeholder), f"#{element_id} hardcodes {placeholder!r}")
            self.assertIn(f"setText('{element_id}'", script, f"#{element_id} is never receipt-derived")

        for stale in ("18.4%", "0.7%", "v42", "v41", "TF-SAFE-ROLLBACK-001", "2026-08-25"):
            self.assertNotIn(stale, html, f"static markup must not restate {stale}")

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
        for surface in ("page", "surface", "surface-2", "surface-3"):
            self.assertGreaterEqual(contrast(subtle, token(surface)), 4.5, surface)

    def test_receipt_validator_and_cli_reject_adversarial_evidence(self) -> None:
        result = subprocess.run(
            [
                "node",
                "--test",
                str(ROOT / "evidence_console" / "test_receipt_validator.mjs"),
                str(ROOT / "evidence_console" / "test_arcadeops_cli.mjs"),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
