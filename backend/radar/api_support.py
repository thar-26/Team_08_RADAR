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


def is_private(c: dict) -> bool:
    """Priorities a company adds are private to the company until it publishes them."""
    return c.get("visibility") == "private"


def public_profile(profile: dict) -> dict:
    """What anyone may see: no private additions, no claims the company marked
    wrong or outdated."""
    p = copy.deepcopy(profile)
    p["claims"] = [c for c in p.get("claims", []) if not is_private(c) and c.get("review") not in EXCLUDED]
    return p


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
    """action: confirm | reject | outdated | edit | add | restore | publish | unpublish.
    Returns (new_profile, note). Added statements are private unless payload["public"] is true."""
    p = copy.deepcopy(profile)
    claims = p["claims"]
    target = next((c for c in claims if c["id"] == claim_id), None) if claim_id else None
    if action in ("confirm", "reject", "outdated", "edit", "restore", "publish", "unpublish") and not target:
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
    elif action in ("publish", "unpublish"):
        if target.get("origin") != "user":
            raise ValueError("only statements added by the company can be made private or public")
        target["visibility"] = "public" if action == "publish" else "private"
        note = f"{'Published' if action == 'publish' else 'Made private'}: {target['statement']}"
    elif action == "add":
        stmt = payload["statement"].strip()
        section = payload.get("section", "priorities")
        target = {
            "id": hashlib.sha1(f"user|{section}|{stmt}|{now_iso()}".encode()).hexdigest()[:10],
            "section": section, "statement": stmt, "status": "company_confirmed", "evidence": [],
            "reasoning": "", "origin": "user", "review": "confirmed", "note": "Added by the company",
            "visibility": "public" if payload.get("public") is True else "private",
        }
        claims.append(target)
        note = f"Added ({section}): {stmt}"
    else:
        raise ValueError(f"unknown action {action}")
    _stamp(target, editor)
    who = (editor or {}).get("name") or (editor or {}).get("email") or "company"
    return p, f"{note} — {who}"
