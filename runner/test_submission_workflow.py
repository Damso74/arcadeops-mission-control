from __future__ import annotations

import json
import unittest

from configure_governed_pivot import mcp_manifest
from configure_submission_agent import AGENT_NAME, submission_manifest
from export_go_pivot_receipt import correlated_executed_action_ids
from export_go_pivot_receipt import observed_mission_id as observed_go_pivot_mission_id
from export_submission_receipt import (
    correlated_executed_writes,
    effective_call,
    observed_mission_id,
    response_payload,
)
from run_verifier_experiment import persisted_model_name


class SubmissionWorkflowTests(unittest.TestCase):
    def test_mcp_manifest_binds_bearer_to_authority_identity(self) -> None:
        token = "test-token-" + "x" * 32
        manifest = mcp_manifest("http://mcp.test/mcp", token)

        self.assertEqual(manifest["auth"]["type"], "header")
        self.assertEqual(manifest["auth"]["headers"]["Authorization"], f"Bearer {token}")
        self.assertEqual(manifest["auth"]["headers"]["X-Agent-Identity"], "arcadeops-governed-operator")

    def test_mcp_manifest_rejects_missing_or_short_secret(self) -> None:
        for token in (None, "too-short"):
            with self.subTest(token=token):
                with self.assertRaisesRegex(RuntimeError, "TRUEFORGE_MCP_AUTH_TOKEN"):
                    mcp_manifest("http://mcp.test/mcp", token)

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
                "arguments": '{"mcp_server":"governed-operations","tool_name":"inspect_records",'
                '"input":{"mission_id":"mission-deferred"}}',
            },
            "tool_info": {"type": "truefoundry-system", "mcp_server_name": "deferred_tools"},
        }
        event = {"thread_id": "child", "created_at": "2026-08-25T00:00:00Z"}

        parsed = effective_call(call, event)

        self.assertEqual(parsed["tool"], "inspect_records")
        self.assertEqual(parsed["server"], "governed-operations")
        self.assertEqual(parsed["tool_type"], "mcp")
        self.assertEqual(parsed["mission_id"], "mission-deferred")

    def test_effective_call_identifies_sandbox_exec(self) -> None:
        call = {
            "id": "call-2",
            "function": {
                "name": "exec",
                "arguments": json.dumps({
                    "intent": "validate",
                    "command": (
                        "from mcp_client import call_tool\n"
                        "call_tool('governed-operations', 'inspect_records', {})\n"
                        "call_tool('governed-operations', 'prepare_status_change', {})"
                    ),
                }),
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
        self.assertFalse(parsed["sandbox_command_evidence"]["mentions_apply_status_change"])
        self.assertTrue(parsed["sandbox_command_evidence"]["read_only_bridge"])
        self.assertNotIn("command", parsed["sandbox_command_evidence"])

    def test_effective_call_flags_a_literal_or_dynamically_named_sandbox_write(self) -> None:
        call = {
            "id": "call-dangerous",
            "function": {
                "name": "exec",
                "arguments": json.dumps({
                    "command": (
                        "from mcp_client import call_tool\n"
                        "call_tool('governed-operations', 'inspect_records', {})\n"
                        "call_tool('governed-operations', 'prepare_status_change', {})\n"
                        "name = 'apply_' + 'status_change'\n"
                        "call_tool('governed-operations', name, {})"
                    )
                }),
            },
            "tool_info": {"type": "truefoundry-system", "mcp_server_name": "sandbox"},
        }

        parsed = effective_call(call, {"thread_id": "main"})

        self.assertFalse(parsed["sandbox_command_evidence"]["mentions_apply_status_change"])
        self.assertFalse(parsed["sandbox_command_evidence"]["read_only_bridge"])

    def test_submission_mission_is_derived_from_observed_calls(self) -> None:
        calls = [{"server": "governed-operations", "tool_call_id": "call-1", "mission_id": "mission-observed"}]
        responses = {"call-1": {"payload": {"mission_id": "mission-observed"}}}

        self.assertEqual(observed_mission_id(calls, responses), "mission-observed")

    def test_submission_mission_rejects_missing_or_conflicting_evidence(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "exactly one observed mission_id"):
            observed_mission_id([], {})
        with self.assertRaisesRegex(RuntimeError, "exactly one observed mission_id"):
            observed_mission_id(
                [
                    {"server": "governed-operations", "tool_call_id": "one", "mission_id": "mission-one"},
                    {"server": "governed-operations", "tool_call_id": "two", "mission_id": "mission-two"},
                ],
                {},
            )

    def test_go_pivot_mission_is_derived_without_exposing_change_token(self) -> None:
        tool_calls = {
            "call-1": {
                "tool_type": "mcp",
                "arguments": {"mission_id": "mission-go-pivot"},
            }
        }
        responses = {"call-1": {"payload": {"mission_id": "mission-go-pivot", "applied": True}}}

        self.assertEqual(observed_go_pivot_mission_id(tool_calls, responses), "mission-go-pivot")

    def test_write_evidence_requires_matching_approval_and_allow_ids(self) -> None:
        writes = [{"tool_call_id": "write-1"}]
        unrelated_approvals = [{"tool_call_id": "other"}]
        unrelated_decisions = [{"tool_call_id": "other", "decision": "allow"}]

        self.assertEqual(correlated_executed_writes(writes, unrelated_approvals, unrelated_decisions), [])
        self.assertEqual(
            correlated_executed_action_ids(writes, unrelated_approvals, unrelated_decisions),
            set(),
        )

        approvals = [{"tool_call_id": "write-1"}]
        decisions = [{"tool_call_id": "write-1", "decision": "allow"}]
        self.assertEqual(correlated_executed_writes(writes, approvals, decisions), writes)
        self.assertEqual(correlated_executed_action_ids(writes, approvals, decisions), {"write-1"})

    def test_verifier_model_is_derived_from_persisted_agent(self) -> None:
        agent = {"manifest": {"model": {"name": "anthropic/test-model"}}}

        self.assertEqual(persisted_model_name(agent), "anthropic/test-model")
        with self.assertRaisesRegex(RuntimeError, "model identity"):
            persisted_model_name({"manifest": {"model": {}}})

    def test_response_payload_unwraps_mcp_error_envelope(self) -> None:
        event = {
            "content": '{"error":[{"type":"text","text":"{\\"error\\":\\"AUTHORITY_DENIED: scope\\"}"}]}'
        }

        self.assertEqual(response_payload(event), {"error": "AUTHORITY_DENIED: scope"})


if __name__ == "__main__":
    unittest.main()
