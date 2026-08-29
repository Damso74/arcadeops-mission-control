from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from configure_governed_pivot import mcp_manifest
from configure_submission_agent import AGENT_NAME, submission_manifest
from export_submission_receipt import (
    correlate_sandbox_exec_calls,
    correlated_executed_writes,
    effective_call,
    governed_verifier_calls,
    is_daytona_provider_ready,
    is_daytona_sandbox_id,
    is_degraded_precondition,
    is_recovered_postcondition,
    observed_mission_id,
    response_payload,
    resolve_approval_call,
    sandbox_command_evidence,
    strict_python_bridge_tools,
    summarize_thread_event,
)
from run_verifier_experiment import persisted_model_name


class SubmissionWorkflowTests(unittest.TestCase):
    def test_manifest_enables_all_hackathon_capabilities(self) -> None:
        manifest = submission_manifest("anthropic/test-model")

        self.assertEqual(AGENT_NAME, "arcadeops-mission-control-v2")
        self.assertTrue(manifest["config"]["sandbox"]["enabled"])
        self.assertTrue(manifest["config"]["dynamic_sub_agents"]["enabled"])
        self.assertEqual(manifest["mcp_servers"][0]["enable_tools"], ["@all"])
        self.assertEqual(manifest["mcp_servers"][0]["require_approval_for_tools"], ["execute_rollback"])
        self.assertIn("SANDBOX_VALIDATION_PASS", manifest["instructions"])
        self.assertIn("Verifier must never call execute_rollback", manifest["instructions"])
        self.assertIn("inspect_incident again", manifest["instructions"])

    def test_effective_call_unwraps_deferred_mcp_transport(self) -> None:
        call = {
            "id": "call-1",
            "function": {
                "name": "call_tool",
                "arguments": '{"mcp_server":"governed-operations","tool_name":"inspect_incident","input":{"mission_id":"mission-1"}}',
            },
            "tool_info": {"type": "truefoundry-system", "mcp_server_name": "deferred_tools"},
        }
        event = {"thread_id": "child", "created_at": "2026-08-25T00:00:00Z"}

        parsed = effective_call(call, event)

        self.assertEqual(parsed["tool"], "inspect_incident")
        self.assertEqual(parsed["server"], "governed-operations")
        self.assertEqual(parsed["tool_type"], "mcp")
        self.assertEqual(parsed["mission_id"], "mission-1")

    def test_effective_call_identifies_sandbox_exec(self) -> None:
        validator = (
            "cat > /tmp/validator.py << 'EOF'\n"
            "from mcp_client import call_tool\n"
            "async def main():\n"
            "    await call_tool('governed-operations', 'inspect_incident', body={})\n"
            "    await call_tool('governed-operations', 'prepare_rollback', body={})\n"
            "EOF\n"
            "python3 /tmp/validator.py"
        )
        call = {
            "id": "call-2",
            "function": {
                "name": "exec",
                "arguments": {"intent": "validate", "command": validator},
            },
            "tool_info": {"name": "exec", "type": "truefoundry-system"},
        }

        parsed = effective_call(call, {"thread_id": "main", "created_at": "2026-08-25T00:01:00Z"})

        self.assertEqual(parsed["tool"], "exec")
        self.assertEqual(parsed["server"], "sandbox")
        self.assertTrue(parsed["sandbox_command_evidence"]["uses_mcp_client"])
        self.assertTrue(parsed["sandbox_command_evidence"]["mentions_inspect_incident"])
        self.assertTrue(parsed["sandbox_command_evidence"]["mentions_prepare_rollback"])
        self.assertTrue(parsed["sandbox_command_evidence"]["read_only_bridge"])
        self.assertNotIn("command", parsed["sandbox_command_evidence"])

    def test_verifier_receipt_excludes_discovery_transport_calls(self) -> None:
        calls = [
            {"tool": "list_tools", "server": "deferred_tools"},
            {"tool": "get_tool_info", "server": "deferred_tools"},
            {"tool": "inspect_incident", "server": "governed-operations", "mission_id": "mission-1"},
            {"tool": "prepare_rollback", "server": "governed-operations", "mission_id": "mission-1"},
        ]

        selected = governed_verifier_calls(calls, "mission-1")

        self.assertEqual([item["tool"] for item in selected], ["inspect_incident", "prepare_rollback"])

    def test_effective_call_rejects_literal_or_dynamically_named_sandbox_write(self) -> None:
        commands = [
            "call_tool('inspect_incident', {})\ncall_tool('prepare_rollback', {})\ncall_tool('execute_rollback', {})",
            "call_tool('inspect_incident', {})\ncall_tool('prepare_rollback', {})\ncall_tool('execute_' + 'rollback', {})",
        ]
        for index, command in enumerate(commands):
            call = {
                "id": f"write-{index}",
                "function": {"name": "exec", "arguments": {"intent": "validate", "command": command}},
                "tool_info": {"name": "exec", "type": "truefoundry-system"},
            }
            parsed = effective_call(call, {"thread_id": "main", "created_at": "2026-08-25T00:01:00Z"})
            self.assertFalse(parsed["sandbox_command_evidence"]["read_only_bridge"])

    def test_every_observed_sandbox_call_must_be_read_only(self) -> None:
        safe = sandbox_command_evidence(
            "cat > /tmp/validator.py << 'EOF'\n"
            "from mcp_client import call_tool\n"
            "async def main():\n"
            "    await call_tool('governed-operations', 'inspect_incident', body={})\n"
            "    await call_tool('governed-operations', 'prepare_rollback', body={})\n"
            "EOF\n"
            "python3 /tmp/validator.py"
        )
        unsafe = sandbox_command_evidence(
            "from mcp_client import call_tool\n"
            "call_tool('inspect_incident', {})\n"
            "call_tool('prepare_rollback', {})\n"
            "call_tool('execute_rollback', {})"
        )
        diagnostic = sandbox_command_evidence("python3 --version")
        dynamic_write = sandbox_command_evidence(
            "cat > /tmp/validator.py << 'EOF'\n"
            "from mcp_client import call_tool\n"
            "run = call_tool\n"
            "async def main():\n"
            "    await run('governed-operations', ''.join(['execute', '_rollback']), body={})\n"
            "EOF\n"
            "python3 /tmp/validator.py"
        )
        safe_cli = sandbox_command_evidence(
            "mcp-client call-tool governed-operations inspect_incident '{}'"
        )
        observed = [diagnostic, safe, safe_cli, unsafe, dynamic_write]

        self.assertTrue(any(item["read_only_bridge"] for item in observed))
        self.assertTrue(diagnostic["no_write_attempt"])
        self.assertTrue(safe["no_write_attempt"])
        self.assertTrue(safe_cli["no_write_attempt"])
        self.assertFalse(unsafe["no_write_attempt"])
        self.assertFalse(dynamic_write["no_write_attempt"])
        self.assertIsNone(strict_python_bridge_tools("echo no"))

    def test_mcp_manifest_binds_bearer_to_authority_identity(self) -> None:
        with patch("configure_governed_pivot.authority_agent_identity", return_value="operator-1"):
            manifest = mcp_manifest("http://mcp.test/mcp", "x" * 32)
        self.assertEqual(manifest["auth"]["headers"]["Authorization"], f"Bearer {'x' * 32}")
        self.assertEqual(manifest["auth"]["headers"]["X-Agent-Identity"], "operator-1")

    def test_mcp_manifest_rejects_missing_or_short_secret(self) -> None:
        for token in (None, "short"):
            with self.assertRaisesRegex(RuntimeError, "ABSENT_OR_TOO_SHORT"):
                mcp_manifest("http://mcp.test/mcp", token)

    def test_mission_is_derived_from_calls_and_responses(self) -> None:
        calls = [{"server": "governed-operations", "tool_call_id": "c1", "mission_id": "mission-1"}]
        responses = {"c1": {"payload": {"mission_id": "mission-1"}}}
        self.assertEqual(observed_mission_id(calls, responses), "mission-1")
        with self.assertRaisesRegex(RuntimeError, "exactly one"):
            observed_mission_id([], {})
        with self.assertRaisesRegex(RuntimeError, "exactly one"):
            observed_mission_id(calls, {"c1": {"payload": {"mission_id": "mission-2"}}})

    def test_write_evidence_requires_matching_approval_and_allow_ids(self) -> None:
        writes = [{"tool_call_id": "write-1"}]
        approvals = [{"tool_call_id": "write-1"}]
        mismatched = [{"tool_call_id": "write-2", "decision": "allow"}]
        matched = [{"tool_call_id": "write-1", "decision": "allow"}]
        self.assertEqual(correlated_executed_writes(writes, approvals, mismatched), [])
        self.assertEqual(correlated_executed_writes(writes, approvals, matched), writes)

    def test_compact_approval_reference_resolves_to_source_call(self) -> None:
        observed = [{
            "thread_id": "main",
            "tool_call_id": "write-1",
            "tool": "execute_rollback",
            "tool_type": "mcp",
            "server": "governed-operations",
            "transport_tool": "execute_rollback",
            "mission_id": "mission-1",
            "attempted_at": "2026-08-29T03:24:09Z",
        }]
        event = {
            "thread_id": "main",
            "created_at": "2026-08-29T03:24:09.1Z",
        }

        resolved = resolve_approval_call(
            {"id": "write-1", "source_event_id": "event-1"},
            event,
            observed,
        )

        self.assertEqual(resolved["tool"], "execute_rollback")
        self.assertEqual(resolved["server"], "governed-operations")
        self.assertEqual(resolved["mission_id"], "mission-1")

    def test_unresolved_compact_approval_reference_fails_closed(self) -> None:
        resolved = resolve_approval_call(
            {"id": "missing", "source_event_id": "event-1"},
            {"thread_id": "main", "created_at": "2026-08-29T03:24:09Z"},
            [],
        )

        self.assertIsNone(resolved["tool"])
        self.assertIsNone(resolved["server"])

    def test_verifier_model_is_derived_from_persisted_agent(self) -> None:
        self.assertEqual(
            persisted_model_name({"manifest": {"model": {"name": "anthropic/test-model"}}}),
            "anthropic/test-model",
        )
        with self.assertRaisesRegex(RuntimeError, "could not be resolved"):
            persisted_model_name({"manifest": {"model": {"name": "unknown"}}})

    def test_response_payload_unwraps_mcp_error_envelope(self) -> None:
        event = {
            "content": '{"error":[{"type":"text","text":"{\\"error\\":\\"AUTHORITY_DENIED: scope\\"}"}]}'
        }

        self.assertEqual(response_payload(event), {"error": "AUTHORITY_DENIED: scope"})

    def test_recovered_postcondition_requires_target_version_and_healthy_threshold(self) -> None:
        recovered = {
            "incident": {"id": "INC-2026-042", "status": "resolved"},
            "service": {
                "id": "checkout-api",
                "deployed_version": "v41",
                "status": "healthy",
                "error_rate_percent": 0.7,
                "healthy_threshold_percent": 2.0,
            },
        }
        degraded = {
            **recovered,
            "service": {**recovered["service"], "error_rate_percent": 18.4},
        }

        self.assertTrue(is_recovered_postcondition(recovered))
        self.assertFalse(is_recovered_postcondition(degraded))

    def test_degraded_precondition_requires_open_incident_and_threshold_breach(self) -> None:
        degraded = {
            "incident": {"id": "INC-2026-042", "status": "open"},
            "service": {
                "id": "checkout-api",
                "deployed_version": "v42",
                "status": "degraded",
                "error_rate_percent": 18.4,
                "healthy_threshold_percent": 2.0,
            },
        }
        self.assertTrue(is_degraded_precondition(degraded))
        self.assertFalse(is_degraded_precondition({**degraded, "incident": {**degraded["incident"], "status": "resolved"}}))

    def test_daytona_readiness_uses_trueforge_provider_shape(self) -> None:
        ready = {"manifest": {"type": "daytona", "auth": {"api_key": "[REDACTED]"}}, "status": "ready"}

        self.assertTrue(is_daytona_provider_ready(ready))
        self.assertFalse(is_daytona_provider_ready({**ready, "status": "pending"}))
        self.assertFalse(is_daytona_provider_ready({"type": "daytona", "status": "ready"}))

    def test_daytona_sandbox_id_and_subagent_summary_are_privacy_scoped(self) -> None:
        event = {
            "id": "event-1",
            "thread_id": "child-1",
            "agent_info": {"name": "Verifier", "type": "dynamic", "input": "private task text"},
            "parent": {"thread_id": "main", "tool_call_id": "call-1"},
            "created_at": "2026-08-25T00:00:00Z",
            "unexpected_private_field": "do not export",
        }

        self.assertTrue(is_daytona_sandbox_id("v1:daytona:tenant.sandbox"))
        self.assertFalse(is_daytona_sandbox_id("v1:local:tenant.sandbox"))
        summary = summarize_thread_event(event)
        self.assertEqual(summary["name"], "Verifier")
        self.assertNotIn("input", summary)
        self.assertNotIn("unexpected_private_field", summary)

        correlated = correlate_sandbox_exec_calls(
            [{"tool_call_id": "call-1"}],
            ["v1:daytona:tenant.sandbox"],
        )
        self.assertEqual(len(correlated[0]["sandbox_id_sha256"]), 64)
        self.assertNotIn("v1:daytona:tenant.sandbox", json.dumps(correlated))
        self.assertIsNone(correlate_sandbox_exec_calls([{}], ["first", "second"])[0]["sandbox_id_sha256"])


if __name__ == "__main__":
    unittest.main()
