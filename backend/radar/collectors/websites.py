"""Collector: a member company's own public website.

Picks the home page plus the most informative internal pages (about, products,
services, projects, news, careers), politely, and stores text with URL + date."""
from __future__ import annotations

import re
from urllib.parse import urlparse

from .. import db, fetch, llm
from ..config import EXTRA_SEED_URLS

KEYWORDS = {
    3: r"om-oss|about|company|foretaget|företaget|who-we-are|vilka-vi",
    2: r"produkt|product|tjanst|tjänst|service|solution|losning|lösning|technolog|teknik|offer|erbjud",
    1: r"projekt|project|case|referens|reference|news|nyhet|press|research|forskning|innovation|partner|karriar|karriär|career|jobs",
}
SKIP = re.compile(
    r"\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|mp4)$|login|logga-in|cookie|privacy|integritet|gdpr|policy|mailto:|tel:|/tag/|/author/|wp-content|\?",
    re.I,
)
MAX_PAGES = 8
MAX_CHARS_PER_PAGE = 7000


def _domain(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def _brand(url: str) -> str:
    # techinova.se and techinova.com count as the same site
    return _domain(url).split(".")[0]


def _score(url: str, anchor: str) -> int:
    s = f"{url} {anchor}".lower()
    return max((w for w, pat in KEYWORDS.items() if re.search(pat, s)), default=0)


def crawl_company(slug: str, max_pages: int = MAX_PAGES) -> list[dict]:
    company = db.one("SELECT * FROM companies WHERE slug=?", (slug,))
    if not company or not company["website"]:
        return []
    stored: list[dict] = []
    try:
        home = fetch.get(company["website"])
    except fetch.FetchError as e:
        db.log(f"crawl:{slug}", "error", str(e))
        home = None

    queue: list[str] = []
    if home:
        brand = _brand(home["final_url"])
        cands = []
        for url, anchor in fetch.links(home["html"], home["final_url"]):
            if _brand(url) != brand or SKIP.search(url):
                continue
            sc = _score(url, anchor)
            if sc:
                cands.append((sc, len(url), url))
        cands.sort(key=lambda t: (-t[0], t[1]))
        queue = [home["final_url"]] + [u for _, _, u in cands]
    queue = list(dict.fromkeys(EXTRA_SEED_URLS.get(slug, []) + queue))[: max_pages + 4]

    for url in queue:
        if len(stored) >= max_pages:
            break
        try:
            page = home if home and url == home["final_url"] else fetch.get(url)
        except fetch.FetchError:
            continue
        text = fetch.extract_text(page["html"], page["final_url"])[:MAX_CHARS_PER_PAGE]
        if len(text) < 200:
            continue
        rec = {
            "url": page["final_url"], "company_slug": slug, "kind": "website", "title": fetch.title_of(page["html"]),
            "text": text, "fetched_at": page["fetched_at"], "simulated": 0,
            # Web text is data, never instructions: score it for injected instructions.
            "injection_score": llm.injection_score(text),
        }
        db.upsert("pages", rec, ["url"])
        stored.append(rec)
    stored += _wikipedia(slug)
    db.log(f"crawl:{slug}", "ok", f"{len(stored)} pages")
    return stored


# Large groups: an encyclopedic reference complements their (often bot-protected) sites.
WIKIPEDIA_TITLES = {"ericsson": "Ericsson", "saab": "Saab_AB"}


def _wikipedia(slug: str) -> list[dict]:
    title = WIKIPEDIA_TITLES.get(slug)
    if not title:
        return []
    # Wikipedia's robots.txt disallows /w/api.php for crawlers, so read the article page itself.
    url = f"https://en.wikipedia.org/wiki/{title}"
    try:
        raw = fetch.get(url)
    except fetch.FetchError as e:
        db.log(f"crawl:{slug}:wikipedia", "error", str(e))
        return []
    text = fetch.extract_text(raw["html"], url)[: MAX_CHARS_PER_PAGE * 2]
    rec = {
        "url": url, "company_slug": slug, "kind": "reference",
        "title": f"{title.replace('_', ' ')} – Wikipedia", "text": text, "fetched_at": raw["fetched_at"],
        "simulated": 0, "injection_score": llm.injection_score(text),
    }
    db.upsert("pages", rec, ["url"])
    return [rec]
