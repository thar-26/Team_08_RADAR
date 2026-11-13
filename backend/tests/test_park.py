"""Park tips: Blue Science Park sends a tip, the member's page shows it once."""
import json

from fastapi.testclient import TestClient

from radar import api, db


def test_tip_appears_once_on_member_page():
    db.upsert("companies", {"slug": "gamma", "name": "Gamma AB", "website": "https://gamma.se", "bsp_page": "",
                            "profile": json.dumps({"claims": []}), "profile_version": 1}, ["slug"])
    db.upsert("opportunities", {"id": "test:call-1", "kind": "funding", "source": "vinnova", "title": "Test call",
                                "summary": "s", "url": "https://example.se/call", "deadline": "2099-01-01",
                                "text": "t", "fetched_at": "2026-11-13"}, ["id"])
    c = TestClient(api.app)
    for _ in range(2):  # sending the same tip twice keeps one
        assert c.post("/api/park/tips", json={"slug": "gamma", "opp_id": "test:call-1"}).status_code == 200
    tips = c.get("/api/companies/gamma/tips?lang=en").json()
    assert [t["opportunity"]["title"] for t in tips] == ["Test call"]
    assert c.post("/api/park/tips", json={"slug": "gamma", "opp_id": "no-such"}).status_code == 404
