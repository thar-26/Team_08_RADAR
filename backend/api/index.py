"""Entry point for the online demo on Vercel (Python serverless function).

Vercel's file system is read-only except /tmp, so on a cold start the cleaned demo
database (deploy/radar-demo.db) and the logos are copied to /tmp and Radar runs in
online-demo mode. Changes made online live only until the next cold start.
Secrets (GROQ_API_KEY etc.) come from the Vercel project's settings, never from git.

vercel.json sends every request to this function with the visited path in the
`__path` query parameter; the wrapper below puts it back, so Radar's routes
(/api/health, /api/companies, ...) work exactly as they do locally."""
import os
import shutil
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

HERE = Path(__file__).resolve().parent.parent  # the backend folder
DATA = Path("/tmp/radar-data")

os.environ.setdefault("RADAR_HOSTED_DEMO", "1")
os.environ.setdefault("RADAR_DATA", str(DATA))
os.environ.setdefault("RADAR_DB", str(DATA / "radar.db"))

DATA.mkdir(parents=True, exist_ok=True)
if not (DATA / "radar.db").exists():
    shutil.copy(HERE / "deploy" / "radar-demo.db", DATA / "radar.db")
if not (DATA / "logos").exists() and (HERE / "deploy" / "logos").exists():
    shutil.copytree(HERE / "deploy" / "logos", DATA / "logos")

sys.path.insert(0, str(HERE))
from radar.api import app as radar_app  # noqa: E402  (after the environment is set)


async def app(scope, receive, send):
    """Restore the visited path from `__path` before Radar routes the request."""
    if scope.get("type") == "http":
        query = parse_qsl(scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True)
        visited = next((v for k, v in query if k == "__path"), None)
        if visited is not None:
            path = "/" + visited.lstrip("/")
            rest = urlencode([(k, v) for k, v in query if k != "__path"])
            scope = dict(scope, path=path, raw_path=path.encode("utf-8"), query_string=rest.encode("latin-1"))
    await radar_app(scope, receive, send)
