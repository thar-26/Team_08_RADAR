"""Notifier agent: emails a member when Radar finds a new match.

- Opt-in only: a company representative subscribes with an email address and
  explicit consent; every email has an unsubscribe link.
- An alert is sent once per opportunity ("new match"), plus a reminder when a
  SAVED opportunity's deadline is close.
- Frequency: "instant" (an email when something new matches) or "weekly"
  (one digest a week). A scheduler thread sends them while the API runs, if
  RADAR_SCHEDULER=1; a database lock stops two processes sending the same digest.
- Emails are always written to an outbox that can be previewed in Radar. They
  are only really sent when SMTP settings exist in .env; otherwise they are
  labelled as previews (simulated sending). If RADAR_MAIL_ALLOWLIST is set,
  only those addresses get real email (safe rehearsals: no test mail to real users)."""
from __future__ import annotations

import html
import json
import os
import re
import secrets
import smtplib
import ssl
import threading
import time
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage

from .. import db
from ..config import now_iso, today
from ..translate import translate
from . import matcher

APP_URL = os.getenv("RADAR_APP_URL", "http://localhost:3000")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)
SCHEMA = """
CREATE TABLE IF NOT EXISTS subscriptions (
    company_slug TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    kinds TEXT,              -- JSON list: funding/event/testbed
    min_relevance TEXT,      -- strong | possible
    lang TEXT,               -- sv | en
    token TEXT,              -- unsubscribe token
    consent_at TEXT,
    active INTEGER DEFAULT 1,
    frequency TEXT DEFAULT 'instant',  -- instant | weekly
    last_digest_at TEXT
);
CREATE TABLE IF NOT EXISTS scheduler_lock (
    name TEXT PRIMARY KEY, holder TEXT, until TEXT, last_run TEXT
);
CREATE TABLE IF NOT EXISTS alerts_sent (
    company_slug TEXT, opp_id TEXT, kind TEXT, created_at TEXT,
    PRIMARY KEY (company_slug, opp_id, kind)
);
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_slug TEXT, email TEXT, subject TEXT, html TEXT, text TEXT,
    items INTEGER, status TEXT, detail TEXT, created_at TEXT
);
"""

T = {
    "en": {
        "subject_new": "Radar: {n} new match{es} for {company}",
        "subject_welcome": "Radar: your current top matches, {company}",
        "subject_digest": "Radar weekly: {n} new match{es} for {company}",
        "intro_digest": "Your weekly summary: {n} new opportunit{ies} that may fit {company} since the last digest.",
        "fit": "Fit",
        "intro_new": "Radar found {n} new opportunit{ies} that may fit {company}.",
        "intro_welcome": "You are now subscribed. Here are {company}'s current top matches. From now on we only email you when something new matches.",
        "deadline": "Deadline", "date": "Date", "ongoing": "No deadline stated", "why": "Why it may fit",
        "next": "Next step", "open": "Open in Radar", "source": "Source",
        "reminder_head": "Deadlines coming up for opportunities you saved",
        "days": "{d} days left",
        "footer": "Possible matches based on public information — not eligibility decisions. You get this because {email} subscribed for {company} in Radar.",
        "unsubscribe": "Unsubscribe",
        "kinds": {"funding": "Funding", "event": "Event", "testbed": "Testbed"},
    },
    "sv": {
        "subject_new": "Radar: {n} ny{a} matchning{ar} för {company}",
        "subject_welcome": "Radar: era bästa matchningar just nu, {company}",
        "subject_digest": "Radar veckovis: {n} ny{a} matchning{ar} för {company}",
        "intro_digest": "Er veckosammanfattning: {n} ny{a} möjlighet{er} som kan passa {company} sedan förra sammanfattningen.",
        "fit": "Matchning",
        "intro_new": "Radar har hittat {n} ny{a} möjlighet{er} som kan passa {company}.",
        "intro_welcome": "Du prenumererar nu. Här är {company}s bästa matchningar just nu. Framöver mejlar vi bara när något nytt matchar.",
        "deadline": "Sista ansökningsdag", "date": "Datum", "ongoing": "Ingen tidsgräns angiven", "why": "Varför det kan passa",
        "next": "Nästa steg", "open": "Öppna i Radar", "source": "Källa",
        "reminder_head": "Snart sista dag för möjligheter ni har sparat",
        "days": "{d} dagar kvar",
        "footer": "Möjliga matchningar baserade på offentlig information — inga beslut om behörighet. Du får detta eftersom {email} prenumererar för {company} i Radar.",
        "unsubscribe": "Avsluta prenumeration",
        "kinds": {"funding": "Finansiering", "event": "Evenemang", "testbed": "Testbädd"},
    },
}


