"""Orchestrateur du spike TrueForge : 6 checkpoints, garde anti-faux-PASS.

Ce script n'a jamais ete execute. Tant que `runner/trueforge_adapter.py` n'est
pas cable sur les vraies surfaces publiques, chaque checkpoint se termine en
`BLOCKED_UNKNOWN_API` : c'est le comportement attendu, pas une panne.

Usage (a lancer par Codex, apres avoir leve les inconnues de
docs/history/UNKNOWNS.md) :

    python runner/spike_runner.py --only boot
    python runner/spike_runner.py --only sandbox
    python runner/spike_runner.py            # les 6 checkpoints

Codes de sortie : 0 tout PASS | 2 au moins un FAIL | 3 au moins un blocage
| 4 erreur de configuration.

Bibliotheque standard uniquement.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))

import trueforge_adapter as tf  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent

NOT_RUN = "NOT_RUN"
BLOCKED = "BLOCKED_UNKNOWN_API"
FAIL = "FAIL"
PASS = "PASS"

CHECKPOINT_ORDER = [
    ("boot", "TRUEFORGE_BOOT"),
    ("round-trip", "MODEL_ROUND_TRIP"),
    ("sandbox", "SANDBOX_EXECUTION"),
    ("approval", "APPROVAL_AND_RESUME"),
    ("persistence", "SESSION_PERSISTENCE"),
    ("evidence", "EVIDENCE_EXPORT"),
]


class SpikeConfigError(RuntimeError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


class Report:
    """Collecte les resultats. Refuse mecaniquement un PASS sans preuve brute."""

    def __init__(self) -> None:
        self.started_at = now_iso()
        self.results: dict[str, dict[str, Any]] = {
            name: {"status": NOT_RUN, "detail": "", "evidence": {}}
            for _, name in CHECKPOINT_ORDER
        }

    def record(
        self,
        checkpoint: str,
        status: str,
        detail: str,
        evidence: dict[str, Any] | None = None,
    ) -> None:
        evidence = evidence or {}
        if status == PASS and not evidence.get("raw_ref"):
            # Regle anti-faux-PASS : un PASS sans trace brute referencee n'existe pas.
            status = FAIL
            detail = f"PASS refuse (aucune preuve brute referencee). Motif initial : {detail}"
        if status not in (NOT_RUN, BLOCKED, FAIL, PASS):
            raise SpikeConfigError(f"statut interdit : {status}")
        self.results[checkpoint] = {
            "status": status,
            "detail": detail,
            "evidence": evidence,
            "at": now_iso(),
        }

    def exit_code(self) -> int:
        statuses = {r["status"] for r in self.results.values()}
        if FAIL in statuses:
            return 2
        if BLOCKED in statuses or NOT_RUN in statuses:
            return 3
        return 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "$warning": "Genere par le runner du spike. Ne pas editer a la main : "
                        "un resultat ecrit manuellement n'est pas un resultat.",
            "started_at": self.started_at,
            "finished_at": now_iso(),
            "checkpoints": self.results,
        }

    def print_table(self) -> None:
        print("\n  Checkpoint            | Statut")
        print("  ----------------------+---------------------")
        for _, name in CHECKPOINT_ORDER:
            print(f"  {name:<21} | {self.results[name]['status']}")
        print()
        for _, name in CHECKPOINT_ORDER:
            detail = self.results[name].get("detail")
            if detail:
                print(f"  {name}: {detail}")
        print()


# --- Checkpoints -------------------------------------------------------------
# Chaque checkpoint recoit (ctx, report) et n'ecrit son statut que via report.record().
# Les UnknownTrueForgeAPI remontent au dispatcher, qui les traduit en BLOCKED.

def cp_boot(ctx: dict[str, Any], report: Report) -> None:
    key_var = ctx["config"]["auth"]["api_key_env_var"]
    # Presence seulement : la valeur n'est ni lue ni journalisee.
    present = tf.env_var_is_present(key_var)
    agent = tf.boot(ctx["config"])
    ctx["agent"] = agent
    report.record(
        "TRUEFORGE_BOOT",
        PASS,
        f"Agent instancie (variable {key_var} presente : {present}).",
        {"raw_ref": repr(agent)},
    )


def cp_round_trip(ctx: dict[str, Any], report: Report) -> None:
    run = tf.submit_mission(ctx["agent"], ctx["mission"])
    ctx["run"] = run
    trace = tf.collect_model_trace(run)
    if not trace:
        report.record("MODEL_ROUND_TRIP", FAIL, "Trace de modele vide.")
        return
    path = write_artifact(ctx, "model_trace.json", trace)
    report.record(
        "MODEL_ROUND_TRIP",
        PASS,
        f"{len(trace)} evenement(s) de modele captures.",
        {"raw_ref": str(path)},
    )


def cp_sandbox(ctx: dict[str, Any], report: Report) -> None:
    steps = {s["id"]: s for s in ctx["mission"]["steps"]}
    outcomes = {}
    for step_id in ("S1", "S2"):
        outcomes[step_id] = tf.run_step_in_sandbox(ctx["run"], steps[step_id])
    ctx["sandbox_outcomes"] = outcomes

    s1 = outcomes["S1"].get("outcome")
    s2 = outcomes["S2"].get("outcome")
    path = write_artifact(ctx, "sandbox_outcomes.json", outcomes)

    if s1 != "allowed":
        report.record("SANDBOX_EXECUTION", FAIL,
                      f"S1 aurait du etre autorise, observe : {s1}.", {"raw_ref": str(path)})
        return
    if s2 != "intercepted":
        # Une ecriture hors perimetre qui passe signifie qu'il n'y a pas de sandbox.
        report.record("SANDBOX_EXECUTION", FAIL,
                      f"S2 (hors perimetre) n'a pas ete intercepte, observe : {s2}.",
                      {"raw_ref": str(path)})
        return
    report.record("SANDBOX_EXECUTION", PASS,
                  "S1 autorise, S2 intercepte par la sandbox.", {"raw_ref": str(path)})


def cp_approval(ctx: dict[str, Any], report: Report) -> None:
    if ctx["approval_mode"] != "trueforge-native":
        # Le fallback local instrumente la reprise, il ne prouve rien sur l'approbation.
        report.record(
            "APPROVAL_AND_RESUME",
            FAIL,
            f"approval-mode={ctx['approval_mode']} : mode de diagnostic, non valide "
            "pour CP4 (docs/history/SPIKE_PLAN.md §5). Relancer en trueforge-native.",
        )
        return

    approval_id = tf.request_approval(ctx["run"], "S2")
    request_path = write_artifact(ctx, "approval_request.json", {
        "approval_id": approval_id,
        "step": "S2",
        "requested_at": now_iso(),
    })
    print(f"\n  >>> Approbation requise pour S2 (id={approval_id}).")
    print("  >>> Approuver MANUELLEMENT dans l'interface TrueForge, depuis une autre session.")
    print("  >>> Le runner attend en lecture seule ; il ne peut pas s'auto-approuver.\n")

    decision = wait_for_decision(ctx, approval_id)
    if decision.get("state") != "approved":
        report.record("APPROVAL_AND_RESUME", FAIL,
                      f"Aucune approbation obtenue (etat : {decision.get('state')}).",
                      {"raw_ref": str(request_path)})
        return

    approver = decision.get("approver")
    if not approver:
        # Sans identite d'approbateur, impossible de prouver qu'un humain a decide.
        report.record("APPROVAL_AND_RESUME", FAIL,
                      "Approbation sans identite d'approbateur exposee.",
                      {"raw_ref": str(request_path)})
        return

    resumed = tf.resume(ctx["run"], approval_id)
    path = write_artifact(ctx, "approval_and_resume.json",
                          {"decision": decision, "resume": resumed})
    replayed = resumed.get("replayed_steps") or []
    if "S1" in replayed:
        # Rejouer S1 = relance de la mission, pas reprise au point d'arret (U6).
        report.record("APPROVAL_AND_RESUME", FAIL,
                      "S1 a ete rejoue : relance depuis le debut, pas reprise au point d'arret.",
                      {"raw_ref": str(path)})
        return
    report.record("APPROVAL_AND_RESUME", PASS,
                  f"Approuve par {approver}, reprise a partir de S2.", {"raw_ref": str(path)})


def cp_persistence(ctx: dict[str, Any], report: Report) -> None:
    session_id = ctx.get("session_id")
    if not session_id:
        report.record("SESSION_PERSISTENCE", FAIL,
                      "Aucun identifiant de session a reattacher.")
        return
    reattached = tf.reattach_session(ctx["config"], session_id)
    path = write_artifact(ctx, "session_reattach.json", {"session_id": session_id,
                                                         "reattached": repr(reattached)})
    report.record("SESSION_PERSISTENCE", PASS,
                  "Session reattachee. ATTENTION : ne vaut que si le process precedent "
                  "a ete completement arrete (voir --session-id).",
                  {"raw_ref": str(path)})


def cp_evidence(ctx: dict[str, Any], report: Report) -> None:
    artifact = tf.export_evidence(ctx["run"], str(ctx["run_dir"]))
    report.record("EVIDENCE_EXPORT", PASS,
                  f"Export produit : {artifact}. Verifier a la main qu'il contient "
                  "mission, interception, decision, approbateur et horodatages.",
                  {"raw_ref": str(artifact)})


CHECKPOINTS: dict[str, Callable[[dict[str, Any], Report], None]] = {
    "TRUEFORGE_BOOT": cp_boot,
    "MODEL_ROUND_TRIP": cp_round_trip,
    "SANDBOX_EXECUTION": cp_sandbox,
    "APPROVAL_AND_RESUME": cp_approval,
    "SESSION_PERSISTENCE": cp_persistence,
    "EVIDENCE_EXPORT": cp_evidence,
}


# --- Helpers -----------------------------------------------------------------

def wait_for_decision(ctx: dict[str, Any], approval_id: str) -> dict[str, Any]:
    """Sondage en lecture seule jusqu'a decision, expiration ou butee horaire."""
    limits = ctx["config"].get("limits", {})
    deadline = time.time() + float(limits.get("approval_wait_seconds", 900))
    hard = limits.get("hard_deadline_local")
    hard_ts = datetime.fromisoformat(hard).timestamp() if hard else None

    while time.time() < deadline:
        if hard_ts and time.time() > hard_ts:
            return {"state": "hard_deadline_reached"}
        decision = tf.poll_approval(ctx["run"], approval_id)
        if decision.get("state") in ("approved", "rejected", "expired"):
            return decision
        time.sleep(5)
    return {"state": "timeout"}


