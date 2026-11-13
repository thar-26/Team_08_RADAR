"""Public/private separation: a company's private priorities, saved items,
alerts and chats never reach visitors or other companies."""
import json
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from radar import api, auth, db
from radar.api_support import apply_edit

SECRET = "privacy-test-secret"


def _profile(name: str, private_text: str) -> dict:
    claims = [
        {"id": "f1", "section": "offerings", "statement": f"{name} builds underwater sensors.", "status": "fact",
         "evidence": [{"url": "https://example.se", "quote": "builds underwater sensors", "retrieved_at": "2026-11-12", "verified": True}],
         "reasoning": "", "origin": "agent", "review": "unreviewed"},
    ]
    p = {"name": name, "summary": f"{name} summary.", "size_hint": "sme", "size_basis": "", "claims": claims,
         "sources": [], "missing": [], "generated_at": "2026-11-12"}
    p, _ = apply_edit(p, "add", None, {"statement": private_text, "section": "priorities"}, editor={"name": "Anna"})
    return p


def _token(email: str) -> str:
    return jwt.encode({"sub": email, "name": email, "aud": "radar-api", "exp": int(time.time()) + 300}, SECRET, algorithm="HS256")


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET", SECRET)
    monkeypatch.setenv("AUTH_GOOGLE_ID", "test-google-id")
    monkeypatch.setenv("RADAR_STAFF_EMAILS", "")
    auth.init()
    for slug, name, secret in (("alpha", "Alpha AB", "Alpha secretly plans a hydrogen ferry pilot"),
                               ("beta", "Beta AB", "Beta secretly plans to enter Norway")):
        db.upsert("companies", {"slug": slug, "name": name, "website": f"https://www.{slug}.se/", "bsp_page": "",
                                "profile": json.dumps(_profile(name, secret)), "profile_version": 1}, ["slug"])
    db.upsert("memberships", {"email": "anna@alpha.se", "slug": "alpha", "status": "approved", "via": "domain",
                              "created_at": "x", "decided_by": "test"}, ["email", "slug"])
    return TestClient(api.app)


def _claims(resp) -> str:
    return " ".join(c["statement"] for c in resp.json()["profile"]["claims"])


def test_added_priorities_are_private_by_default():
    p = _profile("Alpha AB", "secret plan")
    assert p["claims"][-1]["visibility"] == "private"


def test_visitor_sees_public_profile_only(client):
    r = client.get("/api/companies/alpha?lang=en")
    assert r.status_code == 200
    assert "builds underwater sensors" in _claims(r)
    assert "hydrogen ferry" not in _claims(r)
    assert r.json()["can_edit"] is False


def test_member_sees_own_private_priorities(client):
    r = client.get("/api/companies/alpha?lang=en", headers={"Authorization": f"Bearer {_token('anna@alpha.se')}"})
    assert "hydrogen ferry" in _claims(r) and r.json()["can_edit"] is True


def test_other_company_cannot_read_by_changing_the_id(client):
    # Anna is a member of Alpha; asking for Beta must not reveal Beta's private priorities.
    h = {"Authorization": f"Bearer {_token('anna@alpha.se')}"}
    r = client.get("/api/companies/beta?lang=en", headers=h)
    assert "Norway" not in _claims(r)
    assert client.get("/api/companies/beta/timeline", headers=h).text.find("Norway") == -1
    assert client.get("/api/companies/beta/saved", headers=h).status_code == 403
    assert client.get("/api/companies/beta/alerts", headers=h).status_code == 403
    assert client.post("/api/companies/beta/feedback", headers=h, json={"opp_id": "x", "value": "down"}).status_code == 403
    assert client.post("/api/companies/beta/profile", headers=h, json={"action": "add", "statement": "hijack attempt"}).status_code == 403


def test_anonymous_cannot_change_or_read_private_data(client):
    assert client.post("/api/companies/alpha/feedback", json={"opp_id": "x", "value": "down"}).status_code == 401
    assert client.get("/api/companies/alpha/alerts").status_code == 401
    assert client.get("/api/companies/alpha/outbox/1").status_code == 401
    assert client.post("/api/companies/alpha/build").status_code == 401  # already profiled: only its members/staff rebuild


def test_chat_history_is_per_visitor(client):
    db.execute("INSERT INTO chat_log (company_slug, role, content, verdict, created_at, owner) VALUES (?,?,?,?,?,?)",
               ("alpha", "user", "visitor one asked this", "{}", "t", "anon:visitor-one-session-0001"))
    other = client.get("/api/companies/alpha/chat?session=visitor-two-session-0002").json()
    assert not any("visitor one" in m["content"] for m in other)
    mine = client.get("/api/companies/alpha/chat?session=visitor-one-session-0001").json()
    assert any("visitor one" in m["content"] for m in mine)


def test_publish_makes_a_priority_public(client):
    p = _profile("Alpha AB", "Alpha wants partners for sea trials")
    cid = p["claims"][-1]["id"]
    p2, _ = apply_edit(p, "publish", cid, {}, editor={"name": "Anna"})
    assert p2["claims"][-1]["visibility"] == "public"
