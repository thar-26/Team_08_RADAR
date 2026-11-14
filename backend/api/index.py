"""Entry point for the online demo on Vercel (Python serverless function).

Vercel's file system is read-only except /tmp, so on a cold start the cleaned demo
database (deploy/radar-demo.db) and the logos are copied to /tmp and Radar runs in
online-demo mode. Changes made online live only until the next cold start.
Secrets (GROQ_API_KEY etc.) come from the Vercel project's settings, never from git."""
import os
import shutil
import sys
from pathlib import Path

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
from radar.api import app  # noqa: E402  (after the environment is set)

__all__ = ["app"]