def init() -> None:
    with db.session() as c:
        c.executescript(SCHEMA)
    for col, ddl in (("frequency", "TEXT DEFAULT 'instant'"), ("last_digest_at", "TEXT")):
        try:  # subscriptions created by earlier versions
            db.execute(f"ALTER TABLE subscriptions ADD COLUMN {col} {ddl}")
        except Exception:  # noqa: BLE001 - column already exists
            pass


def allowed_recipient(email: str) -> bool:
    allow = [a.strip().lower() for a in os.getenv("RADAR_MAIL_ALLOWLIST", "").split(",") if a.strip()]
    return not allow or email.strip().lower() in allow


def smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USER") and os.getenv("SMTP_PASSWORD"))


def subscribe(slug: str, email: str, kinds: list[str], min_relevance: str, lang: str, frequency: str = "instant") -> dict:
    email = email.strip()
    if not EMAIL_RE.match(email):
        raise ValueError("Please enter a valid email address")
    kinds = [k for k in kinds if k in ("funding", "event", "testbed")] or ["funding", "event", "testbed"]
    min_relevance = min_relevance if min_relevance in ("strong", "possible") else "possible"
    lang = lang if lang in ("sv", "en") else "sv"
    frequency = frequency if frequency in ("instant", "weekly") else "instant"
    existing = db.one("SELECT token FROM subscriptions WHERE company_slug=?", (slug,))
    db.upsert("subscriptions", {
        "company_slug": slug, "email": email, "kinds": json.dumps(kinds), "min_relevance": min_relevance, "lang": lang,
        "token": existing["token"] if existing else secrets.token_urlsafe(16), "consent_at": now_iso(), "active": 1,
        "frequency": frequency,
    }, ["company_slug"])
    return run(slug, welcome=not existing)


def unsubscribe(token: str) -> bool:
    row = db.one("SELECT company_slug FROM subscriptions WHERE token=?", (token,))
    if not row:
        return False
    db.execute("UPDATE subscriptions SET active=0 WHERE token=?", (token,))
    return True


def _candidates(slug: str, sub: dict) -> list[dict]:
    kinds = json.loads(sub["kinds"])
    allowed = {"strong"} if sub["min_relevance"] == "strong" else {"strong", "possible"}
    stored = {m["opp_id"]: db.loads(m["explanation"], {}) for m in db.rows("SELECT * FROM matches WHERE company_slug=?", (slug,))}
    downs = {f["opp_id"] for f in db.rows("SELECT opp_id FROM feedback WHERE company_slug=? AND value='down'", (slug,))}
    out = []
    per_kind = {k: 0 for k in kinds}
    for r in matcher.rank(slug):
        k = r["kind"]
        if k not in kinds or r["opp_id"] in downs or per_kind[k] >= 6:
            continue
        per_kind[k] += 1
        exp = stored.get(r["opp_id"])
        if not exp or exp.get("error"):
            try:
                exp = matcher.explain(slug, r["opp_id"])
            except RuntimeError:
                continue
        fit, level = matcher.final_score(r, exp)  # the same 1-10 score the page shows
        if level in allowed:
            out.append({"opp": db.one("SELECT * FROM opportunities WHERE id=?", (r["opp_id"],)), "exp": exp, "score": fit, "level": level})
    return out


def _reminders(slug: str) -> list[dict]:
    out = []
    for f in db.rows("SELECT opp_id FROM feedback WHERE company_slug=? AND value='saved'", (slug,)):
        o = db.one("SELECT * FROM opportunities WHERE id=?", (f["opp_id"],))
        if not o or not o.get("deadline"):
            continue
        days = (date.fromisoformat(o["deadline"][:10]) - today()).days
        if 0 <= days <= 14 and not db.one(
            "SELECT 1 FROM alerts_sent WHERE company_slug=? AND opp_id=? AND kind='deadline'", (slug, o["id"])
        ):
            out.append({"opp": o, "days": days})
    return out


