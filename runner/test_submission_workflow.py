from __future__ import annotations

import unittest

from configure_submission_agent import AGENT_NAME, submission_manifest
from export_submission_receipt import effective_call, response_payload


class SubmissionWorkflowTests(unittest.TestCase):
    def test_manifest_enables_all_hackathon_capabilities(self) -> None:
        manifest = submission_manifest("anthropic/test-model")

        self.assertEqual(AGENT_NAME, "arcadeops-mission-control-v1")
        self.assertTrue(manifest["config"]["sandbox"]["enabled"])
        self.assertTrue(manifest["config"]["dynamic_sub_agents"]["enabled"])
        self.assertEqual(manifest["mcp_servers"][0]["require_approval_for_tools"], ["@write"])
        self.assertIn("SANDBOX_VALIDATION_PASS", manifest["instructions"])
        self.assertIn("Verifier must never call apply_status_change", manifest["instructions"])

    def test_effective_call_unwraps_deferred_mcp_transport(self) -> None:
        call = {
            "id": "call-1",
            "function": {
                "name": "call_tool",
                "arguments": '{"mcp_server":"governed-operations","tool_name":"inspect_records"}',
            },
            "tool_info": {"type": "truefoundry-system", "mcp_server_name": "deferred_tools"},
        }
        event = {"thread_id": "child", "created_at": "2026-08-25T00:00:00Z"}

        parsed = effective_call(call, event)

        self.assertEqual(parsed["tool"], "inspect_records")
        self.assertEqual(parsed["server"], "governed-operations")
        self.assertEqual(parsed["tool_type"], "mcp")

    def test_effective_call_identifies_sandbox_exec(self) -> None:
        call = {
            "id": "call-2",
            "function": {
                "name": "exec",
                "arguments": '{"intent":"validate","command":"from mcp_client import call_tool # inspect_records prepare_status_change"}',
            },
            "tool_info": {
                "type": "truefoundry-system",
                "mcp_server_name": "sandbox",
                "original_tool_name": "exec",
            },
        }

        parsed = effective_call(call, {"thread_id": "main", "created_at": "2026-08-25T00:01:00Z"})

        self.assertEqual(parsed["tool"], "exec")
        self.assertEqual(parsed["server"], "sandbox")
        self.assertTrue(parsed["sandbox_command_evidence"]["uses_mcp_client"])
        self.assertTrue(parsed["sandbox_command_evidence"]["mentions_inspect_records"])
        self.assertTrue(parsed["sandbox_command_evidence"]["mentions_prepare_status_change"])
        self.assertNotIn("command", parsed["sandbox_command_evidence"])

    def test_response_payload_unwraps_mcp_error_envelope(self) -> None:
        event = {
            "content": '{"error":[{"type":"text","text":"{\\"error\\":\\"AUTHORITY_DENIED: scope\\"}"}]}'
        }

        self.assertEqual(response_payload(event), {"error": "AUTHORITY_DENIED: scope"})


if __name__ == "__main__":
    unittest.main()
