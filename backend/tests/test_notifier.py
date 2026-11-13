"""Weekly digest: timing, duplicate protection and the rehearsal allowlist."""
from datetime import datetime, timedelta, timezone

from radar import db
from radar.agents import notifier


def test_due_respects_frequency():
    now = datetime(2026, 11, 13, 12, tzinfo=timezone.utc)
    weekly = {"frequency": "weekly", "last_digest_at": (now - timedelta(days=3)).isoformat()}
    assert not notifier.due(weekly, now)
    weekly["last_digest_at"] = (now - timedelta(days=7, minutes=1)).isoformat()
    assert notifier.due(weekly, now)
    assert notifier.due({"frequency": "weekly", "last_digest_at": None}, now)
    instant = {"frequency": "instant", "last_digest_at": (now - timedelta(hours=2)).isoformat()}
    assert not notifier.due(instant, now)


def test_lock_stops_a_second_sender():
    notifier.init()
    db.execute("DELETE FROM scheduler_lock")
    assert notifier._acquire()
    other = notifier._holder
    notifier._holder = "another-process"
    try:
        assert not notifier._acquire(), "a second process must not get the lock while it is held"
    finally:
        notifier._holder = other
    notifier._release()
    assert notifier._acquire()  # free again after release
    notifier._release()


def test_allowlist_blocks_real_users(monkeypatch):
    monkeypatch.setenv("RADAR_MAIL_ALLOWLIST", "team@example.com, Lead@Example.com")
    assert notifier.allowed_recipient("lead@example.com")
    assert not notifier.allowed_recipient("someone@realcompany.se")
    monkeypatch.delenv("RADAR_MAIL_ALLOWLIST")
    assert notifier.allowed_recipient("someone@realcompany.se")
