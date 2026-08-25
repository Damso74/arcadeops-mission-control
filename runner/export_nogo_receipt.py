"""Exporte un reçu honnête d'un spike bloqué depuis les API publiques TrueForge.

Le script ne lit aucune table interne et ne copie aucun manifeste de provider.
Il ne conserve que les statuts HTTP, les compteurs et la version publique.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def get_json(url: str) -> tuple[int, dict[str, Any] | None]:
    try:
        with urlopen(url, timeout=5) as response:  # noqa: S310 - URL locale fournie explicitement
            payload = json.loads(response.read().decode("utf-8"))
            return response.status, payload
    except HTTPError as error:
        return error.code, None
    except (URLError, TimeoutError, json.JSONDecodeError):
        return 0, None


def data_count(payload: dict[str, Any] | None) -> int | None:
    if not payload:
        return None
    data = payload.get("data")
    return len(data) if isinstance(data, list) else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8791")
    parser.add_argument("--output", default="evidence/evidence-receipt.json")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    api = f"{base}/api/v1"
    health_status, health = get_json(f"{base}/healthz")
    model_status, models = get_json(f"{api}/settings/model-providers")
    sandbox_status, _ = get_json(f"{api}/settings/sandbox-providers")
    sessions_status, sessions = get_json(f"{api}/sessions")
    agents_status, agents = get_json(f"{api}/agents")

    output = Path(args.output)
    receipt = {
        "mission_id": None,
        "agent": None,
        "runtime": "trueforge",
        "runtime_version": health.get("version") if health else None,
        "model_provider": None,
        "tools_used": [],
        "sandbox_execution": {
            "status": "not_run",
            "evidence": [
                f"GET /api/v1/settings/sandbox-providers -> HTTP {sandbox_status}"
            ],
        },
        "approval": {
            "required": True,
            "decision": None,
            "resumed": False,
        },
        "deliverable": {
            "type": "no-go-evidence-receipt",
            "path": output.as_posix(),
        },
        "session_persistence": {
            "tested": False,
            "result": "not_run",
        },
        "cost": {
            "available": False,
            "value": None,
        },
        "public_api_observations": {
            "health_http_status": health_status,
            "configured_model_providers_http_status": model_status,
            "configured_model_providers_count": data_count(models),
            "configured_sandbox_provider_http_status": sandbox_status,
            "sessions_http_status": sessions_status,
            "sessions_count": data_count(sessions),
            "agents_http_status": agents_status,
            "agents_count": data_count(agents),
        },
        "verdict": "NO-GO ENVIRONNEMENTAL — aucun runtime modèle disponible",
        "completed_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output)
    return 0 if health_status == 200 else 2


if __name__ == "__main__":
    raise SystemExit(main())
