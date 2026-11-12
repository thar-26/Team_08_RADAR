"""Polite HTTP fetching: robots.txt, per-host rate limit, on-disk cache,
and main-text extraction. Every page is stored with its URL and retrieval time."""
from __future__ import annotations

import hashlib
import json
import time
import urllib.robotparser
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura
from bs4 import BeautifulSoup

from .config import CACHE, REQUEST_DELAY_S, USER_AGENT, now_iso

_client = httpx.Client(
    timeout=30,
    follow_redirects=True,
    headers={"User-Agent": USER_AGENT, "Accept-Language": "sv,en;q=0.8"},
)
_robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
_last_hit: dict[str, float] = {}


class FetchError(Exception):
    pass


def _allowed(url: str) -> bool:
    p = urlparse(url)
    base = f"{p.scheme}://{p.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            r = _client.get(base + "/robots.txt", timeout=15)
            rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            _robots[base] = rp
        except httpx.HTTPError:
            _robots[base] = None  # unreachable robots.txt: treat as allowed
    rp = _robots[base]
    return True if rp is None else rp.can_fetch(USER_AGENT, url)


def _throttle(url: str) -> None:
    host = urlparse(url).netloc
    wait = REQUEST_DELAY_S - (time.time() - _last_hit.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    _last_hit[host] = time.time()


def get(url: str, *, use_cache: bool = True) -> dict:
    """Return {url, final_url, status, html, fetched_at}. Cached on disk."""
    key = hashlib.sha256(url.encode()).hexdigest()[:24]
    path = CACHE / f"{key}.json"
    if use_cache and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    if not _allowed(url):
        raise FetchError(f"robots.txt disallows {url}")
    _throttle(url)
    try:
        r = _client.get(url)
    except httpx.HTTPError as e:
        raise FetchError(f"{type(e).__name__} for {url}") from e
    if r.status_code >= 400:
        raise FetchError(f"HTTP {r.status_code} for {url}")
    data = {
        "url": url,
        "final_url": str(r.url),
        "status": r.status_code,
        "html": r.text,
        "fetched_at": now_iso(),
    }
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def render(url: str, *, use_cache: bool = True, wait_ms: int = 1500) -> dict:
    """Like get(), but runs the page's JavaScript in a headless browser first —
    for calendars that only build their event lists in the browser.
    Same rules: robots.txt, per-host delay, on-disk cache."""
    key = "r-" + hashlib.sha256(url.encode()).hexdigest()[:24]
    path = CACHE / f"{key}.json"
    if use_cache and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    if not _allowed(url):
        raise FetchError(f"robots.txt disallows {url}")
    _throttle(url)
    from playwright.sync_api import Error as PWError, sync_playwright

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_context(user_agent=USER_AGENT, locale="sv-SE").new_page()
            resp = page.goto(url, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(wait_ms)
            data = {
                "url": url, "final_url": page.url, "status": resp.status if resp else 0,
                "html": page.content(), "text": page.inner_text("body"), "fetched_at": now_iso(),
            }
            browser.close()
    except PWError as e:
        raise FetchError(f"render failed for {url}: {e}") from e
    if data["status"] >= 400:
        raise FetchError(f"HTTP {data['status']} for {url}")
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def extract_text(html: str, url: str = "") -> str:
    text = trafilatura.extract(html, url=url or None, include_comments=False, include_tables=True, favor_recall=True)
    if not text:
        soup = BeautifulSoup(html, "lxml")
        for t in soup(["script", "style", "noscript", "nav", "footer", "header"]):
            t.decompose()
        text = soup.get_text(" ", strip=True)
    return text or ""


def title_of(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    t = soup.find("title")
    return (t.get_text(strip=True) if t else "")[:200]


def links(html: str, base_url: str) -> list[tuple[str, str]]:
    """(absolute_url, anchor_text) for every <a href>, same order, de-duplicated."""
    soup = BeautifulSoup(html, "lxml")
    seen, out = set(), []
    for a in soup.find_all("a", href=True):
        href = urljoin(base_url, a["href"]).split("#")[0]
        if href.startswith("http") and href not in seen:
            seen.add(href)
            out.append((href, a.get_text(" ", strip=True)[:120]))
    return out
