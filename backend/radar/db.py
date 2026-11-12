"""SQLite storage. JSON columns keep the schema flexible during the hackathon;
the table layout maps 1:1 to Postgres for production."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS pages (
    url TEXT PRIMARY KEY,
    company_slug TEXT,
    kind TEXT,               -- website | bsp_member | event_listing | event | simulated
    title TEXT,
    text TEXT,
    fetched_at TEXT,
    injection_score REAL,    -- prompt-guard probability for the page text
    simulated INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS companies (
    slug TEXT PRIMARY KEY,
    name TEXT,
    website TEXT,
    bsp_page TEXT,
    linkedin TEXT,
    demo INTEGER DEFAULT 0,
    profile TEXT,            -- current profile JSON
    profile_version INTEGER DEFAULT 0,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS profile_versions (
    slug TEXT,
    version INTEGER,
    profile TEXT,
    author TEXT,             -- agent | user | watcher
    note TEXT,
    created_at TEXT,
    PRIMARY KEY (slug, version)
);
CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    kind TEXT,               -- funding | event
    source TEXT,             -- vinnova | eu | almi | netport | bsp | simulated
    title TEXT,
    summary TEXT,
    eligibility_text TEXT,
    url TEXT,
    apply_url TEXT,
    published TEXT,
    opens TEXT,
    deadline TEXT,
    event_date TEXT,
    location_mode TEXT,      -- online | in_person | hybrid | unknown
    location TEXT,
    audience TEXT,
    budget TEXT,
    programme TEXT,
    text TEXT,               -- full text used for matching
    fetched_at TEXT,
    simulated INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS embeddings (
    key TEXT PRIMARY KEY,    -- e.g. opp:<id>, company:<slug>, member:<slug>
    text_hash TEXT,
    vector TEXT
);
CREATE TABLE IF NOT EXISTS matches (
    company_slug TEXT,
    opp_id TEXT,
    score REAL,
    components TEXT,         -- JSON breakdown of the score
    explanation TEXT,        -- JSON from the matcher agent
    profile_version INTEGER,
    created_at TEXT,
    PRIMARY KEY (company_slug, opp_id)
);
CREATE TABLE IF NOT EXISTS feedback (
    company_slug TEXT,
    opp_id TEXT,
    value TEXT,              -- up | down | saved
    created_at TEXT,
    PRIMARY KEY (company_slug, opp_id, value)
);
CREATE TABLE IF NOT EXISTS connections (
    a TEXT, b TEXT,
    score REAL,
    basis TEXT,              -- JSON from the connector agent
    created_at TEXT,
    PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS chat_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_slug TEXT,
    role TEXT,
    content TEXT,
    verdict TEXT,
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS llm_cache (
    key TEXT PRIMARY KEY,
    response TEXT,
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step TEXT,
    status TEXT,
    detail TEXT,
    created_at TEXT
);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def session() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with session() as c:
        c.executescript(SCHEMA)
        # Lightweight migrations for databases created by earlier versions.
        cols = {r[1] for r in c.execute("PRAGMA table_info(opportunities)").fetchall()}
        if "title_sv" not in cols:
            c.execute("ALTER TABLE opportunities ADD COLUMN title_sv TEXT")


def rows(sql: str, params: tuple | list = ()) -> list[dict[str, Any]]:
    with session() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def one(sql: str, params: tuple | list = ()) -> dict[str, Any] | None:
    r = rows(sql, params)
    return r[0] if r else None


def execute(sql: str, params: tuple | list = ()) -> None:
    with session() as c:
        c.execute(sql, params)


def upsert(table: str, data: dict[str, Any], key: list[str]) -> None:
    cols = list(data)
    vals = [json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v for v in data.values()]
    updates = ", ".join(f"{c}=excluded.{c}" for c in cols if c not in key)
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)}) "
        f"ON CONFLICT({', '.join(key)}) DO " + (f"UPDATE SET {updates}" if updates else "NOTHING")
    )
    execute(sql, vals)


def log(step: str, status: str, detail: str = "") -> None:
    from .config import now_iso

    execute("INSERT INTO runs (step, status, detail, created_at) VALUES (?,?,?,?)", (step, status, detail[:2000], now_iso()))


def loads(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default
