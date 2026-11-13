"""Storage: SQLite locally, Postgres when DATABASE_URL is set in .env.

All modules use the same small API (rows / one / execute / upsert / session),
written in SQLite's dialect; for Postgres the queries are adapted here:
'?' placeholders become '%s', AUTOINCREMENT becomes SERIAL, PRAGMAs are skipped."""
from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from .config import DB_PATH

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
_pool = None


def is_postgres() -> bool:
    return DATABASE_URL.startswith(("postgres://", "postgresql://"))


def _pg_sql(sql: str, has_params: bool) -> str:
    if has_params:
        sql = sql.replace("%", "%%").replace("?", "%s")
    return sql


def _pg_ddl(stmt: str) -> str:
    stmt = re.sub(r"INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY", stmt, flags=re.I)
    return re.sub(r"\bREAL\b", "DOUBLE PRECISION", stmt)


class _PgConn:
    """Gives a Postgres connection the sqlite3 methods the code base uses."""

    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql: str, params: tuple | list = ()):
        from psycopg.rows import dict_row

        cur = self.conn.cursor(row_factory=dict_row)
        cur.execute(_pg_sql(sql, bool(params)), tuple(params) if params else None)
        return cur

    def executescript(self, script: str) -> None:
        for stmt in script.split(";"):
            lines = [l for l in stmt.splitlines() if not l.strip().startswith("--")]
            body = " ".join(lines).strip()
            if body and not body.upper().startswith("PRAGMA"):
                self.conn.execute(_pg_ddl(body))

    def commit(self) -> None:
        self.conn.commit()

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
CREATE TABLE IF NOT EXISTS llm_usage (       -- tokens and time per model call (cost evidence; no prices stored)
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT, model TEXT, purpose TEXT, cached INTEGER,
    prompt_tokens INTEGER, completion_tokens INTEGER, ms INTEGER
);
CREATE TABLE IF NOT EXISTS relevance_ratings (  -- team ratings of the top 10, for the hit rate
    company_slug TEXT, opp_id TEXT, rater TEXT, rating TEXT, fit REAL, rank INTEGER, at TEXT,
    PRIMARY KEY (company_slug, opp_id, rater)
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step TEXT,
    status TEXT,
    detail TEXT,
    created_at TEXT
);
"""


def _pg_pool():
    global _pool
    if _pool is None:
        from psycopg_pool import ConnectionPool

        _pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=8, kwargs={"autocommit": False}, open=True)
    return _pool


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def session() -> Iterator[Any]:
    if is_postgres():
        with _pg_pool().connection() as raw:
            conn = _PgConn(raw)
            yield conn
            conn.commit()
        return
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
        if is_postgres():
            cols = {r["column_name"] for r in c.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name=?", ("opportunities",)).fetchall()}
        else:
            cols = {r[1] for r in c.execute("PRAGMA table_info(opportunities)").fetchall()}
        if "title_sv" not in cols:
            c.execute("ALTER TABLE opportunities ADD COLUMN title_sv TEXT")
        if "contacts" not in cols:
            c.execute("ALTER TABLE opportunities ADD COLUMN contacts TEXT")
        if is_postgres():
            chat_cols = {r["column_name"] for r in c.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name=?", ("chat_log",)).fetchall()}
        else:
            chat_cols = {r[1] for r in c.execute("PRAGMA table_info(chat_log)").fetchall()}
        if "owner" not in chat_cols:  # conversations belong to one visitor or member, never the whole company
            c.execute("ALTER TABLE chat_log ADD COLUMN owner TEXT")


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
