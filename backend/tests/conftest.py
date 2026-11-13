"""Tests run against a throw-away database, never the real data/radar.db.

RADAR_DB is set before any radar module is imported, so radar.config picks it up."""
import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="radar-tests-"))
os.environ["RADAR_DB"] = str(_tmp / "test.db")
os.environ.setdefault("AUTH_SECRET", "test-secret")

from radar import db  # noqa: E402

db.init()
