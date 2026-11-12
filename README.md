# Radar — Virtual Science Park for Blue Science Park

AI agents that build an evidence-backed profile of each Blue Science Park member from public sources,
watch Swedish and EU funding, ecosystem events and Karlskrona testbeds, and explain — with a source
link and date on every claim — why an opportunity matters to that company.

Built for the BUILD Hackathon 2026 (Karlskrona), challenge "Virtual Science Park" by Blue Science Park.
Prototype, not an official Blue Science Park service.

## What it does

| Brief requirement | Where in Radar |
|---|---|
| Baseline profiles for ≥3 companies from public sources | 5 members profiled (Techinova, Ocean Harvesting, EmbeddedArt, Ericsson, Saab); any of the 56 can be profiled on demand from **Members** |
| Evidence; facts vs inferred interests | Every statement is *fact* (verbatim quote + link + retrieval date) or *inferred* (with reasoning). The **Verifier** checks every quote word-for-word and downgrades unsupported “facts”. “Possible interests” are always inferred |
| Review and refine a profile | **Profile** tab: confirm, edit, reject, add priorities. Edits are private, versioned, and re-rank the feed instantly |
| ≥2 public opportunity sources | Vinnova open data API, EU Funding & Tenders API, Blue Science Park + Tech Concept Lab events (WordPress APIs), Almi Blekinge, NetPort, Marine Technology Center testbeds |
| Different rankings per profile | Mean top-10 overlap between the five members is ~8% (see **Trust & limits**) |
| Source links and dates | On every claim, opportunity and chat citation |
| Relevant / unrelated / override requests | 3-layer **Guard**; live console and a 14-case boundary suite on **Trust & limits** |
| Label simulated data | Simulated login and the simulated test company are labelled everywhere |

Beyond the brief: requirement check per match (likely met / unknown / likely not met), transparent score
breakdown, feedback that re-ranks similar items, calendar export, member-to-member partner suggestions
from public data only, profile timeline, an ecosystem radar of all 56 members, and a planted
prompt-injection test proving that web text is treated as data.

## Agents

| Agent | Model | Job |
|---|---|---|
| Collector | code | Fetches sources politely (robots.txt, rate limit, cache); stores URL + retrieval time |
| Profiler | gpt-oss-120b | Profile with fact/inferred labels, quotes, missing information |
| Verifier | code | Quote must appear in the saved source, otherwise downgraded to inferred |
| Scouts | gpt-oss-20b + APIs | Funding, events, testbeds; dates validated in code |
| Matcher | multilingual embeddings + gpt-oss-120b | Transparent ranking; LLM only explains top matches |
| Connector | gpt-oss-120b | Partner suggestions from public data; never assumes interest |
| Guard | Llama Prompt Guard 2 + rules + gpt-oss-20b | Scope / unclear / unrelated / override / needs human / private data |
| Concierge | gpt-oss-120b | Cited answers from the user's own profile and public data only |
| Watcher | scheduled | Re-reads public pages, keeps the company's decisions, records changes |

Boundaries are enforced in code, not only in prompts: the Concierge's context contains only the
signed-in company's profile, public opportunities and public member descriptions.

## Setup (Windows, macOS, Linux)

Requirements: Python 3.10+, Node.js 20+, a Groq API key.

```bash
# 1. Secrets: create .env in the project root
echo GROQ_API_KEY=your_key_here > .env

# 2. Backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip
.venv/Scripts/python -m radar.pipeline all          # collect sources, profile, match (~5 min)
.venv/Scripts/python -m radar.evals                 # quality & boundary report
.venv/Scripts/python -m uvicorn radar.api:app --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                                          # http://localhost:3000
```

The first run downloads a ~220 MB multilingual embedding model into `data/models/`.
`data/radar.db` (SQLite) holds everything; delete it to start over.

Useful commands:

```bash
python -m radar.pipeline collect   # refresh sources only
python -m radar.pipeline match     # re-rank and re-explain
python -m radar.pipeline watch     # Watcher: re-crawl, re-profile, keep user edits
python -m pytest tests             # offline unit tests
```

Set `RADAR_TODAY=2026-11-14` to freeze "today" for a demo.

## Data sources (all public)

- Blue Science Park — member list, member pages, events (`bluesciencepark.se`, WordPress API)
- Vinnova — open calls and application rounds (`data.vinnova.se/api`)
- European Commission — EU Funding & Tenders search API (public key `SEDIA`)
- Tech Concept Lab — events (WordPress API); Almi Blekinge and NetPort event pages
- Marine Technology Center of Sweden — testbed register (WordPress API)
- Member websites; Wikipedia articles for the two large groups

See `SOURCES.md` for endpoints and notes.

## Known limitations

- Some sites block automated reading (ericsson.com behind Cloudflare; RISE/Testbed Sweden). Radar does not bypass blocks.
- Requirement checks are indicative; eligibility is decided by the funder.
- Regional events are sparse in machine-readable form; funding coverage is much deeper than events.
- Login is simulated. Production: Blue Science Park SSO, per-company access control, audit log.
- Swecris (research projects) and Bolagsverket (company register) need registration and are not yet connected.

## Next steps

1. Postgres + pgvector, a scheduler for the Watcher and Scouts, and SSO.
2. Weekly digest e-mail per member; staff dashboard of shared interests across members.
3. Consortium builder: for a call that needs partners, propose members + BTH researchers (OpenAlex/DiVA) with evidence.
4. More sources: Swecris, Bolagsverket, JobTech hiring signals, TED public procurement for pilot customers.
5. Human evaluation of profile accuracy with member companies; feedback-trained ranking.
