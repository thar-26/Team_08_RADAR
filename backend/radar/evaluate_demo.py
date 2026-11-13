"""Write docs/EVALUATION.md: the top recommendations for three small demo
companies with their sources, dates and checks, plus a profile-refinement test.

    python -m radar.evaluate_demo

The refinement test runs on a temporary copy of the database, so real profiles
are never changed. The "Team assessment" column is left empty on purpose: it is
for people to fill in, not for Radar to grade itself."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

from .config import DB_PATH, ROOT, today

COMPANIES = {
    "ocean-harvesting": "wave energy storage and the sea trials for its next device",
    "techinova": "demand flexibility and electricity grid automation pilots",
    "3d-vision": "digital twins and 3D visualisation for industry",
}
REFINE = {  # a priority a representative might add, to see the ranking move
    "ocean-harvesting": "We want to test our next wave energy device at an offshore test site in 2027.",
    "techinova": "Our priority is EU funding for grid flexibility pilots with energy companies.",
    "3d-vision": "We are looking for events about digital twins and AI for industry.",
}
OUT = ROOT / "docs" / "EVALUATION.md"


def _top(slug: str, n: int = 5) -> list[dict]:
    from . import api, db
    from .agents import matcher

    items = api.feed(slug, lang="en", user=None)[:n]
    rows = []
    for i in items:
        o = i["opportunity"]
        d = o.get("deadline") or o.get("event_date")
        expired = bool(d and date.fromisoformat(d[:10]) < today())
        elig = (o.get("eligibility_text") or "").strip()
        rows.append({
            "rank": i["rank"], "fit": i["fit"], "level": i["level"], "kind": o["kind"], "title": o["title"],
            "url": o["url"], "date": d or "no deadline", "expired": expired,
            "eligibility": "stated" if elig else "not stated in source",
            "sme_conflict": i["components"].get("eligibility_conflict", 0) < 0,
            "matcher": (i["explanation"] or {}).get("relevance", "not explained"),
            "missing": ", ".join(m.split(".")[1] for m in i["missing"]) or "-",
        })
    _ = matcher, db
    return rows


def _refinement(slug: str) -> dict:
    """Add one priority in a throw-away copy of the database and compare the top 10."""
    tmp = Path(tempfile.mkdtemp(prefix="radar-eval-")) / "radar.db"
    shutil.copy(DB_PATH, tmp)
    code = (
        "import json\n"
        "from radar import db\n"
        "from radar.agents import matcher, profiler\n"
        "from radar.api_support import apply_edit\n"
        f"slug, text = {slug!r}, {REFINE[slug]!r}\n"
        "before = [r['opp_id'] for r in matcher.rank(slug)][:10]\n"
        "c = db.one('SELECT profile FROM companies WHERE slug=?', (slug,))\n"
        "p, _ = apply_edit(db.loads(c['profile']), 'add', None, {'statement': text, 'section': 'priorities'}, editor={'name': 'evaluation'})\n"
        "profiler.save_profile(slug, p, author='user', note='evaluation')\n"
        "matcher._CACHE.clear()\n"
        "after = [r['opp_id'] for r in matcher.rank(slug)][:10]\n"
        "titles = {o['id']: o['title'] for o in db.rows('SELECT id, title FROM opportunities')}\n"
        "print(json.dumps({'before': [titles[i] for i in before], 'after': [titles[i] for i in after], "
        "'changed': len(set(after) - set(before))}))\n"
    )
    env = dict(os.environ, RADAR_DB=str(tmp), PYTHONIOENCODING="utf-8")
    r = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, encoding="utf-8",
                       cwd=Path(__file__).resolve().parents[1])
    shutil.rmtree(tmp.parent, ignore_errors=True)
    if r.returncode:
        return {"error": r.stderr[-400:]}
    import json

    return json.loads(r.stdout.strip().splitlines()[-1])


def main() -> None:
    lines = [
        "# Recommendation evaluation (demo companies)",
        "",
        f"Generated {today().isoformat()} by `python -m radar.evaluate_demo` from the live data.",
        "Three smaller Karlskrona members in different sectors. **Team assessment** is for the team (or a member",
        "company) to fill in after reading each opportunity; Radar does not grade itself. The Matcher column is the",
        "model's own reading and is shown only for comparison.",
        "",
    ]
    tops = {}
    for slug, focus in COMPANIES.items():
        rows = _top(slug)
        tops[slug] = {r["title"] for r in _top(slug, 10)}
        lines += [f"## {slug} ({focus})", "",
                  "| # | Fit | Type | Opportunity | Date | Source | Eligibility | Matcher | Missing | Team assessment |",
                  "|---|---|---|---|---|---|---|---|---|---|"]
        for r in rows:
            flag = " ⚠ expired" if r["expired"] else ""
            sme = " ⚠ SME-only" if r["sme_conflict"] else ""
            lines.append(f"| {r['rank']} | {r['fit']} {r['level']} | {r['kind']} | {r['title'][:70]} | {r['date']}{flag} | "
                         f"[link]({r['url']}) | {r['eligibility']}{sme} | {r['matcher']} | {r['missing']} | |")
        ref = _refinement(slug)
        lines += ["", f"**Refinement test.** Added the priority “{REFINE[slug]}” (on a copy of the database).", ""]
        if "error" in ref:
            lines.append(f"Could not run: `{ref['error'][:200]}`")
        else:
            lines.append(f"{ref['changed']} of the top 10 changed. New top 3: " + "; ".join(ref["after"][:3]) + ".")
        lines += ["", "Limitations: " + "testbed availability is never confirmed; eligibility is indicative; "
                  "the score weights are provisional.", ""]
    names = list(tops)
    lines += ["## Different companies, different lists", "", "| Pair | Shared items in top 10 |", "|---|---|"]
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            lines.append(f"| {a} / {b} | {len(tops[a] & tops[b])} |")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