def run(slug: str, *, welcome: bool = False, digest: bool = False) -> dict:
    """Check one subscriber for new matches/reminders; write (and maybe send) an email.
    digest=True writes the weekly summary (all new matches since the last one)."""
    init()
    sub = db.one("SELECT * FROM subscriptions WHERE company_slug=? AND active=1", (slug,))
    if not sub:
        return {"subscribed": False, "new": 0}
    company = db.one("SELECT name FROM companies WHERE slug=?", (slug,))["name"]
    cands = _candidates(slug, sub)
    sent = {r["opp_id"] for r in db.rows("SELECT opp_id FROM alerts_sent WHERE company_slug=? AND kind='match'", (slug,))}
    new = cands[:6] if welcome else [c for c in cands if c["opp"]["id"] not in sent][: 8 if digest else 6]
    reminders = _reminders(slug)
    if digest:
        db.execute("UPDATE subscriptions SET last_digest_at=? WHERE company_slug=?", (now_iso(), slug))
    if not new and not reminders:
        return {"subscribed": True, "new": 0, "reminders": 0, "message": "No new matches since the last alert."}

    email = compose(slug, company, sub, new, reminders, welcome=welcome, digest=digest)
    status, detail = "preview", "SMTP not configured — shown in Radar only (simulated sending)."
    if smtp_configured() and not allowed_recipient(sub["email"]):
        detail = "Not sent: the address is not on RADAR_MAIL_ALLOWLIST (rehearsal safety). Preview only."
    elif smtp_configured():
        try:
            _send(sub["email"], email["subject"], email["html"], email["text"])
            status, detail = "sent", f"Sent via {os.getenv('SMTP_HOST')}"
        except (smtplib.SMTPException, OSError) as e:
            status, detail = "failed", f"{type(e).__name__}: {e}"[:300]
    db.execute(
        "INSERT INTO outbox (company_slug, email, subject, html, text, items, status, detail, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        (slug, sub["email"], email["subject"], email["html"], email["text"], len(new) + len(reminders), status, detail, now_iso()),
    )
    # After a welcome digest, everything currently matching counts as known, so the
    # next alert only contains genuinely new matches.
    for c in (cands if welcome else new):
        db.upsert("alerts_sent", {"company_slug": slug, "opp_id": c["opp"]["id"], "kind": "match", "created_at": now_iso()}, ["company_slug", "opp_id", "kind"])
    for r in reminders:
        db.upsert("alerts_sent", {"company_slug": slug, "opp_id": r["opp"]["id"], "kind": "deadline", "created_at": now_iso()}, ["company_slug", "opp_id", "kind"])
    db.log(f"notify:{slug}", status, f"{len(new)} matches, {len(reminders)} reminders")
    return {"subscribed": True, "new": len(new), "reminders": len(reminders), "status": status, "detail": detail}


def run_all() -> int:
    init()
    n = 0
    for s in db.rows("SELECT company_slug FROM subscriptions WHERE active=1"):
        n += run(s["company_slug"]).get("new", 0)
    return n


def _title(o: dict, lang: str) -> str:
    return (o.get("title_sv") or o["title"]) if lang == "sv" else o["title"]


