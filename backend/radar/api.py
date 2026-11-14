"""Radar HTTP API (FastAPI).

Run:  uvicorn radar.api:app --reload --port 8000   (from backend/)"""
from __future__ import annotations

import json
import os
import threading
from datetime import date, datetime, timedelta
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from . import geo, auth, db, domains, embed
from .auth import current_user
from .agents import concierge, connector, matcher, notifier, profiler
from .collectors import logos
from .api_support import public_profile, apply_edit
from .config import DATA, DEMO_COMPANIES, HOSTED_DEMO, now_iso, today
from .translate import Collector, translate

app = FastAPI(title="Radar API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    # Plus the online demo's website address(es), from RADAR_ALLOWED_ORIGINS.
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"]
    + [o.strip().rstrip("/") for o in os.getenv("RADAR_ALLOWED_ORIGINS", "").split(",") if o.strip()],
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
    "national": {"name": "National testbeds (manually verified list)", "url": "/how#testbeds"},
    "vinnova_projects": {"name": "Vinnova open data – funded testbed projects", "url": "https://data.vinnova.se/"},
    "vinnova_events": {"name": "Vinnova calendar", "url": "https://www.vinnova.se/kalender/"},
    "bth": {"name": "Blekinge Institute of Technology events", "url": "https://www.bth.se/evenemang/"},
    "aisweden": {"name": "AI Sweden events", "url": "https://www.ai.se/en/events"},
    "regionblekinge": {"name": "Region Blekinge", "url": "https://regionblekinge.se/"},
    "sisp": {"name": "Swedish Incubators & Science Parks", "url": "https://www.sisp.se/"},
}


def _company(slug: str) -> dict:
    c = db.one("SELECT * FROM companies WHERE slug=?", (slug,))
    if not c:
        raise HTTPException(404, "Unknown company")
    c["profile"] = db.loads(c["profile"])
    return c


_LOGO_KEYS: dict[str, object] = {}


def _logo_keys() -> set[str]:
    """Known logo keys, re-read at most once a minute."""
    import time

    if not _LOGO_KEYS or time.time() - _LOGO_KEYS["t"] > 60:
        _LOGO_KEYS.update(keys=logos.known(), t=time.time())
    return _LOGO_KEYS["keys"]


def _opp_public(o: dict) -> dict:
    o = dict(o)
    o.pop("text", None)
    o["source_name"] = SOURCE_INFO.get(o["source"], {}).get("name", o["source"])
    o["simulated"] = bool(o.get("simulated"))
    o["contacts"] = db.loads(o.get("contacts"), []) or []
    o["contact_links"] = CONTACT_LINKS.get(o["source"], [])
    if o["source"] in ("national", "vinnova_projects"):  # each testbed has its own operator
        o["contact_links"] = [{"label": "operator" if o["source"] == "national" else "coordinator", "url": o["apply_url"] or o["url"]}]
    o["manually_verified"] = o["source"] == "national"
    o["logo"] = logos.key_for_url(o.get("url") or "", _logo_keys())
    o["domains"] = [k for k, _ in domains.opportunity_domains().get(o["id"], [])]
    if o["kind"] in ("event", "testbed"):  # for the region/city/format filters
        o["region"], o["city"] = geo.region_of(o.get("location"), o.get("location_mode"), o.get("source"))
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
    "vinnova_events": [{"label": "organiser", "url": "https://www.vinnova.se/kalender/"}],
    "bth": [{"label": "organiser", "url": "https://www.bth.se/evenemang/"}],
    "aisweden": [{"label": "organiser", "url": "https://www.ai.se/en/events"}],
    "regionblekinge": [{"label": "organiser", "url": "https://regionblekinge.se/"}],
    "sisp": [{"label": "organiser", "url": "https://www.sisp.se/"}],
}


# ---------------------------------------------------------------- localisation
# Texts that were published in Swedish (event titles, testbed pages) are kept in
# Swedish for sv and translated for en; agent output (English) is translated for sv.
SWEDISH_ORIGIN = {"event": {"title"}, "testbed": {"title", "summary"}}


def _lang(lang: str | None) -> str:
    return "en" if lang == "en" else "sv"


def _loc_opps(opps: list[dict], lang: str, tc: Collector) -> None:
    for o in opps:
        # National testbed texts are written in English (Vinnova projects carry their own Swedish title).
        native_sv = set() if o["source"] in ("national", "vinnova_projects") else SWEDISH_ORIGIN.get(o["kind"], set())
        if lang == "sv":
            if o.get("title_sv"):
                o["title"] = o["title_sv"]
            elif "title" not in native_sv and o["source"] not in ("eu", "national"):  # official names stay as they are
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
        if c.get("origin") == "user" or c.get("note") == "registry":  # own words / official register text
            continue  # the company's own words stay as written
        tc.add(c, "statement")
        tc.add(c, "reasoning")
    for m in p.get("missing", []):
        tc.add(m, "note")


