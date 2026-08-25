"""Run and prove one real dynamic Verifier turn through TrueForge public APIs."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

from configure_governed_pivot import request_json
from configure_verifier_experiment import AGENT_NAME


TERMINAL_STATUSES = {"done", "error", "cancelled"}


def get_json(base_url: str, path: str, query: dict[str, Any] | None = None) -> dict[str, Any]:
    suffix = f"?{urlencode(query)}" if query else ""
    return request_json(base_url, f"{path}{suffix}")


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


def persisted_model_name(agent: dict[str, Any]) -> str:
    model = ((agent.get("manifest") or {}).get("model") or {}).get("name")
    if not isinstance(model, str) or "/" not in model or not all(model.split("/", 1)):
        raise RuntimeError("Verifier agent model identity could not be resolved")
    return model


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8791/api/v1")
    parser.add_argument("--timeout-seconds", type=int, default=180)
    parser.add_argument("--session-id")
    parser.add_argument("--turn-id")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if bool(args.session_id) != bool(args.turn_id):
        raise RuntimeError("--session-id and --turn-id must be supplied together")

    if args.session_id and args.turn_id:
        session = get_json(args.base_url, f"/sessions/{quote(args.session_id, safe='')}")["data"]
        turn = get_json(
            args.base_url,
            f"/sessions/{quote(args.session_id, safe='')}/turns/{quote(args.turn_id, safe='')}",
        )["data"]
    else:
        session = request_json(args.base_url, "/sessions", "POST", {"agent": {"name": AGENT_NAME}})["data"]
        prompt = (
            "Mission TF-MISSION-20260824-001. This is a verifier-only acceptance check. Inspect case-101 yourself, then "
            "delegate exactly one dynamic sub-agent named Verifier. Give it a self-contained task to inspect the fictional "
            "records via MCP and independently verify whether changing case-101 from its current status to approved is allowed. "
            "Do not call apply_status_change and do not modify state. Return Verifier's conclusion and exact tool evidence."
        )
        turn = request_json(
            args.base_url,
            f"/sessions/{quote(session['id'], safe='')}/turns",
            "POST",
            {"input": [{"type": "user.message", "content": prompt}], "previous_turn_id": "none", "stream": False},
        )["data"]

        deadline = time.monotonic() + args.timeout_seconds
        while (turn.get("state") or {}).get("status") not in TERMINAL_STATUSES:
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Turn did not finish within {args.timeout_seconds} seconds")
            time.sleep(1)
            turn = get_json(
                args.base_url,
                f"/sessions/{quote(session['id'], safe='')}/turns/{quote(turn['id'], safe='')}",
            )["data"]

    events = list_events(args.base_url, session["id"], turn["id"])
    created_threads = [event for event in events if event.get("type") == "thread.created"]
    verifier_threads = [
        event for event in created_threads if (event.get("agent_info") or {}).get("name") == "Verifier"
    ]
    verifier_thread_ids = {event.get("thread_id") for event in verifier_threads}

    verifier_mcp_calls: list[dict[str, Any]] = []
    apply_calls: list[dict[str, Any]] = []
    for event in events:
        if event.get("type") != "model.message":
            continue
        for call in event.get("tool_calls") or []:
            function = call.get("function") or {}
            info = call.get("tool_info") or {}
            effective_tool = function.get("name")
            effective_type = info.get("type")
            effective_server = info.get("server_name")
            if function.get("name") == "call_tool":
                try:
                    deferred = json.loads(function.get("arguments") or "{}")
                except json.JSONDecodeError:
                    deferred = {}
                if deferred.get("mcp_server") and deferred.get("tool_name"):
                    effective_tool = deferred["tool_name"]
                    effective_type = "mcp"
                    effective_server = deferred["mcp_server"]
            summarized = {
                "thread_id": event.get("thread_id"),
                "tool_call_id": call.get("id"),
                "tool": effective_tool,
                "tool_type": effective_type,
                "server": effective_server,
                "transport_tool": function.get("name"),
                "created_at": event.get("created_at"),
            }
            if effective_tool == "apply_status_change":
                apply_calls.append(summarized)
            if event.get("thread_id") in verifier_thread_ids and effective_type == "mcp":
                verifier_mcp_calls.append(summarized)

    checks = {
        "turn_done": (turn.get("state") or {}).get("status") == "done",
        "exactly_one_dynamic_subagent": len(created_threads) == 1,
        "verifier_named_correctly": len(verifier_threads) == 1,
        "verifier_used_real_mcp": len(verifier_mcp_calls) >= 1,
        "no_write_tool_attempted": len(apply_calls) == 0,
    }
    if not all(checks.values()):
        failed = [name for name, passed in checks.items() if not passed]
        raise RuntimeError(f"Verifier acceptance failed: {', '.join(failed)}")

    agent_ref = session.get("agent") or {}
    agent_id = agent_ref.get("id")
    if not agent_id:
        raise RuntimeError("Verifier session agent identity could not be resolved")
    agent = get_json(args.base_url, f"/agents/{quote(str(agent_id), safe='')}").get("data", {})
    model = persisted_model_name(agent)

    receipt = {
        "schema_version": "1.0.0",
        "receipt_kind": "trueforge-dynamic-verifier-experiment",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "session_id": session["id"],
        "turn_id": turn["id"],
        "agent_name": AGENT_NAME,
        "model": model,
        "subagent_events": [
            {
                "event_id": event.get("id"),
                "thread_id": event.get("thread_id"),
                "name": (event.get("agent_info") or {}).get("name"),
                "type": (event.get("agent_info") or {}).get("type"),
                "parent": event.get("parent"),
                "created_at": event.get("created_at"),
            }
            for event in verifier_threads
        ],
        "verifier_mcp_calls": verifier_mcp_calls,
        "write_tool_calls": apply_calls,
        "verification_results": checks,
        "final_status": "VERIFIER_EXPERIMENT_PASS",
        "limitations": [
            "Daytona was not configured, so this receipt does not claim sandbox execution.",
            "This isolated agent does not replace the frozen submission-go-pivot agent.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": receipt["final_status"],
        "session_id": session["id"],
        "turn_id": turn["id"],
        "checks": checks,
        "output": str(args.output),
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