def compose(slug: str, company: str, sub: dict, new: list[dict], reminders: list[dict], *, welcome: bool, digest: bool = False) -> dict:
    lang = sub["lang"]
    t = T[lang]
    n = len(new)
    if lang == "sv":
        plural = {"a": "a" if n != 1 else "", "ar": "ar" if n != 1 else "", "er": "er" if n != 1 else ""}
    else:
        plural = {"es": "es" if n != 1 else "", "ies": "ies" if n != 1 else "y"}
    mode = "welcome" if welcome else "digest" if digest else "new"
    subject = t[f"subject_{mode}"].format(n=n, company=company, **plural)
    intro = t[f"intro_{mode}"].format(n=n, company=company, **plural)

    # Localise agent text for Swedish subscribers.
    whys = [c["exp"].get("why", "") for c in new]
    steps = [c["exp"].get("next_step", "") for c in new]
    if lang == "sv":
        whys, steps = translate(whys, "sv"), translate(steps, "sv")

    blue, ink, muted, navy = "#0068B3", "#1B1C38", "#5B5E7A", "#1B1C38"
    link = f"{APP_URL}/c/{slug}"
    unsub = f"{APP_URL}/c/{slug}?unsubscribe={sub['token']}"
    rows_html, rows_text = [], []
    for c, why, step in zip(new, whys, steps):
        o = c["opp"]
        d = o.get("deadline") or o.get("event_date")
        when = f"{t['deadline'] if o.get('deadline') else t['date']}: {d}" if d else t["ongoing"]
        kind = t["kinds"].get(o["kind"], o["kind"])
        rows_html.append(f"""
<tr><td style="padding:18px 0;border-bottom:1px solid #E3E8F2">
  <div style="font:600 11px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:{blue}">{html.escape(kind)} · {html.escape(when)} · {t['fit']} {c['score']:.1f}/10</div>
  <a href="{html.escape(o['url'])}" style="display:block;margin-top:6px;font:600 17px Arial,sans-serif;color:{ink};text-decoration:none">{html.escape(_title(o, lang))}</a>
  <p style="margin:8px 0 0;font:14px/1.5 Arial,sans-serif;color:{ink}"><b>{t['why']}:</b> {html.escape(why)}</p>
  <p style="margin:6px 0 0;font:14px/1.5 Arial,sans-serif;color:{ink}"><b>{t['next']}:</b> {html.escape(step)}</p>
  <p style="margin:6px 0 0;font:12px Arial,sans-serif;color:{muted}">{t['source']}: <a href="{html.escape(o['url'])}" style="color:{blue}">{html.escape(o['url'][:80])}</a></p>
</td></tr>""")
        rows_text.append(f"- [{kind}] {_title(o, lang)} ({when}, {t['fit']} {c['score']:.1f}/10)\n  {t['why']}: {why}\n  {t['next']}: {step}\n  {o['url']}")
    rem_html, rem_text = "", ""
    if reminders:
        items = "".join(
            f'<li style="margin:4px 0"><a href="{html.escape(r["opp"]["url"])}" style="color:{blue}">{html.escape(_title(r["opp"], lang))}</a> — {t["days"].format(d=r["days"])}</li>'
            for r in reminders
        )
        rem_html = f'<h3 style="font:600 15px Arial,sans-serif;color:{ink};margin:24px 0 6px">{t["reminder_head"]}</h3><ul style="font:14px Arial,sans-serif;color:{ink};padding-left:18px">{items}</ul>'
        rem_text = "\n\n" + t["reminder_head"] + "\n" + "\n".join(f"- {_title(r['opp'], lang)} — {t['days'].format(d=r['days'])}" for r in reminders)
    footer = t["footer"].format(email=sub["email"], company=company)
    body = f"""<!doctype html><html><body style="margin:0;background:#F1F2F5">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F2F5;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff">
<tr><td style="background-color:{navy};border-bottom:4px solid #00A3E2;padding:22px 28px;color:#fff;font:700 20px Arial,sans-serif">Radar
  <div style="font:13px Arial,sans-serif;opacity:.85;margin-top:4px">{html.escape(company)}</div></td></tr>
<tr><td style="padding:24px 28px">
  <p style="font:15px/1.5 Arial,sans-serif;color:{ink};margin:0 0 6px">{html.escape(intro)}</p>
  <table width="100%" cellpadding="0" cellspacing="0">{''.join(rows_html)}</table>
  {rem_html}
  <p style="margin:24px 0 0"><a href="{link}" style="background:#00A3E2;color:#fff;padding:11px 18px;font:600 14px Arial,sans-serif;text-decoration:none">{t['open']}</a></p>
  <p style="font:12px/1.5 Arial,sans-serif;color:{muted};margin:28px 0 0">{html.escape(footer)} <a href="{unsub}" style="color:{muted}">{t['unsubscribe']}</a></p>
</td></tr></table></td></tr></table></body></html>"""
    text = f"{intro}\n\n" + "\n\n".join(rows_text) + rem_text + f"\n\n{t['open']}: {link}\n\n{footer}\n{t['unsubscribe']}: {unsub}\n"
    return {"subject": subject, "html": body, "text": text}


