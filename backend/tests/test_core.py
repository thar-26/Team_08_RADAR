"""Offline unit tests (no network, no LLM)."""
from radar.agents.verifier import quote_support, verify_claims
from radar.api_support import apply_edit, carry_over_user_decisions

SRC = "Techinova utvecklar och tillverkar produkter med elektronik och programvara för kommunikation och automation."


def test_verbatim_quote_is_supported():
    assert quote_support("utvecklar och tillverkar produkter med elektronik och programvara", SRC) == 1.0


def test_paraphrase_is_not_supported():
    assert quote_support("Techinova builds software for banks and insurance companies worldwide", SRC) < 0.8


def test_verifier_downgrades_unsupported_fact():
    claims = [
        {"status": "fact", "statement": "ok", "reasoning": "", "evidence": [{"quote": "produkter med elektronik och programvara för kommunikation", "url": "u", "retrieved_at": "t"}]},
        {"status": "fact", "statement": "bad", "reasoning": "", "evidence": [{"quote": "a quote that does not exist anywhere in the source", "url": "u", "retrieved_at": "t"}]},
    ]
    out, stats = verify_claims(claims, {"u": SRC})
    assert out[0]["status"] == "fact" and out[0]["evidence"][0]["verified"]
    assert out[1]["status"] == "inferred"
    assert stats == {"facts_checked": 2, "facts_verified": 1, "downgraded": 1, "inferred": 0}


def _profile():
    return {"claims": [{"id": "a", "section": "offerings", "statement": "Makes sensors", "status": "fact", "evidence": [], "reasoning": "", "origin": "agent", "review": "unreviewed", "note": ""}]}


def test_edit_add_and_reject():
    p, _ = apply_edit(_profile(), "add", None, {"statement": "Testing opportunities are a priority", "section": "priorities"})
    added = p["claims"][-1]
    assert added["origin"] == "user" and added["status"] == "company_confirmed"
    p, _ = apply_edit(p, "reject", "a", {})
    assert p["claims"][0]["review"] == "rejected"


def test_watcher_keeps_user_decisions():
    old, _ = apply_edit(_profile(), "add", None, {"statement": "Priority: pilots", "section": "priorities"})
    old, _ = apply_edit(old, "reject", "a", {})
    merged = carry_over_user_decisions(old, _profile())
    assert any(c["statement"] == "Priority: pilots" for c in merged["claims"])
    assert merged["claims"][0]["review"] == "rejected"
