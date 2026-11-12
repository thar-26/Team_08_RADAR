"""Scouts' raw collectors for funding: Vinnova open data and the EU Funding &
Tenders portal. Both are official public APIs; no scraping."""
from __future__ import annotations

import html as htmllib
import json
import re
from datetime import date, timedelta

import httpx

from .. import db
from ..config import USER_AGENT, now_iso, today

_http = httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT})


def _clean(s: str | None) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", htmllib.unescape(s)).strip()


# ---------------------------------------------------------------- Vinnova
VINNOVA = "https://data.vinnova.se/api"


def collect_vinnova() -> int:
    since = (today() - timedelta(days=540)).isoformat()
    rounds = _http.get(f"{VINNOVA}/ansokningsomgangar/{since}").json()
    calls = {c["Diarienummer"]: c for c in _http.get(f"{VINNOVA}/utlysningar/{since}").json()}
    fetched = now_iso()
    n = 0
    for r in rounds:
        close = (r.get("Stangningsdatum") or "")[:10]
        if r.get("Publik") != 1 or not close or date.fromisoformat(close) < today():
            continue
        texts = r.get("WebTextLista") or []
        purpose = " ".join(t.get("TextEn") or t.get("TextSv") or "" for t in texts if t.get("TextID") == 1)
        who = " ".join(t.get("TextEn") or t.get("TextSv") or "" for t in texts if t.get("TextID") == 2)
        rest = " ".join(t.get("TextEn") or t.get("TextSv") or "" for t in texts if t.get("TextID") not in (1, 2))
        links = r.get("LankLista") or []
        apply_url = next((l["URL"] for l in links if "ansok.vinnova.se" in l.get("URL", "")), "")
        info_url = next((l["URL"] for l in links if "vinnova.se" in l.get("URL", "") and "ansok." not in l["URL"]), "")
        call = calls.get(r.get("DiarienummerUtlysning"), {})
        title = r.get("TitelEngelska") or r.get("Titel")
        summary = _clean(purpose or r.get("BeskrivningEngelska") or r.get("Beskrivning"))
        db.upsert(
            "opportunities",
            {
                "id": f"vinnova:{r['Diarienummer']}",
                "kind": "funding", "source": "vinnova", "title": title, "title_sv": r.get("Titel") or title,
                "summary": summary[:1200],
                "eligibility_text": _clean(who)[:1500],
                # Prefer Vinnova's own page about the call, then the public call page in
                # Vinnova's application portal, then the open-data record itself.
                "url": info_url or apply_url or f"{VINNOVA}/ansokningsomgangar/{since}",
                "apply_url": apply_url,
                "published": (call.get("Publiceringsdatum") or r.get("Oppningsdatum") or "")[:10],
                "opens": (r.get("Oppningsdatum") or "")[:10], "deadline": close,
                "event_date": None, "location_mode": None, "location": "Sweden", "audience": _clean(who)[:300],
                "budget": "", "programme": "Vinnova",
                "text": _clean(f"{title}. {summary} Who can apply: {who} {rest}")[:4000],
                "fetched_at": fetched, "simulated": 0,
            },
            ["id"],
        )
        n += 1
    db.log("collect:vinnova", "ok", f"{n} open rounds")
    return n


# ---------------------------------------------------------------- EU F&T
EU_SEARCH = "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
EU_TOPIC = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/{}"


def _first(meta: dict, key: str) -> str:
    v = meta.get(key)
    return (v[0] if isinstance(v, list) and v else v) or ""


def collect_eu(max_pages: int = 12) -> int:
    """Open and forthcoming EU topics (grants), filtered to future deadlines."""
    query = {"bool": {"must": [{"terms": {"type": ["1", "2"]}}, {"terms": {"status": ["31094501", "31094502"]}}]}}
    fetched = now_iso()
    n, seen = 0, set()
    for page in range(1, max_pages + 1):
        r = _http.post(
            EU_SEARCH,
            params={"apiKey": "SEDIA", "text": "***", "pageSize": "100", "pageNumber": str(page)},
            files={
                "query": ("blob", json.dumps(query), "application/json"),
                "languages": ("blob", json.dumps(["en"]), "application/json"),
            },
        )
        results = r.json().get("results", [])
        if not results:
            break
        for res in results:
            m = res.get("metadata", {})
            ident = _first(m, "identifier")
            if not ident or ident in seen:
                continue
            seen.add(ident)
            deadline = _first(m, "deadlineDate")[:10]
            if not deadline or date.fromisoformat(deadline) < today():
                continue
            title = _first(m, "title")
            desc = _clean(_first(m, "descriptionByte") or _first(m, "description") or res.get("content", ""))
            cond = _clean(_first(m, "topicConditions") or "")
            db.upsert(
                "opportunities",
                {
                    "id": f"eu:{ident}", "kind": "funding", "source": "eu", "title": title,
                    "summary": desc[:1200], "eligibility_text": cond[:1500],
                    "url": EU_TOPIC.format(ident.lower()), "apply_url": EU_TOPIC.format(ident.lower()),
                    "published": _first(m, "startDate")[:10], "opens": _first(m, "startDate")[:10],
                    "deadline": deadline, "event_date": None, "location_mode": None, "location": "EU",
                    "audience": "", "budget": _first(m, "budget"),
                    "programme": _first(m, "callTitle") or _first(m, "callIdentifier"),
                    "text": f"{title}. {desc}"[:4000], "fetched_at": fetched, "simulated": 0,
                },
                ["id"],
            )
            n += 1
    db.log("collect:eu", "ok", f"{n} open/forthcoming topics")
    return n
