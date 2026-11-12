"""Profile editing helpers shared by the API and the Watcher.

Every company correction records who made it and when (`updated_by`,
`updated_at`), so the profile can label company-provided updates."""
from __future__ import annotations

import copy
import hashlib

from .config import now_iso

# Review states the company sets; "rejected" (wrong) and "outdated" (no longer
# true) are both left out of matching, chat and partner suggestions.
EXCLUDED = ("rejected", "outdated")
DECISIONS = ("confirmed", "rejected", "outdated", "edited")


def carry_over_user_decisions(old: dict, new: dict) -> dict:
    """Keep the company's own decisions when public data is re-profiled:
    user-added claims stay, reviewed claims keep their review state and stamp."""
    merged = copy.deepcopy(new)
    by_stmt = {c["statement"]: c for c in merged["claims"]}
    for c in old.get("claims", []):
        if c.get("origin") == "user":
            if c["statement"] not in by_stmt:
                merged["claims"].append(c)
        elif c.get("review") in DECISIONS and c["statement"] in by_stmt:
            target = by_stmt[c["statement"]]
            for k in ("review", "note", "updated_by", "updated_at"):
                if c.get(k):
                    target[k] = c[k]
    return merged


def _stamp(claim: dict, editor: dict | None) -> None:
    claim["updated_by"] = (editor or {}).get("name") or (editor or {}).get("email") or "company"
    claim["updated_at"] = now_iso()


def apply_edit(profile: dict, action: str, claim_id: str | None, payload: dict, editor: dict | None = None) -> tuple[dict, str]:
    """action: confirm | reject | outdated | edit | add | restore. Returns (new_profile, note)."""
    p = copy.deepcopy(profile)
    claims = p["claims"]
    target = next((c for c in claims if c["id"] == claim_id), None) if claim_id else None
    if action in ("confirm", "reject", "outdated", "edit", "restore") and not target:
        raise ValueError("claim not found")
    if action == "confirm":
        target["review"] = "confirmed"
        note = f"Confirmed: {target['statement']}"
    elif action == "reject":
        target["review"] = "rejected"
        target["note"] = payload.get("note", "")
        note = f"Marked wrong: {target['statement']}"
    elif action == "outdated":
        target["review"] = "outdated"
        target["note"] = payload.get("note", "")
        note = f"Marked outdated: {target['statement']}"
    elif action == "restore":
        target["review"] = "unreviewed"
        note = f"Restored: {target['statement']}"
    elif action == "edit":
        old = target["statement"]
        target["statement"] = payload["statement"].strip()
        target["review"] = "edited"
        target["status"] = "company_confirmed"
        target["origin"] = "user"
        target["note"] = f"Was: {old}"
        note = f"Corrected: {old} → {target['statement']}"
    elif action == "add":
        stmt = payload["statement"].strip()
        section = payload.get("section", "priorities")
        target = {
            "id": hashlib.sha1(f"user|{section}|{stmt}|{now_iso()}".encode()).hexdigest()[:10],
            "section": section, "statement": stmt, "status": "company_confirmed", "evidence": [],
            "reasoning": "", "origin": "user", "review": "confirmed", "note": "Added by the company",
        }
        claims.append(target)
        note = f"Added ({section}): {stmt}"
    else:
        raise ValueError(f"unknown action {action}")
    _stamp(target, editor)
    who = (editor or {}).get("name") or (editor or {}).get("email") or "company"
    return p, f"{note} — {who}"
