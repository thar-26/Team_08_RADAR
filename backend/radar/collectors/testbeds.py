"""Testing-opportunities collector: the testbed register of Marine Technology
Center of Sweden (part of the Blue Science Park ecosystem), via its public
WordPress API."""
from __future__ import annotations

import html as htmllib
import json
import re

from .. import db, fetch
from ..config import now_iso

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
