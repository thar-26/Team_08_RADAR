"""Reset Radar to a known state between demo rehearsals.

    python -m radar.reset_demo --save      # store the current state as the demo snapshot
    python -m radar.reset_demo             # go back to the snapshot (asks first)
    python -m radar.reset_demo --yes       # same, without asking

The snapshot is a copy of the SQLite database (data/demo_snapshot.db), made
with SQLite's online backup, so it is safe while the API is running. Restoring
copies the tables back row by row inside one transaction through ATTACH, so the
running API keeps its connection and simply sees the old state.

Kept as they are (not rolled back): caches (model answers, embeddings,
translations), measured model usage and the team's relevance ratings, so a
reset never throws away evidence or makes the next page load slow."""
from __future__ import annotations

import argparse
import sqlite3
import sys

from . import db
from .config import DATA, DB_PATH

SNAPSHOT = DATA / "demo_snapshot.db"
KEEP = {"llm_cache", "embeddings", "llm_usage", "relevance_ratings", "sqlite_sequence"}


def save() -> None:
    db.init()
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(SNAPSHOT)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()
    print(f"Snapshot saved: {SNAPSHOT}")


def restore() -> dict[str, int]:
    if not SNAPSHOT.exists():
        sys.exit("No snapshot yet. Run: python -m radar.reset_demo --save")
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.execute("ATTACH DATABASE ? AS snap", (str(SNAPSHOT),))
    snap_tables = {r[0] for r in con.execute("SELECT name FROM snap.sqlite_master WHERE type='table'")}
    live_tables = {r[0] for r in con.execute("SELECT name FROM main.sqlite_master WHERE type='table'")}
    counts: dict[str, int] = {}
    try:
        con.execute("BEGIN IMMEDIATE")
        for t in sorted(live_tables - KEEP):
            con.execute(f'DELETE FROM main."{t}"')  # tables created after the snapshot start empty
            if t not in snap_tables:
                counts[t] = 0
                continue
            live_cols = [r[1] for r in con.execute(f'PRAGMA main.table_info("{t}")')]
            snap_cols = {r[1] for r in con.execute(f'PRAGMA snap.table_info("{t}")')}
            cols = ", ".join(f'"{c}"' for c in live_cols if c in snap_cols)
            con.execute(f'INSERT INTO main."{t}" ({cols}) SELECT {cols} FROM snap."{t}"')
            counts[t] = con.execute(f'SELECT COUNT(*) FROM main."{t}"').fetchone()[0]
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        con.execute("DETACH DATABASE snap")
        con.close()
    try:  # forget ranked lists computed from the state we just left
        from .agents import matcher

        matcher._CACHE.clear()
    except Exception:  # noqa: BLE001
        pass
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--save", action="store_true", help="store the current state as the demo snapshot")
    ap.add_argument("--yes", action="store_true", help="restore without asking")
    a = ap.parse_args()
    if db.is_postgres():
        sys.exit("reset_demo works on the local SQLite database only (DATABASE_URL is set).")
    if a.save:
        save()
        return
    if not a.yes and input("Restore the demo snapshot? Feedback, chats, edits and alerts since then are lost. [y/N] ").lower() != "y":
        print("Cancelled.")
        return
    counts = restore()
    print("Restored:", ", ".join(f"{t} {n}" for t, n in counts.items() if n))


if __name__ == "__main__":
    main()
