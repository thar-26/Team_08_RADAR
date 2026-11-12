"""Bolagsverket (Swedish Companies Registration Office) — API "Värdefulla
datamängder" (high-value datasets), OAuth2 client-credentials.

Given an organisation number it returns the official name, legal form,
registration date, business description, SNI industry codes, postal address
and whether the company is active. Credentials live in .env only:

    BOLAGSVERKET_CLIENT_ID=...
    BOLAGSVERKET_CLIENT_SECRET=...
    BOLAGSVERKET_ENV=prod            # or "test" for the accept2 environment
"""
from __future__ import annotations

import difflib
import json
import os
import re
import time
import unicodedata
import uuid

import httpx

from .. import db
from ..config import USER_AGENT, now_iso

ENVIRONMENTS = {
    "prod": {
        "token": "https://portal.api.bolagsverket.se/oauth2/token",
        "api": "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1",
    },
    "test": {
        "token": "https://portal-accept2.api.bolagsverket.se/oauth2/token",
        "api": "https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1",
    },
}
SCOPE = "vardefulla-datamangder:read vardefulla-datamangder:ping"
REGISTER_URL = "https://bolagsverket.se/apierochoppnadata.2531.html"

SCHEMA = """
CREATE TABLE IF NOT EXISTS registry (
    slug TEXT PRIMARY KEY,
    orgnr TEXT,
    data TEXT,          -- normalised JSON
    raw TEXT,           -- raw API answer (for audit)
    name_match REAL,    -- similarity between registry name and member name
    status TEXT,        -- verified | name_mismatch | not_found | error
    fetched_at TEXT
);
"""

_token: dict = {}


class RegistryError(Exception):
    pass


def configured() -> bool:
    return bool(os.getenv("BOLAGSVERKET_CLIENT_ID") and os.getenv("BOLAGSVERKET_CLIENT_SECRET"))


def _env() -> dict:
    env = ENVIRONMENTS.get(os.getenv("BOLAGSVERKET_ENV", "prod"), ENVIRONMENTS["prod"])
    return {
        "token": os.getenv("BOLAGSVERKET_TOKEN_URL", env["token"]),
        "api": os.getenv("BOLAGSVERKET_API_URL", env["api"]),
    }