def _not_in_demo() -> None:
    if HOSTED_DEMO:
        raise HTTPException(503, "Not available in the online demo. Run Radar locally to use this.")


@app.get("/api/health")
def health():
    return {"ok": True, "time": now_iso(), "hosted_demo": HOSTED_DEMO}


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
    md = domains.member_domains()
    for r in rows:
        r["industry"] = eco.get(r["slug"], {}).get("industry", "")
        r["logo"] = f"member-{r['slug']}" if f"member-{r['slug']}" in _logo_keys() else None
        r["domains"] = [k for k, _ in md.get(r["slug"], [])]
        r["demo"] = bool(r["demo"])
        r["profiled"] = bool(r["profiled"])
    return rows


@app.get("/api/members/search")
def member_search(q: str, lang: str = "sv", exclude: str | None = None):
    """Find members by expertise or technology, from public descriptions only."""
    try:
        out = connector.search(q, top=8, exclude=exclude)
    except embed.Unavailable as e:
        raise HTTPException(503, "Member search needs the local version of Radar") from e
    # Member pages are mostly Swedish and facts mostly English: translate both ways (cached).
    for r, txt in zip(out, translate([r["snippet"] for r in out], _lang(lang))):
        r["snippet"] = txt
    return out


def _own(user: dict | None, slug: str) -> bool:
    """Is the caller one of this company's approved members (or staff)? Only they
    see private priorities, saved items, feedback, alerts and their own chats."""
    return auth.can_access(user, slug)


def _visible(profile: dict, user: dict | None, slug: str) -> dict:
    return profile if _own(user, slug) else public_profile(profile)


@app.get("/api/companies/{slug}")
def company(slug: str, lang: str = "sv", user: dict | None = Depends(current_user)):
    c = _company(slug)
    if not c["profile"]:
        raise HTTPException(409, "This member has not been profiled yet")
    return {"slug": slug, "name": c["name"], "website": c["website"], "bsp_page": c["bsp_page"],
            "version": c["profile_version"], "updated_at": c["updated_at"], "can_edit": _own(user, slug),
            "profile": _localised_profile(_visible(c["profile"], user, slug), _lang(lang))}


def _localised_profile(p: dict, lang: str) -> dict:
    p = json.loads(json.dumps(p))
    tc = Collector(lang)
    _loc_profile(p, tc)
    tc.run()
    return p


@app.post("/api/companies/{slug}/build")
def build(slug: str, user: dict | None = Depends(current_user)):
    """Profile any member on demand: crawl its public pages, profile, verify, rank.
    Anyone may profile a member that has no profile yet (only public sources are
    used). Rebuilding an existing profile is for the company itself or staff."""
    _not_in_demo()
    from .collectors import websites

    c = _company(slug)
    if c["profile"] and not _own(user, slug):
        raise HTTPException(401 if not user else 403, "This member already has a profile; only its members or staff can rebuild it")
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
    action: str                 # confirm | reject | outdated | edit | add | restore | publish | unpublish
    public: bool | None = None  # for "add": publish immediately (default: private to the company)
    claim_id: str | None = None
    statement: str | None = None
    section: str | None = None
    note: str | None = None
    lang: str | None = None


def _audit(slug: str, version: int, user: dict | None, action: str, claim_id: str | None) -> None:
    """Who changed which company profile, and when (kept server-side; emails are not shown publicly)."""
    db.execute("CREATE TABLE IF NOT EXISTS profile_audit (slug TEXT, version INTEGER, email TEXT, name TEXT, action TEXT, claim_id TEXT, at TEXT)")
    db.execute("INSERT INTO profile_audit (slug, version, email, name, action, claim_id, at) VALUES (?,?,?,?,?,?,?)",
               (slug, version, (user or {}).get("email", ""), (user or {}).get("name", ""), action, claim_id or "", now_iso()))


@app.post("/api/companies/{slug}/profile")
def edit_profile(slug: str, e: Edit, user: dict | None = Depends(current_user)):
    _not_in_demo()
    auth.require_edit(user, slug)  # only the company's own members (or staff) may edit
    c = _company(slug)
    try:
        new, note = apply_edit(c["profile"], e.action, e.claim_id, e.model_dump(exclude_none=True), editor=user)
    except (ValueError, KeyError) as err:
        raise HTTPException(400, str(err)) from err
    version = profiler.save_profile(slug, new, author="user", note=note)
    _audit(slug, version, user, e.action, e.claim_id)
    # Refresh this company's recommendations from the corrected profile: the ranking
    # is recomputed on every request; the written explanations are regenerated in the background.
    threading.Thread(target=matcher.refresh_matches, args=(slug,), daemon=True).start()
    lang = _lang(e.lang)
    return {"version": version, "note": note, "profile": _localised_profile(new, lang), "feed": feed(slug, lang=lang, user=user)}


