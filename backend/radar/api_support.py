"""Profile editing helpers shared by the API and the Watcher."""
from __future__ import annotations

import copy
import hashlib

from .config import now_iso


def carry_over_user_decisions(old: dict, new: dict) -> dict:
    """Keep the company's own decisions when public data is re-profiled:
    user-added claims stay, reviewed claims keep their review state."""
    merged = copy.deepcopy(new)
    by_stmt = {c["statement"]: c for c in merged["claims"]}
    for c in old.get("claims", []):
        if c.get("origin") == "user":
            if c["statement"] not in by_stmt:
                merged["claims"].append(c)
        elif c.get("review") in ("confirmed", "rejected", "edited") and c["statement"] in by_stmt:
            by_stmt[c["statement"]]["review"] = c["review"]
            by_stmt[c["statement"]]["note"] = c.get("note", "")
    return merged


def apply_edit(profile: dict, action: str, claim_id: str | None, payload: dict) -> tuple[dict, str]:
    """action: confirm | reject | edit | add | restore. Returns (new_profile, note)."""
    p = copy.deepcopy(profile)
    claims = p["claims"]
    target = next((c for c in claims if c["id"] == claim_id), None) if claim_id else None
    if action in ("confirm", "reject", "edit", "restore") and not target:
        raise ValueError("claim not found")
    if action == "confirm":
        target["review"] = "confirmed"
        note = f"Confirmed: {target['statement']}"
    elif action == "reject":
        target["review"] = "rejected"
        target["note"] = payload.get("note", "")
        note = f"Rejected: {target['statement']}"
    elif action == "restore":
        target["review"] = "unreviewed"
        note = f"Restored: {target['statement']}"
    elif action == "edit":
        old = target["statement"]
        target["statement"] = payload["statement"].strip()
        target["review"] = "edited"
        target["status"] = "company_confirmed"
        target["origin"] = "user"
        target["note"] = f"Edited by company (was: {old})"
        note = f"Edited: {old} → {target['statement']}"
    elif action == "add":
        stmt = payload["statement"].strip()
        section = payload.get("section", "priorities")
        claims.append({
            "id": hashlib.sha1(f"user|{section}|{stmt}|{now_iso()}".encode()).hexdigest()[:10],
            "section": section, "statement": stmt, "status": "company_confirmed", "evidence": [],
            "reasoning": "", "origin": "user", "review": "confirmed", "note": "Added by the company",
        })
        note = f"Added ({section}): {stmt}"
    else:
        raise ValueError(f"unknown action {action}")
    return p, note
