"""Logos: member logos from Blue Science Park's own member directory, and the
site icon of each funder, organiser and testbed operator.

Images are downloaded once into data/logos/ and served by the API, so pages do
not hot-link other sites. Logos are shown only to identify the organisation."""
from __future__ import annotations

import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx

from .. import db
from ..config import DATA, USER_AGENT, now_iso

LOGOS = DATA / "logos"
BSP_MEMBERS = "https://www.bluesciencepark.se/wp-json/wp/v2/medlem?per_page=100&_fields=slug,featured_media"
BSP_MEDIA = "https://www.bluesciencepark.se/wp-json/wp/v2/media"
EXT = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/svg+xml": "svg",
       "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico", "image/gif": "gif"}
HEADERS = {"User-Agent": USER_AGENT}


def init() -> None:
    db.execute("CREATE TABLE IF NOT EXISTS logos (key TEXT PRIMARY KEY, file TEXT, source_url TEXT, fetched_at TEXT)")


def _save(key: str, url: str, client: httpx.Client) -> bool:
    try:
        r = client.get(url)
    except httpx.HTTPError:
        return False
    ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
    if ctype not in EXT:  # some servers send no type: go by the file name
        ext = Path(urlparse(url).path).suffix.lower().lstrip(".")
        ctype = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp",
                 "svg": "image/svg+xml", "ico": "image/x-icon", "gif": "image/gif"}.get(ext, ctype)
    if r.status_code != 200 or ctype not in EXT or len(r.content) < 100 or len(r.content) > 3_000_000:
        return False
    LOGOS.mkdir(parents=True, exist_ok=True)
    for old in LOGOS.glob(f"{key}.*"):
        old.unlink()
    path = LOGOS / f"{key}.{EXT[ctype]}"
    path.write_bytes(r.content)
    path = trim(path)  # remove empty borders so the logo fills its space
    db.upsert("logos", {"key": key, "file": path.name, "source_url": url, "fetched_at": now_iso()}, ["key"])
    return True


def collect_member_logos() -> int:
    """Each member's logo as published in Blue Science Park's member directory."""
    init()
    n = 0
    with httpx.Client(headers=HEADERS, timeout=30, follow_redirects=True) as client:
        try:
            members = client.get(BSP_MEMBERS).json()
        except (httpx.HTTPError, ValueError) as e:  # site down: keep the logos we already have
            db.log("collect:logos", "error", str(e)[:200])
            return 0
        ids = {m["featured_media"]: m["slug"] for m in members if m.get("featured_media")}
        media = client.get(BSP_MEDIA, params={"include": ",".join(map(str, ids)), "per_page": 100,
                                              "_fields": "id,source_url,media_details"}).json()
        for m in media:
            sizes = (m.get("media_details") or {}).get("sizes") or {}
            urls = [(sizes.get(k) or {}).get("source_url") for k in ("medium", "thumbnail")] + [m["source_url"]]
            if any(_save(f"member-{ids[m['id']]}", u, client) for u in urls if u):
                n += 1
            time.sleep(0.3)  # be polite to the park's server
        # Members whose directory entry has no usable image: the logo on their member page.
        have = known()
        for m in members:
            if f"member-{m['slug']}" in have:
                continue
            try:
                html = client.get(f"https://www.bluesciencepark.se/medlem/{m['slug']}/").text
            except httpx.HTTPError:
                continue
            og = re.search(r"""<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)""", html)
            if og and "Blue-Science-Park" not in og.group(1) and _save(f"member-{m['slug']}", og.group(1), client):
                n += 1
            time.sleep(0.3)
    db.log("collect:logos", "ok", f"{n} member logos")
    return n


def host_key(url: str) -> str:
    host = urlparse(url or "").netloc.lower()
    return "src-" + (host[4:] if host.startswith("www.") else host)


def _icon_url(home: str, client: httpx.Client) -> list[str]:
    """Candidate icons for a site: its declared icons (largest first), then /favicon.ico."""
    out = []
    try:
        html = client.get(home).text
        tags = re.findall(r"<link\b[^>]*>", html, re.I)
        found = []
        for tag in tags:
            rel = re.search(r'rel=["\']([^"\']+)["\']', tag, re.I)
            href = re.search(r'href=["\']([^"\']+)["\']', tag, re.I)
            if rel and href and "icon" in rel.group(1).lower():
                size = re.search(r'sizes=["\'](\d+)x', tag, re.I)
                big = "apple-touch" in rel.group(1).lower()
                found.append((int(size.group(1)) if size else (180 if big else 32), urljoin(home, href.group(1))))
        out = [u for _, u in sorted(found, reverse=True)]
    except httpx.HTTPError:
        pass
    return out + [urljoin(home, "/favicon.ico")]


def collect_source_logos() -> int:
    """The site icon of every organisation an opportunity comes from."""
    init()
    homes = set()
    for o in db.rows("SELECT url FROM opportunities"):
        p = urlparse(o["url"] or "")
        if p.scheme and p.netloc:
            homes.add(f"{p.scheme}://{p.netloc}/")
    n = 0
    with httpx.Client(headers=HEADERS, timeout=20, follow_redirects=True) as client:
        for home in sorted(homes):
            key = host_key(home)
            if (LOGOS / key).with_suffix(".png").exists() or list(LOGOS.glob(f"{key}.*")):
                n += 1
                continue
            for url in _icon_url(home, client):
                if _save(key, url, client):
                    n += 1
                    break
            time.sleep(0.3)
    db.log("collect:logos", "ok", f"{n} source logos")
    return n


def key_for_url(url: str, have: set[str] | None = None) -> str | None:
    """Logo key for an organisation's URL; data.vinnova.se falls back to vinnova.se."""
    have = have if have is not None else known()
    host = host_key(url)[4:]
    parts = host.split(".")
    for i in range(len(parts) - 1):
        k = "src-" + ".".join(parts[i:])
        if k in have:
            return k
    return None


def path_for(key: str) -> Path | None:
    init()
    row = db.one("SELECT file FROM logos WHERE key=?", (key,))
    p = LOGOS / row["file"] if row else None
    return p if p and p.exists() else None


def known() -> set[str]:
    init()
    return {r["key"] for r in db.rows("SELECT key FROM logos")}


def trim(path: Path) -> Path:
    """Crop the empty border (transparent or white) around a logo, so a small logo on a
    big canvas fills its space. Raster images only; SVGs are left as they are."""
    from PIL import Image

    if path.suffix.lower() == ".svg":
        return path
    try:
        im = Image.open(path)
        im.load()
    except Exception:  # noqa: BLE001 - unreadable image: keep it as it is
        return path
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 24 and not (r > 238 and g > 238 and b > 238):
                xs.append(x)
                ys.append(y)
    if not xs:
        return path
    box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    if (box[2] - box[0]) * (box[3] - box[1]) > 0.9 * w * h:
        return path  # already tight
    m = max(2, int(0.06 * max(box[2] - box[0], box[3] - box[1])))
    box = (max(0, box[0] - m), max(0, box[1] - m), min(w, box[2] + m), min(h, box[3] + m))
    out = path.with_suffix(".png")
    im.crop(box).save(out)
    if out != path:
        path.unlink()
    return out


def trim_all() -> int:
    """Trim every stored logo and record the new file names."""
    init()
    n = 0
    for row in db.rows("SELECT key, file FROM logos"):
        p = LOGOS / row["file"]
        if p.exists():
            q = trim(p)
            if q.name != row["file"]:
                db.execute("UPDATE logos SET file=? WHERE key=?", (q.name, row["key"]))
                n += 1
    return n
