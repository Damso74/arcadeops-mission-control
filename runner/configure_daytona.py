"""Configure TrueForge's Daytona sandbox provider without exposing credentials.

The API key is read only from DAYTONA_API_KEY. The script prints provider and
build status, never the key or the response manifest containing its redacted
placeholder. A successful exit means the official TrueForge sandbox image is
ready, not merely that the settings request was accepted.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

from configure_governed_pivot import request_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8791/api/v1")
    parser.add_argument("--timeout-seconds", type=int, default=900)
    args = parser.parse_args()

    api_key = os.environ.get("DAYTONA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DAYTONA_API_KEY=ABSENT")

    catalog = request_json(args.base_url, "/catalogs/sandbox-providers").get("data", [])
    preset = next((item for item in catalog if item.get("type") == "daytona"), None)
    if not preset:
        raise RuntimeError("DAYTONA_CATALOG=ABSENT")

    manifest = {**preset, "auth": {"api_key": api_key}}
    configured = request_json(
        args.base_url,
        "/settings/sandbox-providers",
        "PUT",
        {"manifest": manifest},
        timeout_seconds=min(args.timeout_seconds, 240),
    )["data"]

    deadline = time.monotonic() + args.timeout_seconds
    status = configured.get("status")
    reason = configured.get("status_reason")
    while status == "pending" and time.monotonic() < deadline:
        time.sleep(5)
        configured = request_json(args.base_url, "/settings/sandbox-providers")["data"]
        status = configured.get("status")
        reason = configured.get("status_reason")

    capabilities = request_json(args.base_url, "/capabilities").get("data", {})
    sandbox_enabled = bool((capabilities.get("sandbox") or {}).get("enabled"))
    result = {
        "provider": "daytona",
        "build_status": status,
        "status_reason": reason,
        "sandbox_capability_enabled": sandbox_enabled,
    }
    print(json.dumps(result, indent=2))

    if status != "ready" or not sandbox_enabled:
        raise RuntimeError("DAYTONA_SANDBOX_NOT_READY")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
