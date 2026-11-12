"""Radar HTTP API (FastAPI).

Run:  uvicorn radar.api:app --reload --port 8000   (from backend/)"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from . import db
from .agents import concierge, connector, matcher, notifier, profiler
from .api_support import apply_edit
from .config import DATA, DEMO_COMPANIES, now_iso, today
from .translate import Collector

app = FastAPI(title="Radar API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
db.init()

SOURCE_INFO = {
    "vinnova": {"name": "Vinnova open data API", "url": "https://data.vinnova.se/api/"},
    "eu": {"name": "EU Funding & Tenders Portal", "url": "https://ec.europa.eu/info/funding-tenders/opportunities/portal/"},
    "bsp": {"name": "Blue Science Park events", "url": "https://www.bluesciencepark.se/event/"},
    "techconceptlab": {"name": "Tech Concept Lab events", "url": "https://techconceptlab.com/"},
    "almi": {"name": "Almi Blekinge events", "url": "https://www.almi.se/blekinge/evenemang/"},
    "netport": {"name": "NetPort events", "url": "https://www.netport.se/evenemang/"},
    "mtc": {"name": "Marine Technology Center of Sweden – testbeds", "url": "https://www.mtcos.se/"},
}


def _company(slug: str) -> dict:
    c = db.one("SELECT * FROM companies WHERE slug=?", (slug,))
    if not c:
        raise HTTPException(404, "Unknown company")
    c["profile"] = db.loads(c["profile"])
    return c


def _opp_public(o: dict) -> dict:
    o = dict(o)
    o.pop("text", None)
    o["source_name"] = SOURCE_INFO.get(o["source"], {}).get("name", o["source"])
    o["simulated"] = bool(o.get("simulated"))
    o["contacts"] = db.loads(o.get("contacts"), []) or []
    o["contact_links"] = CONTACT_LINKS.get(o["source"], [])
    return o


# Where to ask a person, per source. Only official, public routes; email
# addresses that a site hides from scripts (e.g. MTC) are not extracted.
CONTACT_LINKS = {
    "eu": [
        {"label": "ncp", "url": "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/support/ncp"},
        {"label": "vinnova_eu", "url": "https://www.vinnova.se/m/horisont-europa/"},
    ],
    "mtc": [{"label": "mtc", "url": "https://www.mtcos.se/kontakt/"}],
    "bsp": [{"label": "bsp", "url": "https://www.bluesciencepark.se/kontakt/kontaktpersoner/"}],
    "techconceptlab": [{"label": "organiser", "url": "https://techconceptlab.com/"}],
    "almi": [{"label": "organiser", "url": "https://www.almi.se/blekinge/"}],
    "netport": [{"label": "organiser", "url": "https://www.netport.se/"}],
}


# ---------------------------------------------------------------- localisation
# Texts that were published in Swedish (event titles, testbed pages) are kept in
# Swedish for sv and translated for en; agent output (English) is translated for sv.
SWEDISH_ORIGIN = {"event": {"title"}, "testbed": {"title", "summary"}}


def _lang(lang: str | None) -> str:
    return "en" if lang == "en" else "sv"


def _loc_opps(opps: list[dict], lang: str, tc: Collector) -> None:
    for o in opps:
        native_sv = SWEDISH_ORIGIN.get(o["kind"], set())
        if lang == "sv":
            if o.get("title_sv"):
                o["title"] = o["title_sv"]
            elif "title" not in native_sv and o["source"] != "eu":  # EU topic titles are official names
                tc.add(o, "title")
            if "summary" not in native_sv:
                tc.add(o, "summary")
        else:
            for f in native_sv:
                tc.add(o, f)


def _loc_explanation(e: dict | None, tc: Collector) -> None:
    if not e:
        return
    for k in ("why", "next_step"):
        tc.add(e, k)
    tc.add_list(e, "uncertainties")
    tc.add_list(e, "profile_points")
    for r in e.get("requirements", []):
        tc.add(r, "requirement")
        tc.add(r, "basis")


def _loc_profile(p: dict, tc: Collector) -> None:
    for k in ("summary", "size_basis"):
        tc.add(p, k)
    for c in p.get("claims", []):
        if c.get("origin") == "user":
            continue  # the company's own words stay as written
        tc.add(c, "statement")
        tc.add(c, "reasoning")
    for m in p.get("missing", []):
        tc.add(m, "note")


@app.get("/api/health")
def health():
    return {"ok": True, "time": now_iso()}


@app.get("/api/overview")
def overview(lang: str = "sv"):
    lang = _lang(lang)
    counts = db.rows("SELECT kind, source, COUNT(*) n, MAX(fetched_at) fetched_at FROM opportunities GROUP BY kind, source")
    active = [o for o in db.rows("SELECT * FROM opportunities") if matcher._active(o)]
    profiled = db.rows("SELECT slug, name, profile_version, updated_at FROM companies WHERE profile IS NOT NULL AND slug NOT LIKE 'sim-%'")
    # Calls closing today cannot be acted on any more: start from tomorrow.
    soon = [_opp_public(o) for o in sorted([o for o in active if o.get("deadline") and o["deadline"][:10] > today().isoformat()], key=lambda o: o["deadline"])[:5]]
    tc = Collector(lang)
    _loc_opps(soon, lang, tc)
    tc.run()
    return {
        "members": db.one("SELECT COUNT(*) n FROM companies WHERE slug NOT LIKE 'sim-%'")["n"],
        "profiled": profiled,
        "opportunities": {
            "funding": sum(1 for o in active if o["kind"] == "funding"),
            "event": sum(1 for o in active if o["kind"] == "event"),
            "testbed": sum(1 for o in active if o["kind"] == "testbed"),
        },
        "sources": [c | SOURCE_INFO.get(c["source"], {}) for c in counts],
        "closing_soon": soon,
        "today": today().isoformat(),
    }


@app.get("/api/companies")
def companies():
    rows = db.rows("SELECT slug, name, website, bsp_page, demo, profile IS NOT NULL AS profiled, profile_version, updated_at FROM companies WHERE slug NOT LIKE 'sim-%' ORDER BY demo DESC, name")
    eco = {n["slug"]: n for n in _ecosystem()["nodes"]}
    for r in rows:
        r["industry"] = eco.get(r["slug"], {}).get("industry", "")
        r["demo"] = bool(r["demo"])
        r["profiled"] = bool(r["profiled"])
    return rows


@app.get("/api/companies/{slug}")
def company(slug: str, lang: str = "sv"):
    c = _company(slug)
    if not c["profile"]:
        raise HTTPException(409, "This member has not been profiled yet")
    return {"slug": slug, "name": c["name"], "website": c["website"], "bsp_page": c["bsp_page"],
            "version": c["profile_version"], "updated_at": c["updated_at"], "profile": _localised_profile(c["profile"], _lang(lang))}


def _localised_profile(p: dict, lang: str) -> dict:
    p = json.loads(json.dumps(p))
    tc = Collector(lang)
    _loc_profile(p, tc)
    tc.run()
    return p


@app.post("/api/companies/{slug}/build")
def build(slug: str):
    """Profile any member on demand: crawl its public pages, profile, verify, rank."""
    from .collectors import websites

    c = _company(slug)
    if not c["website"]:
        raise HTTPException(400, "No public website known for this member")
    from .collectors.members import member_page_text
    from . import fetch as _fetch

    if c["bsp_page"]:
        try:
            p = _fetch.get(c["bsp_page"])
            db.upsert("pages", {"url": c["bsp_page"], "company_slug": slug, "kind": "bsp_member", "title": f"{c['name']} – Blue Science Park",
                                "text": member_page_text(p["html"]), "fetched_at": p["fetched_at"], "simulated": 0}, ["url"])
        except _fetch.FetchError:
            pass
    pages = websites.crawl_company(slug)
    if not pages and not db.one("SELECT 1 FROM pages WHERE company_slug=?", (slug,)):
        raise HTTPException(502, "Could not read any public pages for this member (site blocked or unreachable)")
    profiler.build_profile(slug)
    matcher.refresh_matches(slug, explain_top={"funding": 4, "event": 2, "testbed": 2})
    db.execute("UPDATE companies SET demo=1 WHERE slug=?", (slug,))
    _ecosystem_cached.cache_clear()
    return {"ok": True, "pages": len(pages)}


class Edit(BaseModel):
    action: str                 # confirm | reject | edit | add | restore
    claim_id: str | None = None
    statement: str | None = None
    section: str | None = None
    note: str | None = None
    lang: str | None = None


@app.post("/api/companies/{slug}/profile")
def edit_profile(slug: str, e: Edit):
    c = _company(slug)
    try:
        new, note = apply_edit(c["profile"], e.action, e.claim_id, e.model_dump(exclude_none=True))
    except (ValueError, KeyError) as err:
        raise HTTPException(400, str(err)) from err
    version = profiler.save_profile(slug, new, author="user", note=note)
    lang = _lang(e.lang)
    return {"version": version, "note": note, "profile": _localised_profile(new, lang), "feed": feed(slug, lang=lang)}


@app.get("/api/companies/{slug}/timeline")
def timeline(slug: str):
    versions = db.rows("SELECT version, author, note, created_at, profile FROM profile_versions WHERE slug=? ORDER BY version", (slug,))
    out, prev = [], None
    for v in versions:
        p = db.loads(v["profile"])
        d = profiler.diff_profiles(prev, p) if prev else {"added": p["claims"], "removed": [], "changed": []}
        out.append({"version": v["version"], "author": v["author"], "note": v["note"], "created_at": v["created_at"],
                    "added": [c["statement"] for c in d["added"]][:30], "removed": [c["statement"] for c in d["removed"]],
                    "changed": d["changed"], "claims": len(p["claims"])})
        prev = p
    return out[::-1]


@app.get("/api/companies/{slug}/feed")
def feed(slug: str, kind: str | None = None, limit: int = 12, lang: str = "sv"):
    _company(slug)
    lang = _lang(lang)
    ranked = matcher.rank(slug)
    stored = {m["opp_id"]: m for m in db.rows("SELECT * FROM matches WHERE company_slug=?", (slug,))}
    fb = {}
    for f in db.rows("SELECT opp_id, value FROM feedback WHERE company_slug=?", (slug,)):
        fb.setdefault(f["opp_id"], []).append(f["value"])
    per_kind_limit = {"funding": limit, "event": 6, "testbed": 6}
    counts: dict[str, int] = {}
    items = []
    for i, r in enumerate(ranked):
        if kind and r["kind"] != kind:
            continue
        if "down" in fb.get(r["opp_id"], []):
            continue
        counts[r["kind"]] = counts.get(r["kind"], 0) + 1
        if counts[r["kind"]] > per_kind_limit.get(r["kind"], limit):
            continue
        o = db.one("SELECT * FROM opportunities WHERE id=?", (r["opp_id"],))
        m = stored.get(r["opp_id"])
        items.append({
            "rank": len(items) + 1, "score": r["score"], "components": r["components"], "anchor_claim": r["anchor_claim"],
            "opportunity": _opp_public(o),
            "explanation": db.loads(m["explanation"]) if m else None,
            "feedback": fb.get(r["opp_id"], []),
        })
    # The Matcher's own judgement (strong/possible/weak) orders the list first,
    # the numeric score breaks ties: a "strong fit" never sits below a "possible" one.
    tier = {"strong": 0, "possible": 1, None: 2, "weak": 3}
    items.sort(key=lambda i: (tier.get((i["explanation"] or {}).get("relevance")), -i["score"]))
    for n, i in enumerate(items, 1):
        i["rank"] = n
    tc = Collector(lang)
    _loc_opps([i["opportunity"] for i in items], lang, tc)
    for i in items:
        _loc_explanation(i["explanation"], tc)
        if lang == "sv":
            tc.add(i, "anchor_claim")
    tc.run()
    return items


@app.post("/api/companies/{slug}/explain/{opp_id:path}")
def explain(slug: str, opp_id: str, lang: str = "sv"):
    _company(slug)
    if not db.one("SELECT 1 FROM opportunities WHERE id=?", (opp_id,)):
        raise HTTPException(404, "Unknown opportunity")
    exp = matcher.explain(slug, opp_id)
    r = next((x for x in matcher.rank(slug) if x["opp_id"] == opp_id), None)
    db.upsert("matches", {"company_slug": slug, "opp_id": opp_id, "score": r["score"] if r else 0,
                          "components": json.dumps((r or {}).get("components", {})), "explanation": json.dumps(exp, ensure_ascii=False),
                          "profile_version": _company(slug)["profile_version"], "created_at": now_iso()}, ["company_slug", "opp_id"])
    tc = Collector(_lang(lang))
    _loc_explanation(exp, tc)
    tc.run()
    return exp


class Feedback(BaseModel):
    opp_id: str
    value: str  # up | down | saved
    undo: bool = False


@app.post("/api/companies/{slug}/feedback")
def feedback(slug: str, f: Feedback):
    _company(slug)
    if f.value not in ("up", "down", "saved"):
        raise HTTPException(400, "value must be up, down or saved")
    if f.undo:
        db.execute("DELETE FROM feedback WHERE company_slug=? AND opp_id=? AND value=?", (slug, f.opp_id, f.value))
    else:
        if f.value in ("up", "down"):
            db.execute("DELETE FROM feedback WHERE company_slug=? AND opp_id=? AND value IN ('up','down')", (slug, f.opp_id))
        db.upsert("feedback", {"company_slug": slug, "opp_id": f.opp_id, "value": f.value, "created_at": now_iso()}, ["company_slug", "opp_id", "value"])
    return {"ok": True}


@app.get("/api/companies/{slug}/saved")
def saved(slug: str):
    ids = [r["opp_id"] for r in db.rows("SELECT opp_id FROM feedback WHERE company_slug=? AND value='saved' ORDER BY created_at DESC", (slug,))]
    return [_opp_public(db.one("SELECT * FROM opportunities WHERE id=?", (i,))) for i in ids if db.one("SELECT 1 FROM opportunities WHERE id=?", (i,))]


@app.get("/api/companies/{slug}/connections")
def connections(slug: str, lang: str = "sv"):
    _company(slug)
    out = connector.suggest(slug)
    tc = Collector(_lang(lang))
    for s in out:
        c = db.one("SELECT name, bsp_page, website FROM companies WHERE slug=?", (s["slug"],))
        s.update({"name": c["name"], "bsp_page": c["bsp_page"], "website": c["website"]})
        for k in ("headline", "complementary", "caution"):
            tc.add(s, k)
        tc.add_list(s, "shared")
    tc.run()
    return out


class ChatIn(BaseModel):
    message: str
    lang: str | None = None


@app.post("/api/companies/{slug}/chat")
def chat(slug: str, m: ChatIn):
    c = _company(slug)
    if not c["profile"]:
        raise HTTPException(409, "Profile not ready")
    if not m.message.strip():
        raise HTTPException(400, "Empty message")
    lang = _lang(m.lang)
    out = concierge.respond(slug, m.message.strip()[:2000], lang=lang)
    tc = Collector(lang)
    for cit in out.get("citations", []):
        o = db.one("SELECT * FROM opportunities WHERE id=?", (cit.get("opp_id") or "",))
        if o and lang == "sv" and o.get("title_sv"):
            cit["title"] = o["title_sv"]
    tc.run()
    return out


# ---------------------------------------------------------------- email alerts
class AlertsIn(BaseModel):
    email: str
    kinds: list[str] = ["funding", "event", "testbed"]
    min_relevance: str = "possible"
    lang: str = "sv"
    consent: bool = False


@app.get("/api/companies/{slug}/alerts")
def alerts_status(slug: str):
    _company(slug)
    notifier.init()
    sub = db.one("SELECT email, kinds, min_relevance, lang, consent_at, active FROM subscriptions WHERE company_slug=?", (slug,))
    if sub:
        sub["kinds"] = json.loads(sub["kinds"])
        sub["active"] = bool(sub["active"])
    outbox = db.rows(
        "SELECT id, email, subject, items, status, detail, created_at FROM outbox WHERE company_slug=? ORDER BY id DESC LIMIT 20", (slug,)
    )
    return {"subscription": sub, "outbox": outbox, "smtp_configured": notifier.smtp_configured()}


@app.post("/api/companies/{slug}/alerts")
def alerts_subscribe(slug: str, a: AlertsIn):
    _company(slug)
    if not a.consent:
        raise HTTPException(400, "Consent is required to receive emails")
    notifier.init()
    try:
        result = notifier.subscribe(slug, a.email, a.kinds, a.min_relevance, a.lang)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return result | alerts_status(slug)


@app.post("/api/companies/{slug}/alerts/check")
def alerts_check(slug: str):
    _company(slug)
    return notifier.run(slug) | alerts_status(slug)


@app.delete("/api/companies/{slug}/alerts")
def alerts_delete(slug: str):
    _company(slug)
    notifier.init()
    db.execute("UPDATE subscriptions SET active=0 WHERE company_slug=?", (slug,))
    return alerts_status(slug)


class Unsub(BaseModel):
    token: str


@app.post("/api/alerts/unsubscribe")
def alerts_unsubscribe(u: Unsub):
    return {"ok": notifier.unsubscribe(u.token)}


@app.get("/api/outbox/{msg_id}", response_class=Response)
def outbox_html(msg_id: int):
    notifier.init()
    m = db.one("SELECT html FROM outbox WHERE id=?", (msg_id,))
    if not m:
        raise HTTPException(404)
    return Response(m["html"], media_type="text/html")


@app.get("/api/companies/{slug}/chat")
def chat_history(slug: str):
    # Only this company's own conversation is ever returned.
    return db.rows("SELECT role, content, verdict, created_at FROM chat_log WHERE company_slug=? ORDER BY id", (slug,))


@app.delete("/api/companies/{slug}/chat")
def chat_clear(slug: str):
    db.execute("DELETE FROM chat_log WHERE company_slug=?", (slug,))
    return {"ok": True}


@lru_cache(maxsize=1)
def _ecosystem_cached(_key: str):
    return connector.ecosystem()


def _ecosystem():
    n = db.one("SELECT COUNT(*) n FROM companies")["n"]
    return _ecosystem_cached(str(n))


@app.get("/api/ecosystem")
def ecosystem():
    return _ecosystem()


@app.get("/api/opportunities")
def opportunities(kind: str | None = None, source: str | None = None, q: str | None = None, limit: int = 200):
    sql, params = "SELECT * FROM opportunities WHERE 1=1", []
    if kind:
        sql += " AND kind=?"; params.append(kind)
    if source:
        sql += " AND source=?"; params.append(source)
    if q:
        sql += " AND (title LIKE ? OR summary LIKE ?)"; params += [f"%{q}%", f"%{q}%"]
    rows = [o for o in db.rows(sql + " ORDER BY COALESCE(deadline, event_date, '9999')", params) if matcher._active(o)]
    return [_opp_public(o) for o in rows[:limit]]


@app.get("/api/opportunities/{opp_id:path}/ics")
def ics(opp_id: str):
    o = db.one("SELECT * FROM opportunities WHERE id=?", (opp_id,))
    if not o:
        raise HTTPException(404)
    d = o.get("event_date") or o.get("deadline")
    if not d:
        raise HTTPException(400, "No date for this opportunity")
    start = date.fromisoformat(d[:10])
    label = "Deadline: " if o.get("deadline") else ""
    body = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Radar//Blue Science Park//EN", "BEGIN:VEVENT",
        f"UID:{opp_id.replace(':', '-')}@radar", f"DTSTAMP:{datetime.utcnow():%Y%m%dT%H%M%SZ}",
        f"DTSTART;VALUE=DATE:{start:%Y%m%d}", f"DTEND;VALUE=DATE:{start + timedelta(days=1):%Y%m%d}",
        f"SUMMARY:{label}{o['title'][:180]}", f"URL:{o['url']}", f"DESCRIPTION:Source: {o['url']}",
        "END:VEVENT", "END:VCALENDAR", "",
    ])
    return Response(body, media_type="text/calendar", headers={"Content-Disposition": f'attachment; filename="radar-{start}.ics"'})


@app.get("/api/trust")
def trust():
    path = DATA / "eval_report.json"
    report = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    sim = db.one("SELECT profile FROM companies WHERE slug='sim-nordvik-subsea'")
    sim_page = db.one("SELECT url, text, injection_score FROM pages WHERE company_slug='sim-nordvik-subsea'")
    return {"report": report, "injection_demo": {
        "page": sim_page, "profile": db.loads(sim and sim["profile"]),
    }}


class GuardIn(BaseModel):
    message: str


@app.post("/api/trust/guard")
def trust_guard(m: GuardIn):
    """Run the Guard on any message without storing a conversation (for the live safety panel)."""
    from .agents import guard

    return guard.check(m.message[:2000])


@app.get("/api/demo-companies")
def demo_companies():
    return DEMO_COMPANIES
