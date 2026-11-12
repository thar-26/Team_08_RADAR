"""Copy everything from the local SQLite database into Postgres.

    1. Put DATABASE_URL=postgresql://... in .env (e.g. a free Neon database)
    2. python -m radar.migrate
    3. The script prints row counts for both databases; they must match.

Safe to run twice: rows that already exist are skipped."""
from __future__ import annotations

import sqlite3
import sys

from . import auth, db
from .agents import notifier
from .collectors import bolagsverket
from .config import DB_PATH

SERIAL_TABLES = {"chat_log": "id", "runs": "id", "outbox": "id"}


def main() -> None:
    if not db.is_postgres():
        sys.exit("DATABASE_URL is not set to a postgresql:// URL in .env")
    if not DB_PATH.exists():
        sys.exit(f"No SQLite database at {DB_PATH}")

    # 1. Create every table in Postgres (same schemas the app uses).
    db.init()
    notifier.init()
    auth.init()
    with db.session() as c:
        c.executescript(bolagsverket.SCHEMA)

    # 2. Copy rows table by table.
    src = sqlite3.connect(DB_PATH)
    src.row_factory = sqlite3.Row
    tables = [r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    report = []
    for table in tables:
        rows = [dict(r) for r in src.execute(f"SELECT * FROM {table}")]
        if rows:
            cols = list(rows[0])
            sql = (f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('%s' for _ in cols)}) "
                   "ON CONFLICT DO NOTHING")
            with db.session() as c:
                cur = c.conn.cursor()
                for start in range(0, len(rows), 500):
                    cur.executemany(sql, [tuple(r[k] for k in cols) for r in rows[start:start + 500]])
        # Keep auto-numbered ids continuing after the copied ones.
        if table in SERIAL_TABLES:
            with db.session() as c:
                c.conn.execute(
                    f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"
                )
        target = db.one(f"SELECT COUNT(*) AS n FROM {table}")["n"]
        report.append((table, len(rows), target))

    print(f"{'table':<20}{'sqlite':>10}{'postgres':>10}")
    ok = True
    for table, a, b in report:
        flag = "" if b >= a else "  <-- missing rows"
        ok = ok and b >= a
        print(f"{table:<20}{a:>10}{b:>10}{flag}")
    print("\nAll rows copied." if ok else "\nSome rows are missing; see above.")


if __name__ == "__main__":
    main()