@app.get("/api/companies/{slug}/timeline")
def timeline(slug: str, user: dict | None = Depends(current_user)):
    versions = db.rows("SELECT version, author, note, created_at, profile FROM profile_versions WHERE slug=? ORDER BY version", (slug,))
    own = _own(user, slug)
    out, prev = [], None
    for v in versions:
        p = db.loads(v["profile"])
        if not own:  # outsiders see public changes only; notes may quote private text
            p = public_profile(p)
            v["note"] = "" if v["author"] == "user" else v["note"]
        d = profiler.diff_profiles(prev, p) if prev else {"added": p["claims"], "removed": [], "changed": []}
        out.append({"version": v["version"], "author": v["author"], "note": v["note"], "created_at": v["created_at"],
                    "added": [c["statement"] for c in d["added"]][:30], "removed": [c["statement"] for c in d["removed"]],
                    "changed": d["changed"], "claims": len(p["claims"])})
        prev = p
    return out[::-1]


@app.get("/api/companies/{slug}/feed")
def feed(slug: str, kind: str | None = None, limit: int = 30, lang: str = "sv", domain: str | None = None,
         user: dict | None = Depends(current_user)):
    """Ranked recommendations with an indicative 1-10 fit score and its reasons:
    the best `limit` of each kind, in one list ordered by score. The page shows
    the top 10 and reveals the rest on request."""
    c = _company(slug)
    lang = _lang(lang)
    own = _own(user, slug)
    ranked = matcher.rank(slug, private=own)
    stored = {m["opp_id"]: m for m in db.rows("SELECT * FROM matches WHERE company_slug=?", (slug,))}
    fb = {}
    for f in (db.rows("SELECT opp_id, value FROM feedback WHERE company_slug=?", (slug,)) if own else []):
        fb.setdefault(f["opp_id"], []).append(f["value"])
    scored = []
    for r in ranked:
        if (kind and r["kind"] != kind) or "down" in fb.get(r["opp_id"], []):
            continue
        m = stored.get(r["opp_id"])
        exp = db.loads(m["explanation"]) if m else None
        if exp and exp.get("error"):
            exp = None
        # Written for an older version of the profile: being rewritten in the background.
        updating = bool(m and (m.get("profile_version") or 0) < (c["profile_version"] or 0))
        fit, level = matcher.final_score(r, exp)
        scored.append((fit, r, exp, level, updating))
    scored.sort(key=lambda x: -x[0])
    if domain:  # only this field, still with the company's own fit score
        od = domains.opportunity_domains()
        scored = [x for x in scored if domain in {k for k, _ in od.get(x[1]["opp_id"], [])}]
    per_kind: dict[str, int] = {}
    keep = []
    for x in scored:
        per_kind[x[1]["kind"]] = per_kind.get(x[1]["kind"], 0) + 1
        # All upcoming events are kept so the region and format filters have something to filter.
        if per_kind[x[1]["kind"]] <= (100 if x[1]["kind"] == "event" else max(1, min(limit, 100))):
            keep.append(x)
    items = []
    for fit, r, exp, level, updating in keep:
        o = db.one("SELECT * FROM opportunities WHERE id=?", (r["opp_id"],))
        items.append({
            "rank": len(items) + 1, "score": r["score"], "fit": fit, "level": level, "assessed": exp is not None, "updating": updating,
            "components": r["components"], "reasons": [dict(x, p=dict(x.get("p") or {})) for x in r["reasons"]],
            "missing": r["missing"], "anchor_claim": r["anchor_claim"],
            "opportunity": _opp_public(o), "explanation": exp, "feedback": fb.get(r["opp_id"], []),
        })
    tc = Collector(lang)
    _loc_opps([i["opportunity"] for i in items], lang, tc)
    for i in items:
        _loc_explanation(i["explanation"], tc)
        if lang == "sv":
            tc.add(i, "anchor_claim")
            for x in i["reasons"]:
                if x["p"].get("claim"):
                    tc.add(x["p"], "claim")
    tc.run()
    return items


