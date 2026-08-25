"""Create the final TrueForge submission agent after all capabilities are real."""

from __future__ import annotations

import argparse
import json
import sys

from configure_governed_pivot import MCP_NAME, agent_manifest, request_json


AGENT_NAME = "arcadeops-mission-control-v1"


def submission_manifest(model_name: str) -> dict:
    manifest = agent_manifest(model_name)
    manifest["instructions"] = (
        "You are ArcadeOps Mission Control for fictional local records. Never invent tool or sandbox results. "
        "For a requested status change, first inspect the target through governed-operations. Then create exactly "
        "one dynamic sub-agent named Verifier and give it a self-contained, read-only task to inspect the records "
        "and independently verify the proposed transition. Verifier must never call apply_status_change. After it "
        "returns, prepare the change yourself. Before any write, use the TrueForge sandbox exec tool to generate and "
        "run a small Python validator. That code must use the sandbox's pre-installed mcp_client to call the "
        "read-only inspect_records and prepare_status_change tools through TrueForge's MCP bridge, then validate the "
        "observed mission id, record id, before/after statuses and the AuthorityContract rules stated in the mission. "
        "The validator must fail closed and print "
        "SANDBOX_VALIDATION_PASS only when every invariant holds. Call apply_status_change only after that exact "
        "sandbox result, using the current change_token. Do not ask for approval in prose: TrueForge must own the "
        "native Allow/Deny pause for the @write tool. Use exactly the mission_id supplied."
    )
    manifest["config"]["sandbox"] = {"enabled": True, "file_downloads": True}
    manifest["config"]["dynamic_sub_agents"] = {"enabled": True}
    manifest["config"]["iteration_limit"] = 40
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8791/api/v1")
    parser.add_argument("--model", default="anthropic/claude-sonnet-5")
    args = parser.parse_args()

    capabilities = request_json(args.base_url, "/capabilities").get("data", {})
    if not (capabilities.get("sandbox") or {}).get("enabled"):
        raise RuntimeError("SANDBOX_CAPABILITY=ABSENT; configure a real Daytona provider first")

    tools = request_json(args.base_url, f"/mcp-servers/{MCP_NAME}/tools").get("data", [])
    tool_names = sorted(tool.get("name") for tool in tools)
    expected = sorted(["inspect_records", "prepare_status_change", "apply_status_change", "export_evidence"])
    if tool_names != expected:
        raise RuntimeError(f"MCP tool discovery mismatch: expected {expected}, got {tool_names}")

    manifest = submission_manifest(args.model)
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
        "sandbox_enabled": saved["manifest"]["config"]["sandbox"]["enabled"],
        "dynamic_sub_agents_enabled": saved["manifest"]["config"]["dynamic_sub_agents"]["enabled"],
        "native_approval_selector": "@write",
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
