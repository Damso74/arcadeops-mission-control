"""Create or update an isolated TrueForge agent with one dynamic Verifier."""

from __future__ import annotations

import argparse
import json
import sys

from configure_governed_pivot import MCP_NAME, agent_manifest, request_json


AGENT_NAME = "arcadeops-governed-operator-verifier-v1"


def verifier_manifest(model_name: str) -> dict:
    manifest = agent_manifest(model_name)
    manifest["instructions"] = (
        "You are an experimental governed operator for fictional local data. Use only the governed-operations MCP tools and "
        "never invent tool results. For every user mission, inspect the relevant records yourself, then create exactly one "
        "dynamic sub-agent named Verifier. Give Verifier a self-contained task requiring it to independently inspect the "
        "records through MCP and verify the proposed operation against the observed tool results. Verifier must never call "
        "apply_status_change. Wait for Verifier to finish and cite its conclusion. During verifier-only acceptance checks, "
        "do not call apply_status_change and do not mutate state. TrueForge owns approval for any later write. Use exactly "
        "the mission_id supplied."
    )
    manifest["config"]["dynamic_sub_agents"] = {"enabled": True}
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8791/api/v1")
    parser.add_argument("--model", default="anthropic/claude-sonnet-5")
    args = parser.parse_args()

    # Fail closed if the stable MCP configuration is not still discoverable.
    tools = request_json(args.base_url, f"/mcp-servers/{MCP_NAME}/tools").get("data", [])
    tool_names = sorted(tool.get("name") for tool in tools)
    expected = sorted(["inspect_records", "prepare_status_change", "apply_status_change", "export_evidence"])
    if tool_names != expected:
        raise RuntimeError(f"Stable MCP gate failed: expected {expected}, got {tool_names}")

    manifest = verifier_manifest(args.model)
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
        "agent_action": action,
        "agent_id": saved["id"],
        "agent_name": saved["name"],
        "model": saved["manifest"]["model"]["name"],
        "dynamic_sub_agents_enabled": saved["manifest"]["config"]["dynamic_sub_agents"]["enabled"],
        "stable_agent_unchanged": "arcadeops-governed-operator-v1",
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
