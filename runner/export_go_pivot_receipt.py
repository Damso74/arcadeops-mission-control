"""Build a truthful GO_PIVOT receipt from persisted TrueForge public APIs."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode
from urllib.request import urlopen


def get_json(base_url: str, path: str, query: dict[str, Any] | None = None) -> dict[str, Any]:
    suffix = f"?{urlencode(query)}" if query else ""
    with urlopen(f"{base_url.rstrip('/')}{path}{suffix}", timeout=20) as response:
        return json.load(response)


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
        parts = payload["error"]
        text = next((part.get("text") for part in parts if isinstance(part, dict) and part.get("type") == "text"), None)
        nested = parse_json(text)
        if isinstance(nested, dict):
            return nested
    return payload


def clean_arguments(raw: Any) -> dict[str, Any]:
    arguments = parse_json(raw)
    if not isinstance(arguments, dict):
        return {}
    # A change token is not a credential, but the receipt only needs the governed intent.
    return {key: value for key, value in arguments.items() if key != "change_token"}


def observed_mission_id(
    tool_calls: dict[str, dict[str, Any]],
    responses: dict[str, dict[str, Any]],
) -> str:
    mission_ids = {
        mission_id
        for call in tool_calls.values()
        if call.get("tool_type") == "mcp"
        for mission_id in [(call.get("arguments") or {}).get("mission_id")]
        if isinstance(mission_id, str) and mission_id
    }
    mission_ids.update(
        payload["mission_id"]
        for call_id, call in tool_calls.items()
        if call.get("tool_type") == "mcp"
        for payload in [responses.get(call_id, {}).get("payload")]
        if isinstance(payload, dict) and isinstance(payload.get("mission_id"), str) and payload["mission_id"]
    )
    if len(mission_ids) != 1:
        raise RuntimeError(f"Expected exactly one observed mission_id, got {sorted(mission_ids)}")
    return next(iter(mission_ids))


def correlated_executed_action_ids(
    actions_executed: list[dict[str, Any]],
    approvals: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
) -> set[str]:
    approval_ids = {item.get("tool_call_id") for item in approvals if item.get("tool_call_id")}
    allowed_ids = {
        item.get("tool_call_id")
        for item in decisions
        if item.get("tool_call_id") and item.get("decision") == "allow"
    }
    return {
        item["tool_call_id"]
        for item in actions_executed
        if item.get("tool_call_id") in approval_ids and item.get("tool_call_id") in allowed_ids
    }


def list_turn_events(base_url: str, session_id: str, turn_id: str) -> list[dict[str, Any]]:
    path = f"/sessions/{quote(session_id, safe='')}/turns/{quote(turn_id, safe='')}/events"
    result: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
        query: dict[str, Any] = {"limit": 100}
        if page_token:
            query["page_token"] = page_token
        page = get_json(base_url, path, query)
        result.extend(page.get("data", []))
        page_token = page.get("pagination", {}).get("next_page_token")
        if not page_token:
            return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8791/api/v1")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--model-smoke-session-id")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    session = get_json(args.base_url, f"/sessions/{quote(args.session_id, safe='')}")["data"]
    turns = get_json(args.base_url, f"/sessions/{quote(args.session_id, safe='')}/turns").get("data", [])
    events: list[dict[str, Any]] = []
    for turn in turns:
        for event in list_turn_events(args.base_url, args.session_id, turn["id"]):
            events.append({"turn_id": turn["id"], **event})

    tool_calls: dict[str, dict[str, Any]] = {}
    responses: dict[str, dict[str, Any]] = {}
    approvals: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []

    for event in events:
        if event.get("type") == "model.message":
            for call in event.get("tool_calls") or []:
                info = call.get("tool_info") or {}
                function = call.get("function") or {}
                tool_calls[call["id"]] = {
                    "turn_id": event["turn_id"],
                    "tool_call_id": call["id"],
                    "tool": function.get("name"),
                    "tool_type": info.get("type"),
                    "server": info.get("server_name"),
                    "arguments": clean_arguments(function.get("arguments")),
                    "attempted_at": event.get("created_at"),
                }
        elif event.get("type") == "tool.response":
            responses[event["tool_call_id"]] = {
                "turn_id": event["turn_id"],
                "responded_at": event.get("created_at"),
                "payload": response_payload(event),
            }
        elif event.get("type") == "tool.approval_required":
            for call in event.get("tool_calls") or []:
                approvals.append({
                    "turn_id": event["turn_id"],
                    "approval_event_id": event.get("id"),
                    "tool_call_id": call.get("id"),
                    "requested_at": event.get("created_at"),
                    "status": "required",
                })
        elif event.get("type") == "turn.created":
            for item in event.get("input") or []:
                if item.get("type") == "user.tool_approval":
                    approval = item.get("approval") or {}
                    decisions.append({
                        "turn_id": event["turn_id"],
                        "tool_call_id": item.get("tool_call_id"),
                        "actor": "human_via_trueforge_ui",
                        "decision": approval.get("status"),
                        "reason": approval.get("reason"),
                        "decided_at": event.get("created_at"),
                    })

    decision_by_call = {item["tool_call_id"]: item for item in decisions}
    actions_attempted: list[dict[str, Any]] = []
    actions_executed: list[dict[str, Any]] = []
    actions_blocked: list[dict[str, Any]] = []
    tools_used: set[str] = set()

    for call_id, call in tool_calls.items():
        if call["tool_type"] != "mcp":
            continue
        tools_used.add(call["tool"])
        response = responses.get(call_id)
        payload = response.get("payload") if response else None
        decision = decision_by_call.get(call_id)
        status = "completed"
        if decision and decision.get("decision") == "deny":
            status = "blocked_by_human"
            actions_blocked.append({
                "tool_call_id": call_id,
                "tool": call["tool"],
                "reason": decision.get("reason") or "Human denied the native TrueForge approval request",
                "authority": "human_approval_gate",
                "state_changed": False,
                "blocked_at": decision.get("decided_at"),
            })
        elif isinstance(payload, dict) and str(payload.get("error", "")).startswith("AUTHORITY_DENIED"):
            status = "blocked_by_authority"
            actions_blocked.append({
                "tool_call_id": call_id,
                "tool": call["tool"],
                "reason": payload["error"],
                "authority": "AuthorityContract",
                "state_changed": False,
                "blocked_at": response.get("responded_at") if response else None,
            })
        elif isinstance(payload, dict) and payload.get("applied") is True:
            status = "executed"
            actions_executed.append({
                "tool_call_id": call_id,
                "tool": call["tool"],
                "action_id": payload.get("action_id"),
                "record_id": payload.get("record_id"),
                "before": payload.get("before"),
                "after": payload.get("after"),
                "executed_at": response.get("responded_at") if response else None,
            })
        actions_attempted.append({**call, "status": status})

    timestamps = [event.get("created_at") for event in events if event.get("created_at")]
    agent_reference = session.get("agent") or {}
    agent = get_json(args.base_url, f"/agents/{quote(str(agent_reference.get('id', '')), safe='')}").get("data", {})
    model_reference = ((agent.get("manifest") or {}).get("model") or {}).get("name", "unknown/unknown")
    provider, _, model_name = model_reference.partition("/")
    all_turns_done = bool(turns) and all((turn.get("state") or {}).get("status") == "done" for turn in turns)
    mission_id = observed_mission_id(tool_calls, responses)
    correlated_action_ids = correlated_executed_action_ids(actions_executed, approvals, decisions)

    receipt = {
        "schema_version": "1.0.0",
        "receipt_kind": "trueforge-go-pivot-acceptance",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "TrueForge 0.1.4 persisted public APIs",
        "mission_id": mission_id,
        "session_id": args.session_id,
        "agent_identity": {"id": agent.get("id"), "name": agent.get("name")},
        "model_provider": provider,
        "model_name": model_name,
        "model_smoke_session_id": args.model_smoke_session_id,
        "tools_used": sorted(tools_used),
        "sandbox_provider": None,
        "sandbox_id": None,
        "subagent_events": [],
        "approval_requests": approvals,
        "human_decisions": decisions,
        "actions_attempted": actions_attempted,
        "actions_executed": actions_executed,
        "actions_blocked": actions_blocked,
        "artifacts_created": [str(args.output.as_posix())],
        "verification_results": {
            "all_turns_terminal": all_turns_done,
            "native_approval_pause_observed": len(approvals) >= 2,
            "human_deny_observed": any(item.get("decision") == "deny" for item in decisions),
            "human_allow_observed": any(item.get("decision") == "allow" for item in decisions),
            "authorized_write_executed_once": len(actions_executed) == 1 and len(correlated_action_ids) == 1,
            "authority_denial_observed": any(item.get("authority") == "AuthorityContract" for item in actions_blocked),
            "model_identity_resolved": provider != "unknown" and model_name != "unknown",
        },
        "started_at": min(timestamps) if timestamps else session.get("created_at"),
        "completed_at": max(timestamps) if timestamps else session.get("updated_at"),
        "final_status": "GO_PIVOT_ACCEPTANCE_PASS",
        "limitations": [
            "Daytona was unavailable, so no sandbox execution was claimed.",
            "Dynamic subagents were disabled; no subagent event was claimed.",
            "The human actor is represented by the authenticated local TrueForge user; TrueForge 0.1.4 does not expose a richer approver identity in these events.",
            "MCP data is fictional and local-only.",
        ],
    }
    required_checks = receipt["verification_results"]
    if not all(required_checks.values()):
        failed = [name for name, passed in required_checks.items() if not passed]
        raise RuntimeError(f"Acceptance evidence incomplete: {', '.join(failed)}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": receipt["final_status"], "output": str(args.output), "checks": required_checks}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
