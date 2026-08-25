"""Export strict integrated evidence from one persisted TrueForge session."""

from __future__ import annotations

import argparse
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


READ_ONLY_SANDBOX_TOOLS = {"inspect_records", "prepare_status_change"}
KNOWN_MCP_TOOLS = READ_ONLY_SANDBOX_TOOLS | {"apply_status_change", "export_evidence"}


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


def sandbox_command_evidence(command: str) -> dict[str, Any]:
    direct_call_count = len(re.findall(r"\bcall_tool\s*\(", command))
    literal_tools = {
        match.group(2)
        for match in re.finditer(r"(['\"])([a-z_]+)\1", command)
        if match.group(2) in KNOWN_MCP_TOOLS
    }
    return {
        "command_sha256": hashlib.sha256(command.encode("utf-8")).hexdigest(),
        "uses_mcp_client": "mcp_client" in command or "mcp-client" in command,
        "mentions_inspect_records": "inspect_records" in literal_tools,
        "mentions_prepare_status_change": "prepare_status_change" in literal_tools,
        "mentions_apply_status_change": "apply_status_change" in literal_tools,
        "direct_call_count": direct_call_count,
        "literal_tools": sorted(literal_tools),
        "read_only_bridge": direct_call_count == 2 and literal_tools == READ_ONLY_SANDBOX_TOOLS,
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
            approvals.extend({
                "approval_event_id": event.get("id"),
                "tool_call_id": call.get("id"),
                "requested_at": event.get("created_at"),
            } for call in event.get("tool_calls") or [])
        elif event.get("type") == "turn.created":
            for item in event.get("input") or []:
                if item.get("type") == "user.tool_approval":
                    approval = item.get("approval") or {}
                    decisions.append({
                        "tool_call_id": item.get("tool_call_id"),
                        "actor": "human_via_trueforge_ui",
                        "decision": approval.get("status"),
                        "reason": approval.get("reason"),
                        "decided_at": event.get("created_at"),
                    })

    sandbox_calls = [call for call in calls if call.get("tool") == "exec" and call.get("server") == "sandbox"]
    sandbox_mcp_bridge_calls = [
        call for call in sandbox_calls
        if (call.get("sandbox_command_evidence") or {}).get("uses_mcp_client")
        and (call.get("sandbox_command_evidence") or {}).get("mentions_inspect_records")
        and (call.get("sandbox_command_evidence") or {}).get("mentions_prepare_status_change")
    ]
    sandbox_readonly_bridge_calls = [
        call for call in sandbox_mcp_bridge_calls
        if (call.get("sandbox_command_evidence") or {}).get("read_only_bridge")
    ]
    sandbox_pass_calls = [
        call for call in sandbox_readonly_bridge_calls
        if "SANDBOX_VALIDATION_PASS" in json.dumps(responses.get(call["tool_call_id"], {}).get("payload"), ensure_ascii=False)
    ]
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
    write_calls = [call for call in calls if call.get("tool") == "apply_status_change" and call.get("server") == MCP_NAME]
    executed_writes = [
        call for call in write_calls
        if isinstance(responses.get(call["tool_call_id"], {}).get("payload"), dict)
        and responses[call["tool_call_id"]]["payload"].get("applied") is True
    ]
    authorized_executed_writes = correlated_executed_writes(executed_writes, approvals, decisions)
    write_times = [call.get("attempted_at") for call in write_calls if call.get("attempted_at")]
    pass_times = [
        responses.get(call["tool_call_id"], {}).get("responded_at")
        for call in sandbox_pass_calls
        if responses.get(call["tool_call_id"], {}).get("responded_at")
    ]

    agent_ref = session.get("agent") or {}
    agent = get_json(args.base_url, f"/agents/{quote(str(agent_ref.get('id', '')), safe='')}").get("data", {})
    model = ((agent.get("manifest") or {}).get("model") or {}).get("name", "unknown/unknown")
    provider, _, model_name = model.partition("/")
    sandbox_ids = [event.get("sandbox_id") for event in sandbox_events if event.get("sandbox_id")]

    checks = {
        "submission_agent_resolved": agent.get("name") == AGENT_NAME,
        "all_turns_terminal": bool(turns) and all((turn.get("state") or {}).get("status") == "done" for turn in turns),
        "exactly_one_verifier": len(verifier_events) == 1,
        "verifier_used_real_mcp": {"inspect_records", "prepare_status_change"}.issubset(verifier_tools),
        "verifier_never_attempted_write": all(call.get("tool") != "apply_status_change" for call in verifier_calls),
        "daytona_sandbox_created": bool(sandbox_ids) and all("daytona" in sandbox_id for sandbox_id in sandbox_ids),
        "sandbox_exec_observed": bool(sandbox_calls),
        "sandbox_generated_code_uses_mcp_bridge": bool(sandbox_mcp_bridge_calls),
        "sandbox_validator_read_only": bool(sandbox_calls) and all(
            (call.get("sandbox_command_evidence") or {}).get("read_only_bridge")
            for call in sandbox_calls
        ),
        "sandbox_validation_pass_observed": bool(sandbox_pass_calls),
        "sandbox_validation_before_write": bool(pass_times and write_times) and min(pass_times) < min(write_times),
        "native_approval_pause_observed": bool(approvals),
        "human_allow_observed": any(item.get("decision") == "allow" for item in decisions),
        "authorized_write_executed_once": len(executed_writes) == 1 and len(authorized_executed_writes) == 1,
        "model_identity_resolved": provider != "unknown" and bool(model_name),
    }
    if not all(checks.values()):
        failed = [name for name, passed in checks.items() if not passed]
        raise RuntimeError(f"Submission evidence incomplete: {', '.join(failed)}")

    timestamps = [event.get("created_at") for event in events if event.get("created_at")]
    receipt = {
        "schema_version": "1.0.0",
        "receipt_kind": "trueforge-submission-acceptance",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "TrueForge 0.1.4 persisted public APIs",
        "mission_id": mission_id,
        "session_id": args.session_id,
        "agent_identity": {"id": agent.get("id"), "name": agent.get("name")},
        "model_provider": provider,
        "model_name": model_name,
        "sandbox_provider": "daytona",
        "sandbox_ids": sandbox_ids,
        "subagent_events": verifier_events,
        "sandbox_exec_calls": sandbox_calls,
        "approval_requests": approvals,
        "human_decisions": decisions,
        "write_calls": write_calls,
        "executed_writes": executed_writes,
        "approval_correlated_writes": authorized_executed_writes,
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
            "All MCP records and writes are fictional and local-only.",
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
