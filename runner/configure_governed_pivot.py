"""Configure the local MCP server and governed agent in TrueForge 0.1.4.

The script is idempotent and never handles provider credentials. Model provider
configuration remains the responsibility of resume_requalification.ps1.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


MCP_NAME = "governed-operations"
AGENT_NAME = "arcadeops-governed-operator-v1"


def request_json(
    base_url: str,
    path: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    timeout_seconds: float = 20,
) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        f"{base_url.rstrip('/')}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            return json.load(response)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"TrueForge HTTP {error.code} for {method} {path}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"TrueForge is unreachable at {base_url}: {error.reason}") from error


def agent_manifest(model_name: str) -> dict[str, Any]:
    return {
        "model": {"name": model_name},
        "instructions": (
            "You are the governed operator for a fictional demo. You must use the governed-operations MCP tools "
            "and never invent results. For a requested status change, call inspect_records, then "
            "prepare_status_change, then immediately call apply_status_change with the returned change_token. "
            "Do not ask the user a question yourself: TrueForge owns and enforces the native approval pause before "
            "the write tool executes. Use exactly the mission_id supplied."
        ),
        "mcp_servers": [
            {
                "name": MCP_NAME,
                "enable_tools": ["@all"],
                "disable_tools": [],
                "preload_tools": [
                    "inspect_records",
                    "prepare_status_change",
                    "apply_status_change",
                    "export_evidence",
                ],
                "require_approval_for_tools": ["@write"],
                "preload": False,
            }
        ],
        "config": {
            "iteration_limit": 20,
            "sandbox": {"enabled": False, "file_downloads": True},
            "dynamic_sub_agents": {"enabled": False},
            "context_management": {
                "compaction": {"enabled": True},
                "large_tool_response": {"enabled": True},
            },
            "generative_ui": {"enabled": True},
            "ask_user_questions": {"enabled": False},
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8791/api/v1")
    parser.add_argument("--model", default="anthropic/claude-sonnet-5")
    parser.add_argument(
        "--mcp-url",
        default="http://trueforge-governed-mcp-20260824:8765/mcp",
        help="URL reachable from the TrueForge server container",
    )
    args = parser.parse_args()

    request_json(args.base_url, "/settings/mcp-servers", "PUT", {
        "manifest": {
            "type": "remote",
            "name": MCP_NAME,
            "url": args.mcp_url,
            "description": "Fictional approval-gated operations governed by an executable AuthorityContract.",
        }
    })

    discovered = request_json(args.base_url, f"/mcp-servers/{MCP_NAME}/tools").get("data", [])
    tool_names = sorted(tool.get("name") for tool in discovered)
    expected = sorted(["inspect_records", "prepare_status_change", "apply_status_change", "export_evidence"])
    if tool_names != expected:
        raise RuntimeError(f"MCP tool discovery mismatch: expected {expected}, got {tool_names}")

    manifest = agent_manifest(args.model)
    agents = request_json(args.base_url, "/agents").get("data", [])
    existing = next((agent for agent in agents if agent.get("name") == AGENT_NAME), None)
    if existing:
        saved = request_json(args.base_url, f"/agents/{existing['id']}", "PUT", {"manifest": manifest})["data"]
        action = "updated"
    else:
        saved = request_json(args.base_url, "/agents", "POST", {"name": AGENT_NAME, "manifest": manifest})["data"]
        action = "created"

    print(json.dumps({
        "status": "VALID",
        "mcp_server": MCP_NAME,
        "tools": tool_names,
        "agent_action": action,
        "agent_id": saved["id"],
        "agent_name": saved["name"],
        "model": saved["manifest"]["model"]["name"],
        "native_approval_selector": "@write",
        "sandbox_enabled": saved["manifest"]["config"]["sandbox"]["enabled"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