def _access_token() -> str:
    if _token.get("value") and _token.get("expires", 0) > time.time() + 30:
        return _token["value"]
    if not configured():
        raise RegistryError("Bolagsverket credentials are missing in .env")
    r = httpx.post(
        _env()["token"],
        data={"grant_type": "client_credentials", "scope": SCOPE},
        auth=(os.environ["BOLAGSVERKET_CLIENT_ID"], os.environ["BOLAGSVERKET_CLIENT_SECRET"]),
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    if r.status_code != 200:
        raise RegistryError(f"Token request failed: HTTP {r.status_code}")
    body = r.json()
    _token.update(value=body["access_token"], expires=time.time() + int(body.get("expires_in", 3000)))
    return _token["value"]


def normalise_orgnr(value: str) -> str:
    """'556016-0680' / '5560160680' / '16 5560160680' -> '5560160680'."""
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("16"):
        digits = digits[2:]
    if len(digits) != 10 or not _luhn_ok(digits):
        raise ValueError("Ogiltigt organisationsnummer / invalid organisation number")
    return digits


def _luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(digits):
        n = int(ch) * (2 if i % 2 == 0 else 1)
        total += n - 9 if n > 9 else n
    return total % 10 == 0


def ping() -> bool:
    r = httpx.get(f"{_env()['api']}/isalive", headers={"Authorization": f"Bearer {_access_token()}", "User-Agent": USER_AGENT}, timeout=20)
    return r.status_code == 200


def lookup(orgnr: str) -> dict:
    """Raw organisation record from Bolagsverket."""
    r = httpx.post(
        f"{_env()['api']}/organisationer",
        json={"identitetsbeteckning": normalise_orgnr(orgnr)},
        headers={
            "Authorization": f"Bearer {_access_token()}",
            "X-Request-Id": str(uuid.uuid4()),
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
        timeout=30,
    )
    if r.status_code == 404:
        raise RegistryError("Organisation not found")
    if r.status_code != 200:
        raise RegistryError(f"Lookup failed: HTTP {r.status_code}: {r.text[:200]}")
    return r.json()


def _get(obj, *path, default=None):
    for p in path:
        if isinstance(obj, list):
            obj = obj[0] if obj else None
        if not isinstance(obj, dict):
            return default
        obj = obj.get(p)
    return obj if obj is not None else default


def normalise(raw: dict) -> dict:
    """Flatten the answer into the fields Radar uses."""
    org = (raw.get("organisationer") or [raw])[0]
    names = _get(org, "organisationsnamn", "organisationsnamnLista", default=[]) or []
    name = next((n.get("namn") for n in names if n.get("namn")), None) or _get(org, "organisationsnamn", "namn")
    sni = _get(org, "naringsgrenOrganisation", "sni", default=[]) or []
    addr = _get(org, "postadressOrganisation", "postadress", default={}) or {}
    return {
        "orgnr": _get(org, "organisationsidentitet", "identitetsbeteckning"),
        "name": name,
        "legal_form": _get(org, "juridiskForm", "klartext") or _get(org, "organisationsform", "klartext"),
        "registered": _get(org, "organisationsdatum", "registreringsdatum"),
        "active": (_get(org, "verksamOrganisation", "kod") or "").upper() in ("JA", "J", "TRUE"),
        "deregistered": bool(_get(org, "avregistreradOrganisation", "avregistreringsdatum")),
        "description": " ".join((_get(org, "verksamhetsbeskrivning", "beskrivning") or "").split()) or None,
        "sni": [{"code": s.get("kod"), "text": s.get("klartext")} for s in sni if s.get("kod")],
        "city": addr.get("postort"),
        "postcode": addr.get("postnummer"),
        "street": addr.get("utdelningsadress"),
    }


def _plain(s: str) -> str:
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\b(ab|aktiebolag|publ|ltd|group|sweden|sverige|holding)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def name_similarity(a: str, b: str) -> float:
    pa, pb = _plain(a), _plain(b)
    if not pa or not pb:
        return 0.0
    if pa in pb or pb in pa:
        return 1.0
    return difflib.SequenceMatcher(None, pa, pb).ratio()


def register(slug: str, orgnr: str) -> dict:
    """Look up a member, check the name matches, store, and return the result."""
    with db.session() as c:
        c.executescript(SCHEMA)
    member = db.one("SELECT name FROM companies WHERE slug=?", (slug,))
    if not member:
        raise ValueError("Unknown member")
    digits = normalise_orgnr(orgnr)
    try:
        raw = lookup(digits)
    except RegistryError as e:
        status = "not_found" if "not found" in str(e).lower() else "error"
        db.upsert("registry", {"slug": slug, "orgnr": digits, "data": None, "raw": None, "name_match": 0,
                               "status": status, "fetched_at": now_iso()}, ["slug"])
        raise
    data = normalise(raw)
    sim = name_similarity(data.get("name") or "", member["name"])
    status = "verified" if sim >= 0.6 else "name_mismatch"
    db.upsert("registry", {"slug": slug, "orgnr": digits, "data": json.dumps(data, ensure_ascii=False),
                           "raw": json.dumps(raw, ensure_ascii=False), "name_match": round(sim, 3),
                           "status": status, "fetched_at": now_iso()}, ["slug"])
    return {"status": status, "name_match": round(sim, 3), "data": data}


def get(slug: str) -> dict | None:
    with db.session() as c:
        c.executescript(SCHEMA)
    row = db.one("SELECT * FROM registry WHERE slug=?", (slug,))
    if not row:
        return None
    row["data"] = db.loads(row["data"])
    row.pop("raw", None)
    return row


def as_claims(slug: str) -> list[dict]:
    """Official registry facts as profile claims (only for verified matches)."""
    row = get(slug)
    if not row or row["status"] != "verified" or not row["data"]:
        return []
    d, when = row["data"], row["fetched_at"]
    ev = [{"quote": "", "url": REGISTER_URL, "retrieved_at": when, "verified": True}]
    out = []

    def add(section: str, statement: str):
        out.append({"id": f"bv-{section}-{len(out)}", "section": section, "statement": statement, "status": "fact",
                    "evidence": ev, "reasoning": "Bolagsverket, official company register", "origin": "agent",
                    "review": "unreviewed", "note": "registry"})

    # Official wording, kept exactly as registered (never machine-translated).
    if d.get("description"):
        add("offerings", d["description"])
    for s in d.get("sni", [])[:3]:
        add("markets", f"SNI {s['code']}: {s['text']}")
    if d.get("city"):
        add("geography", d["city"].title())
    return out
