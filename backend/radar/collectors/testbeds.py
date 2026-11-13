"""Testing-opportunities collector: the testbed register of Marine Technology
Center of Sweden (part of the Blue Science Park ecosystem), via its public
WordPress API."""
from __future__ import annotations

import html as htmllib
import json
import re

from .. import db, fetch
from ..config import CACHE, DATA, USER_AGENT, now_iso, today

MTC_TESTBEDS = "https://www.mtcos.se/wp-json/wp/v2/testbadd?per_page=100"


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def _page_text(url: str) -> str:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(fetch.get(url)["html"], "lxml")
    for t in soup.select('[class*="cmplz"],[id*="cmplz"],[class*="cookie"],script,style,nav,header,footer,noscript'):
        t.decompose()
    root = soup.find("main") or soup.body
    text = _clean(root.get_text(" ", strip=True)) if root else ""
    return re.sub(r"\s*(Besök testbädd|Finansiärer|Linkedin|Youtube)\b.*$", "", text)


def collect_testbeds() -> int:
    try:
        raw = fetch.get(MTC_TESTBEDS, use_cache=False)
    except fetch.FetchError as e:
        db.log("collect:testbeds", "error", str(e))
        return 0
    n = 0
    for t in json.loads(raw["html"]):
        title = _clean(t["title"]["rendered"])
        body = _clean(t.get("content", {}).get("rendered", ""))
        if len(body) < 80:  # page built with a page builder: read the rendered page instead
            try:
                body = _page_text(t["link"])
            except fetch.FetchError:
                pass
        db.upsert(
            "opportunities",
            {
                "id": f"mtc:{t['slug']}", "kind": "testbed", "source": "mtc", "title": title,
                "summary": body[:900], "eligibility_text": "", "url": t["link"], "apply_url": "https://www.mtcos.se/kontakt/",
                "published": (t.get("date") or "")[:10], "opens": None, "deadline": None, "event_date": None,
                "location_mode": "in_person", "location": "Karlskrona / Blekinge", "audience": "", "budget": "",
                "programme": "Marine Technology Center of Sweden", "text": f"{title}. {body}"[:4000],
                "fetched_at": raw["fetched_at"] or now_iso(), "simulated": 0,
            },
            ["id"],
        )
        n += 1
    db.log("collect:testbeds", "ok", f"{n} testbeds")
    return n


# ---------- National testbeds ----------
# Testbed Sweden and ri.se refuse automated access (HTTP 403), so they are not
# scraped. Instead: (a) a short hand-verified list with official links and
# (b) Vinnova open data on ongoing, publicly funded testbed projects.
NATIONAL_FILE = DATA / "national_testbeds.json"
VINNOVA_PROJECTS = "https://data.vinnova.se/api/projekt/{since}"
_TESTBED_TITLE = re.compile(r"testb[äa]dd|testbed|test bed|testarena|demoarena", re.I)


def collect_national() -> int:
    data = json.loads(NATIONAL_FILE.read_text(encoding="utf-8"))
    n = 0
    for t in data["testbeds"]:
        summary = f"{t['capabilities']} Operated by {t['organisation']}."
        db.upsert(
            "opportunities",
            {
                "id": f"national:{t['id']}", "kind": "testbed", "source": "national", "title": t["name"],
                "summary": summary, "eligibility_text": "", "url": t["url"], "apply_url": t.get("contact") or t["url"],
                "published": data["verified"], "opens": None, "deadline": None, "event_date": None,
                "location_mode": "in_person", "location": t["location"], "audience": t["industries"], "budget": "",
                "programme": t["organisation"],
                "text": f"{t['name']}. {t['capabilities']} Industries: {t['industries']}. Location: {t['location']}."[:4000],
                "fetched_at": data["verified"] + "T00:00:00", "simulated": 0,
            },
            ["id"],
        )
        n += 1
    db.log("collect:national_testbeds", "ok", f"{n} hand-verified testbeds")
    return n


def _vinnova_projects(since: str) -> list[dict]:
    """The full project list is ~20 MB and slow; keep a local copy for a day."""
    import time

    import httpx

    cache = CACHE / f"vinnova_projekt_{since}.json"
    if cache.exists() and time.time() - cache.stat().st_mtime < 86400:
        return json.loads(cache.read_text(encoding="utf-8"))
    r = httpx.get(VINNOVA_PROJECTS.format(since=since), timeout=600, headers={"User-Agent": USER_AGENT})
    r.raise_for_status()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(r.text, encoding="utf-8")
    return r.json()


def _project_url(title_sv: str, dnr: str) -> str:
    """Vinnova's project page is /p/<slug of the Swedish title>/; checked once,
    with Vinnova's own search as the fallback."""
    import httpx

    slug = title_sv.lower().translate(str.maketrans("åäöéü", "aaoeu"))
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    url = f"https://www.vinnova.se/p/{slug}/"
    try:
        r = httpx.get(url, timeout=20, follow_redirects=True, headers={"User-Agent": USER_AGENT})
        if r.status_code == 200 and "/404" not in str(r.url):
            return url
    except httpx.HTTPError:
        pass
    return f"https://www.vinnova.se/sok-finansiering/hitta-finansiering/?q={dnr}"


def collect_vinnova_testbeds(since: str = "2024-01-01") -> int:
    """Ongoing Vinnova-funded testbed projects. They show that a testbed exists and
    who runs it; whether outside companies can use it must be asked."""
    try:
        projects = _vinnova_projects(since)
    except Exception as e:  # noqa: BLE001 - network or JSON errors are logged, not fatal
        db.log("collect:vinnova_testbeds", "error", str(e)[:300])
        return 0
    seen: set[str] = set()
    n = 0
    for p in projects:
        title = p.get("Ärenderubrik") or ""
        title_en = p.get("ÄrenderubrikEngelska") or title
        end = (p.get("ProjektSlut") or "")[:10]
        if not (_TESTBED_TITLE.search(title) or _TESTBED_TITLE.search(title_en)) or not end or end < today().isoformat():
            continue
        key = re.sub(r"\W+", " ", title_en.lower()).strip()
        if key in seen:  # follow-up grants for the same testbed
            continue
        seen.add(key)
        aim = _clean(p.get("MalEngelska") or p.get("MalSvenska") or "")
        org = p.get("KoordinatorOrg") or ""
        url = _project_url(title, p["Diarienummer"])
        db.upsert(
            "opportunities",
            {
                "id": f"vinnova-testbed:{p['Diarienummer']}", "kind": "testbed", "source": "vinnova_projects",
                "title": title_en, "title_sv": title, "summary": aim[:900], "eligibility_text": "",
                "url": url, "apply_url": url, "published": (p.get("ProjektStart") or "")[:10], "opens": None,
                "deadline": None, "event_date": None, "location_mode": "unknown", "location": org, "audience": "",
                "budget": "", "programme": f"Vinnova-funded project, coordinator {org}, runs until {end}",
                "text": f"{title_en}. {aim}"[:4000], "fetched_at": now_iso(), "simulated": 0,
            },
            ["id"],
        )
        n += 1
    db.log("collect:vinnova_testbeds", "ok", f"{n} ongoing testbed projects")
    return n
