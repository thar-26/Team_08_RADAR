"""Verifier agent (deterministic). A claim may only be labelled a *fact* if its
quote really appears in the saved source text. Anything else is downgraded to
*inferred* and the reason is recorded. No LLM: this is the trust anchor."""
from __future__ import annotations

import re
import unicodedata


def normalise(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").lower()
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("–", "-").replace("—", "-")
    s = re.sub(r"[^\w\s%-]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _shingles(tokens: list[str], n: int = 4) -> set[tuple[str, ...]]:
    return {tuple(tokens[i : i + n]) for i in range(max(1, len(tokens) - n + 1))}


def quote_support(quote: str, source_text: str) -> float:
    """1.0 if the quote is a verbatim substring (after normalisation), otherwise
    the share of its 4-word shingles found in the source (0..1)."""
    q, src = normalise(quote), normalise(source_text)
    if not q or len(q) < 12:
        return 0.0
    if q in src:
        return 1.0
    qt, st = q.split(), src.split()
    if len(qt) < 4:
        return 0.0
    qs = _shingles(qt)
    return len(qs & _shingles(st)) / len(qs)


SUPPORT_THRESHOLD = 0.8


def verify_claims(claims: list[dict], sources: dict[str, str]) -> tuple[list[dict], dict]:
    """claims: stored Claim dicts; sources: url -> text. Mutates and returns claims + stats."""
    stats = {"facts_checked": 0, "facts_verified": 0, "downgraded": 0, "inferred": 0}
    for c in claims:
        if c["status"] != "fact":
            stats["inferred"] += c["status"] == "inferred"
            continue
        stats["facts_checked"] += 1
        ok = False
        for ev in c["evidence"]:
            support = quote_support(ev["quote"], sources.get(ev["url"], ""))
            ev["verified"] = support >= SUPPORT_THRESHOLD
            ok = ok or ev["verified"]
        if ok:
            stats["facts_verified"] += 1
        else:
            c["status"] = "inferred"
            c["reasoning"] = (c.get("reasoning") or "") + " [Verifier: the quoted text was not found in the saved source, so this is treated as inferred.]"
            stats["downgraded"] += 1
    return claims, stats