@app.post("/api/companies/{slug}/explain/{opp_id:path}")
def explain(slug: str, opp_id: str, lang: str = "sv", user: dict | None = Depends(current_user)):
    _company(slug)
    if not db.one("SELECT 1 FROM opportunities WHERE id=?", (opp_id,)):
        raise HTTPException(404, "Unknown opportunity")
    exp = matcher.explain(slug, opp_id)
    r = next((x for x in matcher.rank(slug, private=False) if x["opp_id"] == opp_id), None)
    db.upsert("matches", {"company_slug": slug, "opp_id": opp_id, "score": matcher.final_score(r, exp)[0] if r else 0,
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
def feedback(slug: str, f: Feedback, user: dict | None = Depends(current_user)):
    _company(slug)
    auth.require_edit(user, slug)  # saved items and feedback are the company's own
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
def saved(slug: str, user: dict | None = Depends(current_user)):
    auth.require_edit(user, slug)
    ids = [r["opp_id"] for r in db.rows("SELECT opp_id FROM feedback WHERE company_slug=? AND value='saved' ORDER BY created_at DESC", (slug,))]
    return [_opp_public(db.one("SELECT * FROM opportunities WHERE id=?", (i,))) for i in ids if db.one("SELECT 1 FROM opportunities WHERE id=?", (i,))]


@app.get("/api/companies/{slug}/connections")
def connections(slug: str, lang: str = "sv", user: dict | None = Depends(current_user)):
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


def _chat_owner(user: dict | None, slug: str, session: str) -> str:
    """Members share their company's conversation; everyone else only ever sees
    their own (a signed-in user by email, an anonymous visitor by browser session)."""
    if _own(user, slug):
        return f"company:{slug}"
    if user:
        return f"user:{user['email']}"
    sid = "".join(ch for ch in (session or "") if ch.isalnum() or ch == "-")[:64]
    if len(sid) < 16:
        raise HTTPException(400, "Missing chat session")
    return f"anon:{sid}"


class ChatIn(BaseModel):
    message: str
    lang: str | None = None
    session: str = ""  # anonymous visitor's browser session id


@app.post("/api/companies/{slug}/chat")
def chat(slug: str, m: ChatIn, user: dict | None = Depends(current_user)):
    c = _company(slug)
    if not c["profile"]:
        raise HTTPException(409, "Profile not ready")
    if not m.message.strip():
        raise HTTPException(400, "Empty message")
    lang = _lang(m.lang)
    out = concierge.respond(slug, m.message.strip()[:2000], lang=lang, private=_own(user, slug),
                            owner=_chat_owner(user, slug, m.session))
    tc = Collector(lang)
    for cit in out.get("citations", []):
        o = db.one("SELECT * FROM opportunities WHERE id=?", (cit.get("opp_id") or "",))
        if o and lang == "sv" and o.get("title_sv"):
            cit["title"] = o["title_sv"]
    tc.run()
    return out


# ---------------------------------------------------------------- Bolagsverket
class RegistryIn(BaseModel):
    orgnr: str


@app.get("/api/companies/{slug}/registry")
def registry_get(slug: str, user: dict | None = Depends(current_user)):
    from .collectors import bolagsverket

    _company(slug)
    return {"configured": bolagsverket.configured(), "registry": bolagsverket.get(slug)}


@app.post("/api/companies/{slug}/registry")
def registry_set(slug: str, r: RegistryIn, user: dict | None = Depends(current_user)):
    _not_in_demo()
    auth.require_edit(user, slug)  # only the company's own members (or staff) may edit
    """Look up the member's organisation number at Bolagsverket and, if the
    official name matches the member, add the official facts to the profile."""
    from .collectors import bolagsverket

    c = _company(slug)
    if not bolagsverket.configured():
        raise HTTPException(503, "Bolagsverket is not configured (add the keys to .env)")
    try:
        result = bolagsverket.register(slug, r.orgnr)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except bolagsverket.RegistryError as e:
        raise HTTPException(404 if "not found" in str(e).lower() else 502, str(e)) from e
    if result["status"] == "verified" and c["profile"]:
        p = c["profile"]
        p["claims"] = [x for x in p["claims"] if x.get("note") != "registry"] + bolagsverket.as_claims(slug)
        profiler.save_profile(slug, p, author="agent", note="Official facts from Bolagsverket")
    return result | {"registry": bolagsverket.get(slug)}


# ---------------------------------------------------------------- email alerts
class AlertsIn(BaseModel):
    email: str
    kinds: list[str] = ["funding", "event", "testbed"]
    min_relevance: str = "possible"
    lang: str = "sv"
    consent: bool = False
    frequency: str = "instant"  # instant | weekly


@app.get("/api/companies/{slug}/alerts")
def alerts_status(slug: str, user: dict | None = Depends(current_user)):
    _company(slug)
    auth.require_edit(user, slug)  # alert settings and emails are the company's own
    notifier.init()
    sub = db.one("SELECT email, kinds, min_relevance, lang, consent_at, active, frequency, last_digest_at FROM subscriptions WHERE company_slug=?", (slug,))
    if sub:
        sub["kinds"] = json.loads(sub["kinds"])
        sub["active"] = bool(sub["active"])
    outbox = db.rows(
        "SELECT id, email, subject, items, status, detail, created_at FROM outbox WHERE company_slug=? ORDER BY id DESC LIMIT 20", (slug,)
    )
    return {"subscription": sub, "outbox": outbox, "smtp_configured": notifier.smtp_configured(),
            "scheduler": notifier.scheduler_status(),
            "allowlist": bool(os.getenv("RADAR_MAIL_ALLOWLIST", "").strip()),
            "allowed": bool(sub) and notifier.allowed_recipient(sub["email"])}


@app.post("/api/companies/{slug}/alerts")
def alerts_subscribe(slug: str, a: AlertsIn, user: dict | None = Depends(current_user)):
    _not_in_demo()
    _company(slug)
    auth.require_edit(user, slug)  # alert settings and emails are the company's own
    if not a.consent:
        raise HTTPException(400, "Consent is required to receive emails")
    notifier.init()
    try:
        result = notifier.subscribe(slug, a.email, a.kinds, a.min_relevance, a.lang, a.frequency)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return result | alerts_status(slug, user=user)


@app.post("/api/companies/{slug}/alerts/check")
def alerts_check(slug: str, user: dict | None = Depends(current_user)):
    _not_in_demo()
    _company(slug)
    auth.require_edit(user, slug)  # alert settings and emails are the company's own
    return notifier.run(slug) | alerts_status(slug, user=user)


@app.post("/api/companies/{slug}/alerts/digest")
def alerts_digest(slug: str, user: dict | None = Depends(current_user)):
    _not_in_demo()
    """Send the weekly digest now (manual trigger for demos and staff)."""
    _company(slug)
    auth.require_edit(user, slug)  # alert settings and emails are the company's own
    notifier.init()
    if not db.one("SELECT 1 FROM subscriptions WHERE company_slug=? AND active=1", (slug,)):
        raise HTTPException(400, "Subscribe first")
    return notifier.run(slug, digest=True) | alerts_status(slug, user=user)


@app.on_event("startup")
def _start_scheduler() -> None:
    notifier.init()
    notifier.start_scheduler()
    # Rank every profiled member once in the background, so the first page loads
    # (including the park overview) are fast during a demo.
    if not HOSTED_DEMO:  # serverless: no background work
        threading.Thread(target=lambda: park_overview(lang="sv"), daemon=True).start()


@app.delete("/api/companies/{slug}/alerts")
def alerts_delete(slug: str, user: dict | None = Depends(current_user)):
    _company(slug)
    auth.require_edit(user, slug)  # alert settings and emails are the company's own
    notifier.init()
    db.execute("UPDATE subscriptions SET active=0 WHERE company_slug=?", (slug,))
    return alerts_status(slug, user=user)


class Unsub(BaseModel):
    token: str


@app.post("/api/alerts/unsubscribe")
def alerts_unsubscribe(u: Unsub):
    return {"ok": notifier.unsubscribe(u.token)}


@app.get("/api/companies/{slug}/outbox/{msg_id}")
def outbox_html(slug: str, msg_id: int, user: dict | None = Depends(current_user)):
    auth.require_edit(user, slug)  # emails contain the company's address and matches
    notifier.init()
    m = db.one("SELECT html FROM outbox WHERE id=? AND company_slug=?", (msg_id, slug))
    if not m:
        raise HTTPException(404)
    return {"html": m["html"]}


@app.get("/api/companies/{slug}/chat")
def chat_history(slug: str, session: str = "", user: dict | None = Depends(current_user)):
    # Only the caller's own conversation is ever returned.
    owner = _chat_owner(user, slug, session)
    return db.rows("SELECT role, content, verdict, created_at FROM chat_log WHERE company_slug=? AND owner=? ORDER BY id", (slug, owner))


@app.delete("/api/companies/{slug}/chat")
def chat_clear(slug: str, session: str = "", user: dict | None = Depends(current_user)):
    db.execute("DELETE FROM chat_log WHERE company_slug=? AND owner=?", (slug, _chat_owner(user, slug, session)))
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


# ---------------------------------------------------------------- accounts
@app.get("/api/me")
def me(user: dict | None = Depends(current_user)):
    if not user:
        return {"user": None, "login_required": auth.login_required()}
    return {"user": user, "login_required": auth.login_required(), "memberships": auth.memberships(user["email"]),
            "suggestions": auth.suggestions(user["email"])}


class AccessIn(BaseModel):
    slug: str


@app.post("/api/me/request")
def me_request(a: AccessIn, user: dict | None = Depends(current_user)):
    if not user:
        raise HTTPException(401, "Sign in")
    return auth.request_access(user, a.slug)


@app.get("/api/admin/requests")
def admin_requests(user: dict | None = Depends(current_user)):
    if not (user and user["staff"]):
        raise HTTPException(403, "Staff only")
    auth.init()
    return db.rows("SELECT m.email, m.slug, m.status, m.via, m.created_at, c.name FROM memberships m JOIN companies c ON c.slug=m.slug "
                   "ORDER BY CASE m.status WHEN 'pending' THEN 0 ELSE 1 END, m.created_at DESC LIMIT 200")


class DecideIn(BaseModel):
    email: str
    slug: str
    approve: bool


@app.post("/api/admin/requests/decide")
def admin_decide(d: DecideIn, user: dict | None = Depends(current_user)):
    if not (user and user["staff"]):
        raise HTTPException(403, "Staff only")
    auth.decide(user, d.email, d.slug, d.approve)
    return {"ok": True}


# ---------------------------------------------------------------- evidence
EVIDENCE_COMPANIES = ["ocean-harvesting", "techinova", "ericsson", "embeddedart", "saab"]
RATINGS = {"relevant": 1.0, "partly": 0.5, "not": 0.0}


def _rating_summary() -> list[dict]:
    out = []
    for slug in EVIDENCE_COMPANIES:
        rows = db.rows("SELECT rating, rater FROM relevance_ratings WHERE company_slug=?", (slug,))
        if not rows:
            continue
        name = (db.one("SELECT name FROM companies WHERE slug=?", (slug,)) or {}).get("name", slug)
        score = sum(RATINGS.get(r["rating"], 0) for r in rows)
        out.append({"slug": slug, "name": name, "rated": len(rows), "raters": len({r["rater"] for r in rows}),
                    "relevant": sum(r["rating"] == "relevant" for r in rows), "partly": sum(r["rating"] == "partly" for r in rows),
                    "hit_rate": round(score / len(rows), 3)})
    return out


@app.get("/api/evidence")
def evidence():
    """Team-rated relevance of the top 10 and measured model usage (tokens, time). No prices are invented."""
    usage = db.rows(
        "SELECT model, purpose, COUNT(*) AS calls, SUM(cached) AS cached, SUM(prompt_tokens) AS prompt_tokens, "
        "SUM(completion_tokens) AS completion_tokens, AVG(CASE WHEN cached=0 THEN ms END) AS avg_ms, "
        "MIN(at) AS since FROM llm_usage GROUP BY model, purpose ORDER BY SUM(prompt_tokens) + SUM(completion_tokens) DESC"
    )
    for u in usage:
        u["avg_ms"] = round(u["avg_ms"] or 0)
    summary = _rating_summary()
    total = sum(s["rated"] for s in summary)
    overall = round(sum(s["hit_rate"] * s["rated"] for s in summary) / total, 3) if total else None
    companies = [{"slug": s, "name": (db.one("SELECT name FROM companies WHERE slug=?", (s,)) or {}).get("name", s)}
                 for s in EVIDENCE_COMPANIES if db.one("SELECT 1 FROM companies WHERE slug=? AND profile IS NOT NULL", (s,))]
    return {"companies": companies, "ratings": summary, "overall_hit_rate": overall, "rated_total": total, "usage": usage}


@app.get("/api/evidence/{slug}")
def evidence_top(slug: str, rater: str = "", lang: str = "sv"):
    items = feed(slug, lang=lang, user=None)[:10]
    mine = {r["opp_id"]: r["rating"] for r in db.rows(
        "SELECT opp_id, rating FROM relevance_ratings WHERE company_slug=? AND rater=?", (slug, rater.strip()[:60]))}
    return [{"rank": i["rank"], "fit": i["fit"], "level": i["level"], "opp_id": i["opportunity"]["id"],
             "title": i["opportunity"]["title"], "kind": i["opportunity"]["kind"], "url": i["opportunity"]["url"],
             "why": (i["explanation"] or {}).get("why", ""), "rating": mine.get(i["opportunity"]["id"])} for i in items]


class Rating(BaseModel):
    slug: str
    opp_id: str
    rater: str
    rating: str
    fit: float = 0
    rank: int = 0


@app.post("/api/evidence/rate")
def evidence_rate(r: Rating):
    rater = r.rater.strip()[:60]
    if not rater or r.rating not in RATINGS or r.slug not in EVIDENCE_COMPANIES:
        raise HTTPException(400, "rater, a rating (relevant/partly/not) and a demo company are required")
    db.upsert("relevance_ratings", {"company_slug": r.slug, "opp_id": r.opp_id, "rater": rater, "rating": r.rating,
                                     "fit": r.fit, "rank": r.rank, "at": now_iso()}, ["company_slug", "opp_id", "rater"])
    return evidence()


# ---------------------------------------------------------------- Blue Science Park view
# Views for the park's own staff in the demo (opened through the simulated
# "Blue Science Park" choice). They use public profiles and the same 1-10 score
# as the members' own pages; nothing private is shown here.
def _profiled() -> list[dict]:
    return db.rows("SELECT slug, name, updated_at, profile_version FROM companies "
                   "WHERE profile IS NOT NULL AND slug NOT LIKE 'sim-%' ORDER BY name")


def _scored(slug: str) -> list[tuple[float, str, dict]]:
    """(fit, level, ranked item) for one member, public view, best first."""
    stored = {m["opp_id"]: db.loads(m["explanation"]) for m in db.rows("SELECT opp_id, explanation FROM matches WHERE company_slug=?", (slug,))}
    out = []
    for r in matcher.rank(slug, private=False):
        exp = stored.get(r["opp_id"])
        fit, level = matcher.final_score(r, exp if exp and not exp.get("error") else None)
        out.append((fit, level, r))
    out.sort(key=lambda x: -x[0])
    return out


def _feed_like(scored: list) -> list:
    """The same selection the member's own feed shows: the best 30 of each type."""
    seen: dict[str, int] = {}
    keep = []
    for x in scored:
        k = x[2]["kind"]
        seen[k] = seen.get(k, 0) + 1
        if seen[k] <= 30:
            keep.append(x)
    return keep


@app.get("/api/park/overview")
def park_overview(lang: str = "sv"):
    """Per profiled member: strong and possible matches, the nearest deadline among
    them, when the profile was updated and how many tips the park has sent."""
    _tips_init()
    rows = []
    for c in _profiled():
        scored = _feed_like(_scored(c["slug"]))
        good = [(f, lv, r) for f, lv, r in scored if lv in ("strong", "possible")]
        deadlines = []
        for f, lv, r in good:
            o = db.one("SELECT id, title, title_sv, deadline FROM opportunities WHERE id=?", (r["opp_id"],))
            if o and o["deadline"]:
                deadlines.append((o["deadline"], o, f))
        deadlines.sort(key=lambda x: x[0])
        nxt = deadlines[0] if deadlines else None
        top = db.one("SELECT id, title, title_sv FROM opportunities WHERE id=?", (scored[0][2]["opp_id"],)) if scored else None
        rows.append({
            "slug": c["slug"], "name": c["name"], "updated_at": c["updated_at"],
            "strong": sum(1 for _, lv, _r in scored if lv == "strong"),
            "possible": sum(1 for _, lv, _r in scored if lv == "possible"),
            "top": top and {"id": top["id"], "title": (top["title_sv"] if lang == "sv" and top.get("title_sv") else top["title"]), "fit": scored[0][0]},
            "next_deadline": nxt and {"id": nxt[1]["id"], "date": nxt[0][:10], "fit": nxt[2],
                                      "title": (nxt[1]["title_sv"] if lang == "sv" and nxt[1].get("title_sv") else nxt[1]["title"])},
            "tips": db.one("SELECT COUNT(*) AS n FROM park_tips WHERE company_slug=?", (c["slug"],))["n"],
        })
    return rows


@app.get("/api/park/fit")
def park_fit(opp_id: str, lang: str = "sv"):
    """Which members does this opportunity fit best? Same score as on their pages."""
    o = db.one("SELECT * FROM opportunities WHERE id=?", (opp_id,))
    if not o:
        raise HTTPException(404, "Unknown opportunity")
    out = []
    for c in _profiled():
        hit = next(((f, lv, r) for f, lv, r in _scored(c["slug"]) if r["opp_id"] == opp_id), None)
        if not hit:
            continue
        f, lv, r = hit
        m = db.one("SELECT explanation FROM matches WHERE company_slug=? AND opp_id=?", (c["slug"], opp_id))
        why = (db.loads(m["explanation"]) or {}).get("why", "") if m else ""
        out.append({"slug": c["slug"], "name": c["name"], "fit": f, "level": lv, "why": why,
                    "reasons": [dict(x, p=dict(x.get("p") or {})) for x in r["reasons"][:3]]})
    out.sort(key=lambda x: -x["fit"])
    tc = Collector(_lang(lang))
    for x in out:
        tc.add(x, "why")
        if _lang(lang) == "sv":
            for rs in x["reasons"]:
                if rs["p"].get("claim"):
                    tc.add(rs["p"], "claim")
    tc.run()
    return {"opportunity": _opp_public(o), "members": out}


def _tips_init() -> None:
    db.execute("CREATE TABLE IF NOT EXISTS park_tips (id INTEGER PRIMARY KEY AUTOINCREMENT, company_slug TEXT, "
               "opp_id TEXT, note TEXT, created_at TEXT)")


class TipIn(BaseModel):
    slug: str
    opp_id: str
    note: str = ""


@app.post("/api/park/tips")
def park_tip(t: TipIn):
    """Blue Science Park tips a member about an opportunity. Simulated in the
    prototype: the tip is shown on the member's page, no email is sent."""
    _company(t.slug)
    if not db.one("SELECT 1 FROM opportunities WHERE id=?", (t.opp_id,)):
        raise HTTPException(404, "Unknown opportunity")
    _tips_init()
    if not db.one("SELECT 1 FROM park_tips WHERE company_slug=? AND opp_id=?", (t.slug, t.opp_id)):
        db.execute("INSERT INTO park_tips (company_slug, opp_id, note, created_at) VALUES (?,?,?,?)",
                   (t.slug, t.opp_id, t.note.strip()[:500], now_iso()))
    return {"ok": True}


@app.get("/api/companies/{slug}/tips")
def company_tips(slug: str, lang: str = "sv"):
    _company(slug)
    _tips_init()
    out = []
    for t in db.rows("SELECT id, opp_id, note, created_at FROM park_tips WHERE company_slug=? ORDER BY id DESC", (slug,)):
        o = db.one("SELECT * FROM opportunities WHERE id=?", (t["opp_id"],))
        if o:
            out.append(t | {"opportunity": _opp_public(o)})
    _loc_opps([t["opportunity"] for t in out], _lang(lang), tc := Collector(_lang(lang)))
    tc.run()
    return out


@app.delete("/api/companies/{slug}/tips/{tip_id}")
def company_tip_delete(slug: str, tip_id: int):
    _tips_init()
    db.execute("DELETE FROM park_tips WHERE id=? AND company_slug=?", (tip_id, slug))
    return {"ok": True}



# ---------------------------------------------------------------- fields and logos
@app.get("/api/domains")
def domain_list(lang: str = "sv"):
    """The fields people can browse by, with how many open opportunities and members each has."""
    active = {o["id"] for o in db.rows("SELECT * FROM opportunities") if matcher._active(o)}
    od, md = domains.opportunity_domains(), domains.member_domains()
    out = []
    for k in domains.DOMAINS:
        out.append({"key": k, "name": domains.name(k, _lang(lang)),
                    "opportunities": sum(1 for i, v in od.items() if i in active and any(d == k for d, _ in v)),
                    "members": sum(1 for v in md.values() if any(d == k for d, _ in v))})
    return out


@app.get("/api/explore")
def explore(domains_: str = "", kind: str | None = None, lang: str = "sv", limit: int = 60):
    """For visitors: open opportunities and member companies in the chosen fields.
    No company profile is involved, so there is no fit score, only closeness to the field."""
    from fastapi import Query  # noqa: F401  (documented parameter name below)

    keys = [k for k in domains_.split(",") if k in domains.DOMAINS]
    if not keys:
        raise HTTPException(400, "Choose at least one field")
    od, md = domains.opportunity_domains(), domains.member_domains()
    picked = []
    for o in db.rows("SELECT * FROM opportunities"):
        if not matcher._active(o) or (kind and o["kind"] != kind):
            continue
        hit = [sc for d, sc in od.get(o["id"], []) if d in keys]
        if hit:
            picked.append((max(hit), o))
    picked.sort(key=lambda x: -x[0])
    opps = [_opp_public(o) for _, o in picked[:max(1, min(limit, 150))]]
    tc = Collector(_lang(lang))
    _loc_opps(opps, _lang(lang), tc)
    tc.run()
    members = []
    for m in db.rows("SELECT slug, name, website, bsp_page, profile IS NOT NULL AS profiled FROM companies WHERE slug NOT LIKE 'sim-%' ORDER BY name"):
        if any(d in keys for d, _ in md.get(m["slug"], [])):
            members.append(m | {"profiled": bool(m["profiled"]),
                                "logo": f"member-{m['slug']}" if f"member-{m['slug']}" in _logo_keys() else None,
                                "domains": [d for d, _ in md.get(m["slug"], [])]})
    return {"opportunities": opps, "members": members}


@app.get("/api/logos/{key}")
def logo(key: str):
    path = logos.path_for(key)
    if not path:
        raise HTTPException(404)
    types = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
             ".ico": "image/x-icon", ".gif": "image/gif"}
    return FileResponse(path, media_type=types.get(path.suffix.lower(), "application/octet-stream"),
                        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})