def _send(to: str, subject: str, html_body: str, text_body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.getenv("ALERT_FROM", os.getenv("SMTP_USER", ""))
    msg["To"] = to
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    host, port = os.getenv("SMTP_HOST", ""), int(os.getenv("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=20) as s:
        s.starttls(context=ssl.create_default_context())
        # App passwords are shown with spaces ("abcd efgh ..."); they are not part of it.
        s.login(os.getenv("SMTP_USER", "").strip(), os.getenv("SMTP_PASSWORD", "").replace(" ", ""))
        s.send_message(msg)


# ---------------------------------------------------------------- scheduler
LOCK = "notifier"
INSTANT_EVERY = timedelta(hours=6)
WEEK = timedelta(days=7)
_holder = f"{os.getpid()}-{secrets.token_hex(3)}"
_thread: threading.Thread | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _acquire(minutes: int = 20) -> bool:
    """A lease in the database: only one process (or thread) sends at a time."""
    now = _now()
    db.execute("INSERT INTO scheduler_lock (name, holder, until, last_run) SELECT ?, '', '', '' "
               "WHERE NOT EXISTS (SELECT 1 FROM scheduler_lock WHERE name=?)", (LOCK, LOCK))
    db.execute("UPDATE scheduler_lock SET holder=?, until=? WHERE name=? AND (until='' OR until<? OR holder=?)",
               (_holder, (now + timedelta(minutes=minutes)).isoformat(), LOCK, now.isoformat(), _holder))
    row = db.one("SELECT holder FROM scheduler_lock WHERE name=?", (LOCK,))
    return bool(row and row["holder"] == _holder)


def _release() -> None:
    db.execute("UPDATE scheduler_lock SET until='', last_run=? WHERE name=? AND holder=?", (now_iso(), LOCK, _holder))


def due(sub: dict, now: datetime | None = None) -> bool:
    now = now or _now()
    last = sub.get("last_digest_at")
    try:
        last_dt = datetime.fromisoformat(last) if last else None
    except ValueError:
        last_dt = None
    if last_dt and last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=timezone.utc)
    period = WEEK if (sub.get("frequency") or "instant") == "weekly" else INSTANT_EVERY
    return last_dt is None or now - last_dt >= period


def tick() -> dict:
    """One scheduler round: weekly digests that are due, and instant checks."""
    init()
    if not _acquire():
        return {"skipped": "another process holds the lock"}
    done = []
    try:
        for sub in db.rows("SELECT company_slug, frequency, last_digest_at FROM subscriptions WHERE active=1"):
            if due(sub):
                # Both modes record the time, so neither is repeated before its period is over.
                r = run(sub["company_slug"], digest=True) if sub.get("frequency") == "weekly" else run(sub["company_slug"])
                if sub.get("frequency") != "weekly":
                    db.execute("UPDATE subscriptions SET last_digest_at=? WHERE company_slug=?", (now_iso(), sub["company_slug"]))
                done.append({"slug": sub["company_slug"], "new": r.get("new", 0), "status": r.get("status", "")})
    finally:
        _release()
    db.log("notify:scheduler", "ok", json.dumps(done)[:500])
    return {"ran": done}


def scheduler_enabled() -> bool:
    return os.getenv("RADAR_SCHEDULER", "").strip() in ("1", "true", "yes")


def scheduler_status() -> dict:
    init()
    row = db.one("SELECT last_run FROM scheduler_lock WHERE name=?", (LOCK,)) or {}
    return {"active": scheduler_enabled() and _thread is not None and _thread.is_alive(),
            "configured": scheduler_enabled(), "last_run": row.get("last_run") or None,
            "interval_minutes": int(os.getenv("RADAR_SCHEDULER_MINUTES", "60"))}


def start_scheduler() -> bool:
    """Start the background loop (once per process) when RADAR_SCHEDULER=1."""
    global _thread
    if not scheduler_enabled() or (_thread and _thread.is_alive()):
        return False
    every = max(1, int(os.getenv("RADAR_SCHEDULER_MINUTES", "60"))) * 60

    def loop() -> None:
        time.sleep(30)  # let the API finish starting
        while True:
            try:
                tick()
            except Exception as e:  # noqa: BLE001 - keep the loop alive; the error is logged
                db.log("notify:scheduler", "error", repr(e)[:300])
            time.sleep(every)

    _thread = threading.Thread(target=loop, name="radar-notifier", daemon=True)
    _thread.start()
    return True
