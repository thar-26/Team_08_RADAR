"""Collector: Blue Science Park member list and member pages."""
from __future__ import annotations

import csv
import re

from .. import db, fetch
from ..config import DATA, DEMO_COMPANIES, now_iso

MEMBER_API = "https://www.bluesciencepark.se/wp-json/wp/v2/medlem?per_page=100&_fields=slug,title,link,modified"
_SITE_CHROME = re.compile(r"bluesciencepark|cookiedatabase|gmpg|wordpress|linkedin\.com/company/blue-science")


def refresh_member_list() -> int:
    """Fetch the official member list and each member page; store companies + page text."""
    import json

    data = fetch.get(MEMBER_API, use_cache=False)
    members = json.loads(data["html"])
    pages: dict[str, dict] = {}
    for m in members:
        try:
            pages[m["slug"]] = fetch.get(m["link"])
        except fetch.FetchError:
            pages[m["slug"]] = {"html": "", "fetched_at": now_iso(), "final_url": m["link"]}
    # Links that appear on many member pages are site navigation, not the member's website.
    from collections import Counter

    per_page = {s: [u for u, _ in fetch.links(p["html"], p["final_url"])] for s, p in pages.items()}
    freq = Counter(u for us in per_page.values() for u in set(us))
    for m in members:
        slug = m["slug"]
        cand = [u for u in per_page[slug] if freq[u] <= 3 and not _SITE_CHROME.search(u)]
        linkedin = next((u for u in cand if "linkedin.com" in u), "")
        website = next((u for u in cand if "linkedin.com" not in u), "")
        name = re.sub(r"&#8211;", "-", m["title"]["rendered"]).replace("&amp;", "&")
        _store_company(slug, name, website, m["link"], linkedin)
        text = member_page_text(pages[slug]["html"])
        db.upsert(
            "pages",
            {
                "url": m["link"], "company_slug": slug, "kind": "bsp_member", "title": f"{name} – Blue Science Park",
                "text": text, "fetched_at": pages[slug]["fetched_at"], "simulated": 0,
            },
            ["url"],
        )
    return len(members)


FACT_LABELS = ["Bransch", "Antal anställda", "Grundat", "Ort", "Webb"]


def member_page_text(html: str) -> str:
    """Blue Science Park member page -> 'description + labelled key facts'.
    The page lists the labels first and the values after them, in the same order."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html or "", "lxml")
    for t in soup.select('[class*="cmplz"],[id*="cmplz"],script,style,noscript,nav,header,footer'):
        t.decompose()
    text = fetch.extract_text(str(soup))
    text = text.split("Hantera samtycke")[0]
    lines = [l.strip(" -\t") for l in text.splitlines() if l.strip(" -\t")]
    desc, facts = [], {}
    if any(l in FACT_LABELS for l in lines):
        first = next(i for i, l in enumerate(lines) if l in FACT_LABELS)
        desc = lines[:first]
        labels = [l for l in lines[first:] if l in FACT_LABELS]
        values = [l for l in lines[first:] if l not in FACT_LABELS][: len(labels)]
        facts = dict(zip(labels, values))
    else:
        desc = lines
    out = " ".join(desc).strip()
    if facts:
        out += "\nNyckelfakta (Blue Science Park): " + ". ".join(f"{k}: {v}" for k, v in facts.items()) + "."
    return out


def load_from_csv() -> int:
    """Offline fallback: load data/bsp_members.csv."""
    path = DATA / "bsp_members.csv"
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        _store_company(r["slug"], r["name"], r["website"], r["bsp_page"], r.get("linkedin", ""))
    return len(rows)


def _store_company(slug: str, name: str, website: str, bsp_page: str, linkedin: str) -> None:
    existing = db.one("SELECT slug FROM companies WHERE slug=?", (slug,))
    if existing:
        db.execute(
            "UPDATE companies SET name=?, website=?, bsp_page=?, linkedin=?, demo=? WHERE slug=?",
            (name, website, bsp_page, linkedin, int(slug in DEMO_COMPANIES), slug),
        )
    else:
        db.upsert(
            "companies",
            {
                "slug": slug, "name": name, "website": website, "bsp_page": bsp_page, "linkedin": linkedin,
                "demo": int(slug in DEMO_COMPANIES), "profile": None, "profile_version": 0, "updated_at": now_iso(),
            },
            ["slug"],
        )
