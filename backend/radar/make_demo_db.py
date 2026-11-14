"""Build the data for the online demo: a cleaned copy of the database plus the logos.

    python -m radar.make_demo_db

Writes backend/deploy/radar-demo.db and backend/deploy/logos/. The copy keeps the
public data Radar shows (members, profiles, opportunities, matches, explanations,
cached translations and embeddings) and removes everything personal or private:
sign-ins, memberships, chats, feedback, alerts, emails, ratings, tips, audit log
and usage logs. Editor names in profile history are replaced by a neutral label.
The result is checked for email addresses before it is written."""
from __future__ import annotations

import json
import re
import shutil
import sqlite3
import sys
from pathlib import Path

from .config import DATA, DB_PATH

OUT_DIR = Path(__file__).resolve().parents[1] / "deploy"
OUT_DB = OUT_DIR / "radar-demo.db"
PRIVATE = ["users", "memberships", "profile_audit", "chat_log", "feedback", "subscriptions", "outbox",
           "alerts_sent", "relevance_ratings", "park_tips", "llm_usage", "scheduler_lock", "runs"]
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}")


def _neutral_names(profile_json: str) -> str:
    p = json.loads(profile_json)
    for c in p.get("claims", []):
        if c.get("updated_by"):
            c["updated_by"] = "company representative"
        note = c.get("note") or ""
        if " — " in note:  # "Added (priorities): … — Name"
            c["note"] = note.rsplit(" — ", 1)[0]
    return json.dumps(p, ensure_ascii=False)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp = OUT_DIR / "radar-demo.tmp.db"
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(tmp)
    with dst:
        src.backup(dst)
    src.close()

    tables = {r[0] for r in dst.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for t in PRIVATE:
        if t in tables:
            dst.execute(f'DELETE FROM "{t}"')
    for table, col, key in (("companies", "profile", "slug"), ("profile_versions", "profile", "rowid")):
        for k, prof in dst.execute(f'SELECT {key}, {col} FROM {table} WHERE {col} IS NOT NULL').fetchall():
            dst.execute(f"UPDATE {table} SET {col}=? WHERE {key}=?", (_neutral_names(prof), k))
    dst.execute("UPDATE profile_versions SET note='Updated by the company' WHERE author='user'")
    dst.commit()
    dst.execute("VACUUM")

    # Nothing personal may remain: no email addresses outside public organisation pages.
    allowed = re.compile(r"@(vinnova\.se|ec\.europa\.eu|bluesciencepark\.se|mtcos\.se|bth\.se|almi\.se|ivl\.se|"
                         r"ai\.se|netport\.se|sisp\.se|regionblekinge\.se|ri\.se|uu\.se|kth\.se|chalmers\.se|"
                         r"example\.com|[a-z0-9-]+\.(se|com|eu|org|net|io|no|dk|fi))$", re.I)
    personal = re.compile(r"@(gmail|googlemail|outlook|hotmail|live|icloud|yahoo|proton(mail)?)\.", re.I)
    found = set()
    for (t,) in dst.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
        for row in dst.execute(f'SELECT * FROM "{t}"'):
            for v in row:
                if isinstance(v, str):
                    for m in EMAIL.findall(v):
                        if personal.search(m) or not allowed.search(m):
                            found.add((t, m))
    dst.close()
    if found:
        tmp.unlink()
        sys.exit(f"Stopped: personal email addresses found: {sorted(found)[:10]}")
    tmp.replace(OUT_DB)

    logos_out = OUT_DIR / "logos"
    if logos_out.exists():
        shutil.rmtree(logos_out)
    if (DATA / "logos").exists():
        shutil.copytree(DATA / "logos", logos_out)
    print(f"Wrote {OUT_DB} ({OUT_DB.stat().st_size // 1024} KB) and {len(list(logos_out.glob('*')))} logos")


if __name__ == "__main__":
    main()
