"""Central configuration. Everything that can change between environments lives here."""
from __future__ import annotations

import os
from datetime import date, datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]  # .../radar
DATA = ROOT / "data"
CACHE = DATA / "cache"
MODELS_DIR = DATA / "models"
DB_PATH = Path(os.getenv("RADAR_DB", DATA / "radar.db"))

load_dotenv(ROOT / ".env")
# Accept either spelling of the key name in .env.
GROQ_API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("Groq_api_key") or os.getenv("groq_api_key")

# Models (Groq). Big model for reasoning-heavy agents, small model for routing.
MODEL_REASONING = os.getenv("RADAR_MODEL_REASONING", "openai/gpt-oss-120b")
MODEL_FAST = os.getenv("RADAR_MODEL_FAST", "openai/gpt-oss-20b")
MODEL_PROMPT_GUARD = os.getenv("RADAR_MODEL_GUARD", "meta-llama/llama-prompt-guard-2-86m")
EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

# Prompt-guard probability above which text is treated as an injection attempt.
INJECTION_THRESHOLD = 0.5

USER_AGENT = "RadarPrototype/0.1 (BUILD Hackathon 2026; research prototype)"
REQUEST_DELAY_S = 1.0  # politeness delay per host

# Demo companies: three SMEs and two large members, chosen for contrast.
DEMO_COMPANIES = ["techinova", "ocean-harvesting", "embeddedart", "ericsson", "saab"]

# Extra public start pages for large companies whose global sites say little about Blekinge.
EXTRA_SEED_URLS: dict[str, list[str]] = {
    "saab": [
        "https://www.saab.com/about/company-in-brief",
        "https://www.saab.com/products/naval/naval-autonomy",
        "https://www.saab.com/products/naval/underwater-systems",
    ],
    "ericsson": [
        "https://www.ericsson.com/en/about-us/company-facts",
    ],
}

# Calendars that only build their lists in the browser: read with a headless
# browser (robots.txt checked for each). (source id, url)
RENDERED_EVENT_PAGES = [
    ("vinnova_events", "https://www.vinnova.se/kalender/"),
    ("bth", "https://www.bth.se/evenemang/"),
    ("aisweden", "https://www.ai.se/en/events"),
    ("regionblekinge", "https://regionblekinge.se/"),
    ("sisp", "https://www.sisp.se/"),
]

EVENT_PAGES = [
    "https://www.almi.se/blekinge/evenemang/",
    "https://www.netport.se/evenemang/",
]


def today() -> date:
    override = os.getenv("RADAR_TODAY")
    return date.fromisoformat(override) if override else date.today()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


for p in (DATA, CACHE, MODELS_DIR):
    p.mkdir(parents=True, exist_ok=True)
