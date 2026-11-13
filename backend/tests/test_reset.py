"""reset_demo: a saved snapshot comes back; evidence tables are kept."""
from radar import db, reset_demo


def test_snapshot_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(reset_demo, "SNAPSHOT", tmp_path / "snap.db")
    db.init()
    db.execute("DELETE FROM feedback")
    db.execute("INSERT INTO feedback (company_slug, opp_id, value, created_at) VALUES ('a','o1','up','t')")
    reset_demo.save()
    db.execute("INSERT INTO feedback (company_slug, opp_id, value, created_at) VALUES ('a','o2','down','t')")
    db.execute("INSERT INTO relevance_ratings (company_slug, opp_id, rater, rating) VALUES ('a','o1','team','relevant')")
    reset_demo.restore()
    assert [r["opp_id"] for r in db.rows("SELECT opp_id FROM feedback")] == ["o1"]
    assert db.one("SELECT rating FROM relevance_ratings WHERE rater='team'")["rating"] == "relevant"
