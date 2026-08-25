"""Start the integrated submission mission and stop at a truthful terminal/pending state.

This script performs a real model turn and can reach TrueForge's native approval
pause. It never approves a tool call. The human decision stays in the UI.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.parse import quote

from configure_governed_pivot import request_json
from configure_submission_agent import AGENT_NAME


TERMINAL_STATUSES = {"done", "error", "cancelled"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8791/api/v1")
    parser.add_argument("--scenario", type=Path, default=Path("scenario/submission_mission.json"))
    parser.add_argument("--timeout-seconds", type=int, default=300)
    args = parser.parse_args()

    scenario = json.loads(args.scenario.read_text(encoding="utf-8"))
    session = request_json(args.base_url, "/sessions", "POST", {"agent": {"name": AGENT_NAME}})["data"]
    prompt = (
        "Execute this fictional governed mission exactly. Use real MCP, one Verifier subagent, generated Python "
        "in the TrueForge sandbox, and the native approval gate. Never claim a step without its tool result.\n\n"
        + json.dumps(scenario, indent=2)
    )
    turn = request_json(
        args.base_url,
        f"/sessions/{quote(session['id'], safe='')}/turns",
        "POST",
        {"input": [{"type": "user.message", "content": prompt}], "previous_turn_id": "none", "stream": False},
    )["data"]

    deadline = time.monotonic() + args.timeout_seconds
    while time.monotonic() < deadline:
        turn = request_json(
            args.base_url,
            f"/sessions/{quote(session['id'], safe='')}/turns/{quote(turn['id'], safe='')}",
        )["data"]
        status = (turn.get("state") or {}).get("status")
        required_actions = (turn.get("state") or {}).get("required_actions") or []
        if status in TERMINAL_STATUSES or required_actions:
            break
        time.sleep(1)

    status = (turn.get("state") or {}).get("status")
    required_actions = (turn.get("state") or {}).get("required_actions") or []
    result = {
        "session_id": session["id"],
        "turn_id": turn["id"],
        "turn_status": status,
        "required_action_types": sorted({item.get("type", "unknown") for item in required_actions}),
        "next_step": (
            "Open this session in TrueForge and make the human Allow/Deny decision."
            if required_actions
            else "Inspect the terminal turn and export the receipt."
        ),
    }
    print(json.dumps(result, indent=2))
    if status not in TERMINAL_STATUSES and not required_actions:
        raise RuntimeError("TURN_DID_NOT_REACH_TERMINAL_OR_APPROVAL_STATE")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
