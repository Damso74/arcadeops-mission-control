"""Export strict Safe Rollback evidence from one persisted TrueForge session."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

from configure_governed_pivot import MCP_NAME, request_json
from configure_submission_agent import AGENT_NAME


MISSION_ID = "TF-SAFE-ROLLBACK-001"
INCIDENT_ID = "INC-2026-042"
SERVICE_ID = "checkout-api"
TARGET_VERSION = "v41"
READ_ONLY_SANDBOX_TOOLS = {"inspect_incident", "prepare_rollback"}


def get_json(base_url: str, path: str, query: dict[str, Any] | None = None) -> dict[str, Any]:
    suffix = f"?{urlencode(query)}" if query else ""
    return request_json(base_url, f"{path}{suffix}")


def parse_json(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def response_payload(event: dict[str, Any]) -> Any:
    payload = parse_json(event.get("content"))
    if isinstance(payload, dict) and isinstance(payload.get("error"), list):
        text = next(
            (item.get("text") for item in payload["error"] if isinstance(item, dict) and item.get("type") == "text"),
            None,
        )
        return parse_json(text)
    return payload


def observed_mission_id(calls: list[dict[str, Any]], responses: dict[str, dict[str, Any]]) -> str:
    mission_ids = {
        mission_id
        for call in calls
        if call.get("server") == MCP_NAME
        for mission_id in [call.get("mission_id")]
        if isinstance(mission_id, str) and mission_id
    }
    mission_ids.update(
        payload["mission_id"]
        for call in calls
        if call.get("server") == MCP_NAME
        for payload in [responses.get(call.get("tool_call_id"), {}).get("payload")]
        if isinstance(payload, dict) and isinstance(payload.get("mission_id"), str) and payload["mission_id"]
    )
    if len(mission_ids) != 1:
        raise RuntimeError(f"Expected exactly one observed mission_id, got {sorted(mission_ids)}")
    return next(iter(mission_ids))


def strict_python_bridge_tools(command: str) -> list[str] | None:
    heredoc = re.fullmatch(
        r"cat > (?P<path>/tmp/[A-Za-z0-9_.-]+) << ['\"]?(?P<marker>[A-Z_]+)['\"]?\r?\n"
        r"(?P<source>.*?)\r?\n(?P=marker)\r?\npython3 (?P=path)\s*",
        command,
        flags=re.DOTALL,
    )
    if not heredoc:
        return None
    try:
        tree = ast.parse(heredoc.group("source"))
    except SyntaxError:
        return None
    imports = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.module == "mcp_client"
    ]
    if len(imports) != 1 or [(item.name, item.asname) for item in imports[0].names] != [("call_tool", None)]:
        return None
    direct_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "call_tool"
    ]
    loaded_references = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id == "call_tool"
    ]
    if len(direct_calls) != len(loaded_references):
        return None
    if any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in {"eval", "exec", "getattr", "globals", "locals", "__import__"}
        for node in ast.walk(tree)
    ):
        return None
    tools: list[str] = []
    for call in direct_calls:
        if (
            len(call.args) < 2
            or not isinstance(call.args[0], ast.Constant)
            or call.args[0].value != MCP_NAME
            or not isinstance(call.args[1], ast.Constant)
            or not isinstance(call.args[1].value, str)
        ):
            return None
        tools.append(call.args[1].value)
    return tools


def sandbox_command_evidence(command: str) -> dict[str, Any]:
    python_tools = strict_python_bridge_tools(command)
    cli_matches = list(
        re.finditer(
            r"(?:^|\s)(?:python3\s+)?(?:\S*/)?mcp-client\s+call-tool\s+([A-Za-z0-9_-]+)\s+([a-z_]+)",
            command,
        )
    )
    cli_tools = [match.group(2) for match in cli_matches if match.group(1) == MCP_NAME]
    call_tool_tokens = len(re.findall(r"\bcall[-_]tool\b", command))
    compacted_command = re.sub(r"[\s'\"+,.()\[\]{}]", "", command).lower()
    mentions_write_fragments = "execute" in compacted_command and "rollback" in compacted_command
    exact_diagnostic = command.strip() == (
        "which mcp-client; file $(which mcp-client); "
        "head -c 300 $(which mcp-client) | cat -A | head -5"
    )
    read_only_bridge = python_tools is not None and len(python_tools) == 2 and set(python_tools) == READ_ONLY_SANDBOX_TOOLS
    read_only_cli = (
        bool(cli_matches)
        and len(cli_matches) == call_tool_tokens
        and len(cli_tools) == len(cli_matches)
        and set(cli_tools).issubset(READ_ONLY_SANDBOX_TOOLS)
        and not mentions_write_fragments
    )
    has_mcp_mechanism = any(token in command for token in ("mcp_client", "mcp-client", "call_tool", "call-tool"))
    no_write_attempt = read_only_bridge or read_only_cli or exact_diagnostic or (
        not has_mcp_mechanism and not mentions_write_fragments
    )
    observed_tools = set(python_tools or []) | set(cli_tools)
    return {
        "command_sha256": hashlib.sha256(command.encode("utf-8")).hexdigest(),
        "uses_mcp_client": "mcp_client" in command or "mcp-client" in command,
        "mentions_inspect_incident": "inspect_incident" in observed_tools,
        "mentions_prepare_rollback": "prepare_rollback" in observed_tools,
        "mentions_execute_rollback": "execute_rollback" in observed_tools or mentions_write_fragments,
        "direct_call_count": len(python_tools or cli_tools),
        "literal_tools": sorted(observed_tools),
        "no_write_attempt": no_write_attempt,
        "read_only_bridge": read_only_bridge,
    }


def summarize_verifier_call(call: dict[str, Any], response: dict[str, Any] | None) -> dict[str, Any]:
    response = response or {}
    payload = response.get("payload")
    payload_ok = isinstance(payload, dict) and not payload.get("error")
    return {
        **call,
        "responded_at": response.get("responded_at"),
        "response_evidence": {
            "observed": payload_ok,
            "mission_id": payload.get("mission_id") if payload_ok else None,
        },
    }


def correlated_executed_writes(
    executed_writes: list[dict[str, Any]],
    approvals: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    approval_ids = {item.get("tool_call_id") for item in approvals if item.get("tool_call_id")}
    allowed_ids = {
        item.get("tool_call_id")
        for item in decisions
        if item.get("tool_call_id") and item.get("decision") == "allow"
    }
    return [
        call for call in executed_writes
        if call.get("tool_call_id") in approval_ids and call.get("tool_call_id") in allowed_ids
    ]


def correlate_sandbox_exec_calls(
    calls: list[dict[str, Any]],
    sandbox_ids: list[str],
) -> list[dict[str, Any]]:
    """Bind every sandbox execution to the one sandbox created for this session.

    The raw tenant-scoped id stays private. A receipt is only exportable when the
    session contains exactly one Daytona sandbox, so the shared SHA-256 digest is
    an unambiguous non-secret correlation value.
    """
    digest = hashlib.sha256(sandbox_ids[0].encode("utf-8")).hexdigest() if len(sandbox_ids) == 1 else None
    return [{**call, "sandbox_id_sha256": digest} for call in calls]


def list_events(base_url: str, session_id: str, turn_id: str) -> list[dict[str, Any]]:
    path = f"/sessions/{quote(session_id, safe='')}/turns/{quote(turn_id, safe='')}/events"
    events: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
        query: dict[str, Any] = {"limit": 100}
        if page_token:
            query["page_token"] = page_token
        page = get_json(base_url, path, query)
        events.extend(page.get("data", []))
        page_token = page.get("pagination", {}).get("next_page_token")
        if not page_token:
            return events


def effective_call(call: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
    function = call.get("function") or {}
    info = call.get("tool_info") or {}
    tool = function.get("name")
    server = info.get("server_name") or info.get("mcp_server_name")
    tool_type = info.get("type")
    arguments = parse_json(function.get("arguments"))
    if not isinstance(arguments, dict):
        arguments = {}
    if tool == "call_tool" and arguments.get("mcp_server") and arguments.get("tool_name"):
        server = arguments["mcp_server"]
        tool = arguments["tool_name"]
        tool_type = "mcp"
        nested_arguments = parse_json(
            arguments.get("input") or arguments.get("arguments") or arguments.get("tool_arguments")
        )
        if isinstance(nested_arguments, dict):
            arguments = nested_arguments
    if tool == "exec" and tool_type == "truefoundry-system" and not server:
        server = "sandbox"
    result = {
        "thread_id": event.get("thread_id"),
        "tool_call_id": call.get("id"),
        "tool": tool,
        "tool_type": tool_type,
        "server": server,
        "transport_tool": function.get("name"),
        "attempted_at": event.get("created_at"),
    }
    if isinstance(arguments.get("mission_id"), str) and arguments["mission_id"]:
        result["mission_id"] = arguments["mission_id"]
    if tool == "exec" and server == "sandbox":
        command = str(arguments.get("command") or "")
        result["sandbox_command_evidence"] = {
            "intent": arguments.get("intent"),
            **sandbox_command_evidence(command),
        }
    return result


def is_recovered_postcondition(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    incident = payload.get("incident") or {}
    service = payload.get("service") or {}
    error_rate = service.get("error_rate_percent")
    threshold = service.get("healthy_threshold_percent")
    return (
        incident.get("id") == INCIDENT_ID
        and incident.get("status") == "resolved"
        and service.get("id") == SERVICE_ID
        and service.get("deployed_version") == TARGET_VERSION
        and service.get("status") == "healthy"
        and isinstance(error_rate, (int, float))
        and isinstance(threshold, (int, float))
        and error_rate <= threshold
    )


def is_degraded_precondition(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    incident = payload.get("incident") or {}
    service = payload.get("service") or {}
    error_rate = service.get("error_rate_percent")
    threshold = service.get("healthy_threshold_percent")
    return (
        incident.get("id") == INCIDENT_ID
        and incident.get("status") == "open"
        and service.get("id") == SERVICE_ID
        and service.get("deployed_version") == "v42"
        and service.get("status") == "degraded"
        and isinstance(error_rate, (int, float))
        and isinstance(threshold, (int, float))
        and error_rate > threshold
    )


def is_daytona_provider_ready(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    manifest = payload.get("manifest") or {}
    return isinstance(manifest, dict) and manifest.get("type") == "daytona" and payload.get("status") == "ready"


def is_daytona_sandbox_id(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("v1:daytona:") and len(value) > len("v1:daytona:")


def summarize_thread_event(event: dict[str, Any]) -> dict[str, Any]:
    agent_info = event.get("agent_info") or {}
    return {
        "event_id": event.get("id"),
        "thread_id": event.get("thread_id"),
        "name": agent_info.get("name"),
        "type": agent_info.get("type"),
        "parent": event.get("parent"),
        "created_at": event.get("created_at"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8791/api/v1")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    session = get_json(args.base_url, f"/sessions/{quote(args.session_id, safe='')}")["data"]
    turns = get_json(args.base_url, f"/sessions/{quote(args.session_id, safe='')}/turns").get("data", [])
    events: list[dict[str, Any]] = []
    for turn in turns:
        events.extend({"turn_id": turn["id"], **event} for event in list_events(args.base_url, args.session_id, turn["id"]))

    calls: list[dict[str, Any]] = []
    responses: dict[str, dict[str, Any]] = {}
    approvals: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    sandbox_events = [event for event in events if event.get("type") == "sandbox.created"]
    sandbox_ids = [event.get("sandbox_id") for event in sandbox_events if event.get("sandbox_id")]
    verifier_events = [
        event
        for event in events
        if event.get("type") == "thread.created" and (event.get("agent_info") or {}).get("name") == "Verifier"
    ]
    verifier_thread_ids = {event.get("thread_id") for event in verifier_events}

    for event in events:
        if event.get("type") == "model.message":
            calls.extend(effective_call(call, event) for call in event.get("tool_calls") or [])
        elif event.get("type") == "tool.response":
            responses[event.get("tool_call_id")] = {
                "payload": response_payload(event),
                "responded_at": event.get("created_at"),
            }
        elif event.get("type") == "tool.approval_required":
            for call in event.get("tool_calls") or []:
                approval_call = effective_call(call, event)
                approvals.append(
                    {
                        "approval_event_id": event.get("id"),
                        "event_type": event.get("type"),
                        "thread_id": approval_call.get("thread_id"),
                        "tool_call_id": approval_call.get("tool_call_id"),
                        "tool": approval_call.get("tool"),
                        "tool_type": approval_call.get("tool_type"),
                        "server": approval_call.get("server"),
                        "transport_tool": approval_call.get("transport_tool"),
                        "mission_id": approval_call.get("mission_id"),
                        "requested_at": event.get("created_at"),
                    }
                )
        elif event.get("type") == "turn.created":
            for item in event.get("input") or []:
                if item.get("type") == "user.tool_approval":
                    approval = item.get("approval") or {}
                    decisions.append(
                        {
                            "event_type": event.get("type"),
                            "input_type": item.get("type"),
                            "tool_call_id": item.get("tool_call_id"),
                            "actor": "human_via_trueforge_ui",
                            "decision": approval.get("status"),
                            "reason_provided": bool(approval.get("reason")),
                            "decided_at": event.get("created_at"),
                        }
                    )

    sandbox_calls = [call for call in calls if call.get("tool") == "exec" and call.get("server") == "sandbox"]
    sandbox_mcp_bridge_calls = [
        call
        for call in sandbox_calls
        if (call.get("sandbox_command_evidence") or {}).get("uses_mcp_client")
        and (call.get("sandbox_command_evidence") or {}).get("mentions_inspect_incident")
        and (call.get("sandbox_command_evidence") or {}).get("mentions_prepare_rollback")
    ]
    sandbox_readonly_bridge_calls = [
        call
        for call in sandbox_mcp_bridge_calls
        if (call.get("sandbox_command_evidence") or {}).get("read_only_bridge")
    ]
    sandbox_pass_calls = [
        call
        for call in sandbox_readonly_bridge_calls
        if "SANDBOX_VALIDATION_PASS"
        in json.dumps(responses.get(call["tool_call_id"], {}).get("payload"), ensure_ascii=False)
    ]
    sandbox_pass_ids = {call.get("tool_call_id") for call in sandbox_pass_calls}
    sandbox_evidence_calls = correlate_sandbox_exec_calls([
        {
            **call,
            "responded_at": responses.get(call.get("tool_call_id"), {}).get("responded_at"),
            "validation_pass_observed": call.get("tool_call_id") in sandbox_pass_ids,
        }
        for call in sandbox_calls
    ], sandbox_ids)
    verifier_calls = [call for call in calls if call.get("thread_id") in verifier_thread_ids]
    mission_id = observed_mission_id(calls, responses)
    verifier_tools = {
        call.get("tool")
        for call in verifier_calls
        if call.get("server") == MCP_NAME
        and call.get("mission_id") == mission_id
        and isinstance(responses.get(call.get("tool_call_id"), {}).get("payload"), dict)
        and not responses[call["tool_call_id"]]["payload"].get("error")
        and responses[call["tool_call_id"]]["payload"].get("mission_id") == mission_id
    }
    verifier_tool_evidence = [
        summarize_verifier_call(call, responses.get(call.get("tool_call_id")))
        for call in verifier_calls
    ]
    write_calls = [call for call in calls if call.get("tool") == "execute_rollback" and call.get("server") == MCP_NAME]
    executed_writes = [
        {
            **call,
            "response": responses.get(call["tool_call_id"], {}).get("payload"),
            "responded_at": responses.get(call["tool_call_id"], {}).get("responded_at"),
        }
        for call in write_calls
        if isinstance(responses.get(call["tool_call_id"], {}).get("payload"), dict)
        and responses[call["tool_call_id"]]["payload"].get("applied") is True
        and responses[call["tool_call_id"]]["payload"].get("recovered") is True
    ]
    authorized_executed_writes = correlated_executed_writes(executed_writes, approvals, decisions)
    write_call_ids = {call.get("tool_call_id") for call in write_calls}
    approved_write_ids = {item.get("tool_call_id") for item in approvals} & write_call_ids
    allowed_write_decisions = [
        item for item in decisions if item.get("tool_call_id") in write_call_ids and item.get("decision") == "allow"
    ]
    native_approval_events = [
        item
        for item in approvals
        if item.get("tool_call_id") in write_call_ids
        and item.get("approval_event_id")
        and item.get("event_type") == "tool.approval_required"
        and item.get("thread_id") == "main"
        and item.get("tool") == "execute_rollback"
        and item.get("tool_type") == "mcp"
        and item.get("server") == MCP_NAME
        and item.get("transport_tool") == "execute_rollback"
        and item.get("mission_id") == mission_id
    ]
    human_allow_inputs = [
        item
        for item in allowed_write_decisions
        if item.get("event_type") == "turn.created"
        and item.get("input_type") == "user.tool_approval"
        and item.get("actor") == "human_via_trueforge_ui"
    ]

    pass_times = [
        responses.get(call["tool_call_id"], {}).get("responded_at")
        for call in sandbox_pass_calls
        if responses.get(call["tool_call_id"], {}).get("responded_at")
    ]
    write_attempt_times = [call.get("attempted_at") for call in write_calls if call.get("attempted_at")]
    executed_response_times = [
        responses.get(call["tool_call_id"], {}).get("responded_at")
        for call in executed_writes
        if responses.get(call["tool_call_id"], {}).get("responded_at")
    ]
    decision_times = [item.get("decided_at") for item in allowed_write_decisions if item.get("decided_at")]

    inspection_calls = [call for call in calls if call.get("tool") == "inspect_incident" and call.get("server") == MCP_NAME]
    degraded_inspections = [
        {
            **call,
            "response": responses.get(call["tool_call_id"], {}).get("payload"),
            "responded_at": responses.get(call["tool_call_id"], {}).get("responded_at"),
        }
        for call in inspection_calls
        if is_degraded_precondition(responses.get(call["tool_call_id"], {}).get("payload"))
    ]
    recovered_inspections = [
        {
            **call,
            "response": responses.get(call["tool_call_id"], {}).get("payload"),
            "responded_at": responses.get(call["tool_call_id"], {}).get("responded_at"),
        }
        for call in inspection_calls
        if is_recovered_postcondition(responses.get(call["tool_call_id"], {}).get("payload"))
    ]
    postcondition_times = [item.get("responded_at") for item in recovered_inspections if item.get("responded_at")]
    precondition_times = [item.get("responded_at") for item in degraded_inspections if item.get("responded_at")]

    agent_ref = session.get("agent") or {}
    agent = get_json(args.base_url, f"/agents/{quote(str(agent_ref.get('id', '')), safe='')}").get("data", {})
    model = ((agent.get("manifest") or {}).get("model") or {}).get("name", "unknown/unknown")
    provider, _, model_name = model.partition("/")
    sandbox_provider = get_json(args.base_url, "/settings/sandbox-providers").get("data", {})
    daytona_ready = is_daytona_provider_ready(sandbox_provider)

    checks = {
        "submission_agent_resolved": agent.get("name") == AGENT_NAME,
        "all_turns_terminal": bool(turns) and all((turn.get("state") or {}).get("status") == "done" for turn in turns),
        "exactly_one_verifier": len(verifier_events) == 1,
        "verifier_used_real_mcp": {"inspect_incident", "prepare_rollback"}.issubset(verifier_tools),
        "verifier_never_attempted_write": all(call.get("tool") != "execute_rollback" for call in verifier_calls),
        "daytona_provider_ready": daytona_ready,
        "daytona_sandbox_created": len(sandbox_ids) == 1 and all(is_daytona_sandbox_id(item) for item in sandbox_ids),
        "sandbox_exec_observed": bool(sandbox_evidence_calls)
        and len(sandbox_ids) == 1
        and all(call.get("sandbox_id_sha256") for call in sandbox_evidence_calls),
        "sandbox_generated_code_uses_mcp_bridge": bool(sandbox_mcp_bridge_calls),
        "sandbox_validator_read_only": bool(sandbox_pass_calls)
        and all(
            (call.get("sandbox_command_evidence") or {}).get("no_write_attempt") is True
            for call in sandbox_evidence_calls
        ),
        "sandbox_validation_pass_observed": bool(sandbox_pass_calls),
        "sandbox_validation_before_write": bool(pass_times and write_attempt_times)
        and min(pass_times) < min(write_attempt_times),
        "native_approval_pause_for_write": len(approved_write_ids) == 1 and len(native_approval_events) == 1,
        "human_allow_for_write": len(allowed_write_decisions) == 1 and len(human_allow_inputs) == 1,
        "write_response_after_human_allow": bool(decision_times and executed_response_times)
        and min(decision_times) < min(executed_response_times),
        "authorized_rollback_executed_once": len(executed_writes) == 1 and len(authorized_executed_writes) == 1,
        "precondition_inspection_observed": bool(degraded_inspections),
        "precondition_before_write": bool(precondition_times and write_attempt_times)
        and min(precondition_times) < min(write_attempt_times),
        "postcondition_inspection_observed": bool(recovered_inspections),
        "postcondition_after_write": bool(executed_response_times and postcondition_times)
        and min(executed_response_times) < max(postcondition_times),
        "service_recovered_on_target_version": bool(recovered_inspections),
        "model_identity_resolved": provider != "unknown" and bool(model_name),
    }
    if not all(checks.values()):
        failed = [name for name, passed in checks.items() if not passed]
        details = ""
        if "sandbox_validator_read_only" in failed:
            unsafe_calls = [
                {
                    "tool_call_id": call.get("tool_call_id"),
                    "evidence": call.get("sandbox_command_evidence"),
                }
                for call in sandbox_calls
                if (call.get("sandbox_command_evidence") or {}).get("no_write_attempt") is not True
            ]
            details = f"; sandbox calls requiring review: {json.dumps(unsafe_calls, ensure_ascii=False)}"
        raise RuntimeError(f"Submission evidence incomplete: {', '.join(failed)}{details}")

    timestamps = [event.get("created_at") for event in events if event.get("created_at")]
    receipt = {
        "schema_version": "2.1.0",
        "receipt_kind": "trueforge-safe-rollback-acceptance",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "TrueForge 0.1.4 persisted public APIs",
        "mission_id": mission_id,
        "incident_id": INCIDENT_ID,
        "service_id": SERVICE_ID,
        "target_version": TARGET_VERSION,
        "session_id": args.session_id,
        "agent_identity": {"id": agent.get("id"), "name": agent.get("name")},
        "model_provider": provider,
        "model_name": model_name,
        "sandbox_provider": "daytona",
        "sandbox_references": [
            {
                "provider": "daytona",
                "id_sha256": hashlib.sha256(item.encode("utf-8")).hexdigest(),
            }
            for item in sandbox_ids
        ],
        "subagent_events": [summarize_thread_event(event) for event in verifier_events],
        "verifier_tool_calls": verifier_tool_evidence,
        "sandbox_exec_calls": sandbox_evidence_calls,
        "approval_requests": approvals,
        "human_decisions": decisions,
        "write_calls": write_calls,
        "executed_writes": executed_writes,
        "approval_correlated_writes": authorized_executed_writes,
        "precondition_inspections": degraded_inspections,
        "postcondition_inspections": recovered_inspections,
        "verification_results": checks,
        "prior_evidence": [
            "evidence/go-pivot-evidence-receipt.json",
            "evidence/verifier-experiment-receipt.json",
        ],
        "started_at": min(timestamps) if timestamps else session.get("created_at"),
        "completed_at": max(timestamps) if timestamps else session.get("updated_at"),
        "final_status": "SUBMISSION_ACCEPTANCE_PASS",
        "limitations": [
            "The human actor is the authenticated local TrueForge user; no richer approver profile was observed.",
            "The incident, service metrics, and rollback are fictional and local-only.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": receipt["final_status"], "checks": checks, "output": str(args.output)}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