def write_artifact(ctx: dict[str, Any], name: str, payload: Any) -> Path:
    path = ctx["run_dir"] / name
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=repr),
                    encoding="utf-8")
    return path


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SpikeConfigError(f"fichier introuvable : {path}")
    return json.loads(path.read_text(encoding="utf-8"))


# --- Entree ------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Runner du spike TrueForge.")
    parser.add_argument("--config", default="config/trueforge.spike.json")
    parser.add_argument("--mission", default="scenario/mission.json")
    parser.add_argument("--only", choices=[k for k, _ in CHECKPOINT_ORDER],
                        help="n'executer qu'un checkpoint")
    parser.add_argument("--approval-mode", choices=["trueforge-native", "local-file"],
                        default=None, help="surcharge du mode d'approbation")
    parser.add_argument("--session-id", default=None,
                        help="session a reattacher depuis un process neuf (CP5)")
    args = parser.parse_args(argv)

    try:
        config = load_json(REPO_ROOT / args.config)
        mission = load_json(REPO_ROOT / args.mission)
    except SpikeConfigError as exc:
        print(f"ERREUR de configuration : {exc}", file=sys.stderr)
        print("Copier config/trueforge.spike.example.json vers "
              "config/trueforge.spike.json (sans y mettre de secret).", file=sys.stderr)
        return 4

    run_dir = REPO_ROOT / config.get("evidence", {}).get("output_dir", "evidence")
    run_dir = run_dir / f"run-{datetime.now().strftime('%Y%m%dT%H%M%S')}"
    run_dir.mkdir(parents=True, exist_ok=True)

    ctx: dict[str, Any] = {
        "config": config,
        "mission": mission,
        "run_dir": run_dir,
        "session_id": args.session_id,
        "approval_mode": args.approval_mode or config.get("approval", {}).get("mode"),
    }

    report = Report()
    selected = [n for k, n in CHECKPOINT_ORDER if args.only in (None, k)]

    for name in selected:
        try:
            CHECKPOINTS[name](ctx, report)
        except tf.UnknownTrueForgeAPI as exc:
            # Une inconnue n'est ni un succes ni un echec experimental.
            report.record(name, BLOCKED, str(exc), {"unknown_id": exc.unknown_id})
            break
        except Exception as exc:  # noqa: BLE001 - on veut la cause exacte dans le rapport
            report.record(name, FAIL, f"{type(exc).__name__}: {exc}")
            break
        if report.results[name]["status"] != PASS:
            break  # arret au premier checkpoint non concluant

    report_path = run_dir / "report.json"
    report_path.write_text(json.dumps(report.to_dict(), indent=2, ensure_ascii=False),
                           encoding="utf-8")
    report.print_table()
    print(f"  Rapport : {report_path}")
    print("  Reporter ces statuts dans docs/history/SPIKE_LOG.md, sans les arrondir.\n")
    return report.exit_code()


if __name__ == "__main__":
    raise SystemExit(main())
