"""Who is calling, and which companies may they see?

The website signs users in (Google / Microsoft via Auth.js) and sends the API a
short-lived HS256 token signed with AUTH_SECRET. Every company endpoint then
checks membership here, server-side: a user only ever sees companies they are
an approved member of. Blue Science Park staff (RADAR_STAFF_EMAILS) see all.

Membership is granted automatically when the user's verified email domain is
the company's own website domain (e.g. name@saab.com -> Saab); otherwise it is a
request that staff approve."""
from __future__ import annotations

import os
from urllib.parse import urlparse

import jwt
from fastapi import Header, HTTPException

from . import db
from .config import now_iso

SCHEMA = """
CREATE TABLE IF NOT EXISTS memberships (
    email TEXT,
    slug TEXT,
    status TEXT,          -- approved | pending | rejected
    via TEXT,             -- domain | staff | request
    created_at TEXT,
    decided_by TEXT,
    PRIMARY KEY (email, slug)
);
CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    name TEXT,
    last_seen TEXT
);
"""
# Identity for internal calls (pipeline, warm-up), never reachable over HTTP.
SYSTEM = {"email": "system@radar.local", "name": "system", "staff": True}
FREE_MAIL = {"gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "yahoo.com", "proton.me", "protonmail.com"}


def init() -> None:
    with db.session() as c:
        c.executescript(SCHEMA)


def login_required() -> bool:
    """Editing requires sign-in as soon as a login provider is configured."""
    return bool(os.getenv("AUTH_SECRET") and (os.getenv("AUTH_GOOGLE_ID") or os.getenv("AUTH_MICROSOFT_ENTRA_ID_ID")))


def staff_emails() -> set[str]:
    return {e.strip().lower() for e in os.getenv("RADAR_STAFF_EMAILS", "").split(",") if e.strip()}


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, os.environ["AUTH_SECRET"], algorithms=["HS256"], audience="radar-api", options={"require": ["exp", "sub"]})
    except (jwt.PyJWTError, KeyError) as e:
        raise HTTPException(401, "Invalid or expired session") from e


def current_user(authorization: str | None = Header(default=None)) -> dict | None:
    """FastAPI dependency: the signed-in user, or None when anonymous."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    claims = _decode(authorization.split(" ", 1)[1])
    email = claims["sub"].lower()
    init()
    db.upsert("users", {"email": email, "name": claims.get("name") or "", "last_seen": now_iso()}, ["email"])
    return {"email": email, "name": claims.get("name") or email, "staff": email in staff_emails()}


def domain_of(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower()


def site_domain(url: str) -> str:
    host = urlparse(url or "").netloc.lower()
    return host[4:] if host.startswith("www.") else host


def domain_matches(email: str, website: str) -> bool:
    d, s = domain_of(email), site_domain(website)
    if not d or not s or d in FREE_MAIL:
        return False
    # techinova.se vs techinova.com: compare the name part as well
    return d == s or d.endswith("." + s) or s.endswith("." + d) or d.split(".")[0] == s.split(".")[0]


def memberships(email: str) -> list[dict]:
    init()
    return db.rows(
        "SELECT m.slug, m.status, m.via, c.name FROM memberships m JOIN companies c ON c.slug=m.slug WHERE m.email=? ORDER BY c.name",
        (email,),
    )


def can_access(user: dict | None, slug: str) -> bool:
    if not login_required():
        return True  # prototype mode: no login provider configured
    if not user:
        return False
    if user["staff"]:
        return True
    init()
    return bool(db.one("SELECT 1 FROM memberships WHERE email=? AND slug=? AND status='approved'", (user["email"], slug)))


def require_edit(user: dict | None, slug: str) -> None:
    """Only an approved member of the company (or staff) may change its profile."""
    if can_access(user, slug):
        return
    raise HTTPException(401 if not user else 403, "Sign in to correct this profile" if not user else "Only members of this company can correct its profile")


def request_access(user: dict, slug: str) -> dict:
    init()
    company = db.one("SELECT slug, website FROM companies WHERE slug=?", (slug,))
    if not company:
        raise HTTPException(404, "Unknown company")
    existing = db.one("SELECT status FROM memberships WHERE email=? AND slug=?", (user["email"], slug))
    if existing and existing["status"] == "approved":
        return {"status": "approved"}
    auto = domain_matches(user["email"], company["website"])
    status = "approved" if auto else "pending"
    db.upsert("memberships", {"email": user["email"], "slug": slug, "status": status, "via": "domain" if auto else "request",
                              "created_at": now_iso(), "decided_by": "domain match" if auto else None}, ["email", "slug"])
    return {"status": status}


def decide(staff: dict, email: str, slug: str, approve: bool) -> None:
    init()
    db.execute("UPDATE memberships SET status=?, decided_by=? WHERE email=? AND slug=?",
               ("approved" if approve else "rejected", staff["email"], email.lower(), slug))


def suggestions(email: str) -> list[dict]:
    """Members whose website domain matches the user's email domain."""
    return [
        {"slug": c["slug"], "name": c["name"]}
        for c in db.rows("SELECT slug, name, website FROM companies WHERE slug NOT LIKE 'sim-%'")
        if domain_matches(email, c["website"])
    ]

require = require_edit  # backwards-compatible name
