"""Frontière unique entre le spike et TrueForge.

Aucune fonction de ce module n'est implémentee : chaque appel leve
`UnknownTrueForgeAPI`. C'est intentionnel.

Etat au moment de la redaction : aucune surface publique TrueForge n'a ete
confirmee dans cet environnement (aucune commande lancee, aucune documentation
consultee). Ecrire ici des noms de classes ou d'endpoints plausibles
reviendrait a fabriquer une API ; le spike serait alors un test de fiction.

Regle de cablage, une fonction a la fois :
  1. lever l'inconnue correspondante dans docs/history/UNKNOWNS.md
     (doc publique officielle) ;
  2. remplacer le corps par le vrai appel ;
  3. supprimer le `raise UnknownTrueForgeAPI` de cette fonction uniquement ;
  4. relancer le checkpoint concerne.

Contrainte de securite : ne jamais journaliser la valeur d'une variable
d'environnement ni un jeton. Seule la presence d'une variable est observable.

Aucune dependance externe : bibliotheque standard uniquement.
"""

from __future__ import annotations

import os
from typing import Any


class UnknownTrueForgeAPI(NotImplementedError):
    """Levee tant que la surface publique reelle n'est pas branchee.

    Le runner traduit cette exception en statut `BLOCKED_UNKNOWN_API`, jamais
    en `PASS` ni en `FAIL` : une inconnue n'est pas un resultat experimental.
    """

    def __init__(self, unknown_id: str, question: str) -> None:
        super().__init__(f"[{unknown_id}] API TrueForge non validee - {question}")
        self.unknown_id = unknown_id
        self.question = question


def env_var_is_present(name: str) -> bool:
    """Presence d'une variable d'environnement. Ne renvoie et ne journalise jamais sa valeur."""
    return bool(os.environ.get(name))


# --- CP1 TRUEFORGE_BOOT ------------------------------------------------------

def boot(config: dict[str, Any]) -> Any:
    """Instancier un agent TrueForge et renvoyer un handle porteur d'un identifiant stable."""
    raise UnknownTrueForgeAPI(
        "U2",
        "Quel est le point d'entree public officiel pour creer un agent, et quel "
        "identifiant stable renvoie-t-il ?",
    )


# --- CP2 MODEL_ROUND_TRIP ----------------------------------------------------

def submit_mission(agent: Any, mission: dict[str, Any]) -> Any:
    """Soumettre la mission et renvoyer un handle de run/session."""
    raise UnknownTrueForgeAPI(
        "U3",
        "Comment une mission est-elle soumise sur la surface publique, et sous quelle forme ?",
    )


def collect_model_trace(run: Any) -> list[dict[str, Any]]:
    """Renvoyer la trace brute de l'aller-retour modele (evenements, stream ou logs).

    Doit contenir de quoi prouver qu'un modele a bien repondu : c'est la preuve
    brute exigee par CP2. Une trace vide n'est pas un PASS.
    """
    raise UnknownTrueForgeAPI(
        "U3",
        "Quelle API publique expose la trace d'un aller-retour modele ?",
    )


# --- CP3 SANDBOX_EXECUTION ---------------------------------------------------

def run_step_in_sandbox(run: Any, step: dict[str, Any]) -> dict[str, Any]:
    """Executer une etape du scenario dans la sandbox TrueForge.

    Doit distinguer explicitement trois issues, sans quoi CP3 est ininterpretable :
      - `allowed`     : l'etape s'est executee ;
      - `intercepted` : l'etape a ete bloquee ou mise en attente d'approbation ;
      - `failed`      : erreur technique, sans rapport avec la politique de sandbox.
    """
    raise UnknownTrueForgeAPI(
        "U4",
        "TrueForge fournit-il une sandbox de premier ordre, quel est son perimetre "
        "exact (FS / reseau / process) et comment la declare-t-on ?",
    )


# --- CP4 APPROVAL_AND_RESUME -------------------------------------------------

def request_approval(run: Any, step_id: str) -> str:
    """Ouvrir une demande d'approbation pour une etape sensible ; renvoyer son identifiant."""
    raise UnknownTrueForgeAPI(
        "U5",
        "Existe-t-il une API publique d'approbation humaine, et ou l'humain approuve-t-il "
        "concretement (UI web, CLI, webhook) ?",
    )


def poll_approval(run: Any, approval_id: str) -> dict[str, Any]:
    """Consulter l'etat d'une demande sans jamais pouvoir la modifier.

    IMPORTANT : cette fonction est en lecture seule par conception. Le runner ne
    doit disposer d'aucun moyen d'emettre une decision, sinon CP4 ne prouve rien
    (docs/history/SPIKE_PLAN.md §5). Attendu au minimum : etat, horodatage, identite de
    l'approbateur - laquelle doit differer de celle de l'agent.
    """
    raise UnknownTrueForgeAPI(
        "U5",
        "Comment lit-on l'etat d'une approbation, et l'identite de l'approbateur "
        "est-elle exposee ?",
    )


def resume(run: Any, approval_id: str) -> dict[str, Any]:
    """Reprendre l'execution apres approbation.

    Point a trancher (U6) : reprise au point d'arret exact, ou relance depuis le
    debut ? Le rejeu de S1 signale une relance, pas une reprise.
    """
    raise UnknownTrueForgeAPI(
        "U6",
        "La reprise repart-elle du point d'arret exact ou relance-t-elle la mission ?",
    )


# --- CP5 SESSION_PERSISTENCE -------------------------------------------------

def reattach_session(config: dict[str, Any], session_id: str) -> Any:
    """Reattacher une session existante depuis un process neuf.

    Le test n'a de valeur que si le process precedent a ete completement arrete :
    un cache en memoire ne prouve rien.
    """
    raise UnknownTrueForgeAPI(
        "U7",
        "L'etat de session survit-il a l'arret du process, ou est-il stocke, et "
        "comment le reattache-t-on ?",
    )


# --- CP6 EVIDENCE_EXPORT -----------------------------------------------------

def export_evidence(run: Any, output_dir: str) -> str:
    """Exporter la trace officielle ; renvoyer le chemin de l'artefact produit.

    L'export doit couvrir : mission, etapes, interception, decision d'approbation,
    identite de l'approbateur, horodatages. Un export qui omet l'approbateur ne
    valide pas CP6.
    """
    raise UnknownTrueForgeAPI(
        "U8",
        "Existe-t-il un export de trace officiel, et quel est son format ?",
    )
