# Radar: a Virtual Science Park for Blue Science Park

AI agents that build an evidence-backed profile of each Blue Science Park member from public sources,
watch Swedish and EU funding, events and testbeds, and explain, with a source link and date on every
claim, why an opportunity matters to that company and how well it fits (an indicative 1–10 score).

Built for the BUILD Hackathon 2026 (Karlskrona, 13–15 November), challenge "Virtual Science Park" by
Blue Science Park. A prototype from the hackathon, not an official Blue Science Park service.

## What was built when

| | What |
|---|---|
| **Before the hackathon** (12 Nov, team kick-off and practice, allowed by the organisers) | Data collection, the ten agents, member profiles with fact/inferred labels and verification, ranking, the Concierge and Guard, Swedish/English interface in Blue Science Park's visual language, email alerts, profile corrections with Google sign-in, Bolagsverket company facts, Postgres support |
| **During the hackathon** (from 13 Nov) | Explainable 1–10 fit score with reasons and missing information; national testbeds (Vinnova open data + a hand-verified list); member search by expertise and cross-company Concierge questions; event filters by region, city and format; weekly digest with a scheduler and rehearsal safety; evidence page (team relevance ratings, measured model usage); two new safety tests; demo reset command; faster page loads |
| **Reused, not built by us** | Open-source libraries (FastAPI, Next.js, Auth.js, fastembed, Playwright, trafilatura), hosted models on Groq (gpt-oss-120b/20b, Llama Prompt Guard 2), a multilingual embedding model, public APIs and data (below), Blue Science Park's colours and typography as a visual reference |

## What it does

| Brief requirement | Where in Radar |
|---|---|
| Baseline profiles for ≥3 companies from public sources | 6 members profiled (Techinova, Ocean Harvesting, EmbeddedArt, Ericsson, Saab, 3D Vision); staff can profile any of the 56 |
| Evidence; facts vs inferred interests | Every statement is *fact* (verbatim quote + link + retrieval date) or *inferred* (with reasoning). The **Verifier** checks every quote word for word. Bolagsverket registry facts are labelled as such |
| Review and refine a profile | **Profile** tab: a signed-in member of the company (or park staff) can confirm, edit, mark outdated or add priorities. Who and when is recorded; the feed re-ranks |
| ≥2 public opportunity sources | Vinnova, EU Funding & Tenders, event calendars (Vinnova, BTH, AI Sweden, Region Blekinge, SISP, Blue Science Park, Tech Concept Lab, Almi, NetPort), MTC testbeds, national testbeds |
| Different rankings per profile | Mean top-10 overlap between members is low (see **Quality & safety**) |
| Source links and dates | On every claim, opportunity and chat citation |
| Relevant / unrelated / override requests | 3-layer **Guard**; 17-case boundary suite incl. staff impersonation and a hidden instruction in a pasted document |
| Label simulated data | The simulated test company and preview-only emails are labelled |

### The fit score (1–10)

Each opportunity gets an **indicative** score, not a probability. Five factors, each 0–1, with
provisional weights to calibrate with park staff:

| Factor | Weight | From |
|---|---|---|
| Technology & industry | 35% | Embedding similarity of the opportunity to the profile and its closest statement |
| Company priorities | 25% | What the company itself confirmed or added (neutral when nothing is stated) |
| Eligibility | 20% | E.g. SME-only calls for large companies; missing eligibility text |
| Geography | 10% | National/EU calls and online events count as reachable; in-person events by region |
| Timing | 10% | Days to the deadline or event |

Technical fit gates the rest, so a nearby event that has nothing to do with the company stays low.
Where the Matcher has read the full texts, its strong/possible/weak judgement is 30% of the final
score. Labels: strong ≥ 7.0, possible ≥ 4.5. Every card shows **Why this match?** in plain language
(tied to a profile statement and its basis) and **Missing or uncertain** information. The feed shows
the top 10 with "show more".

### More

- **National testbeds**: Testbed Sweden and ri.se refuse automated access, so Radar does not read them.
  It uses Vinnova open data (ongoing, publicly funded testbed projects) and 8 testbeds checked by hand
  against their official pages (`data/national_testbeds.json`, labelled "Manually verified").
  Availability is never confirmed.
- **Collaboration**: search members by expertise on **Members**; the Concierge answers questions such
  as "Which members could collaborate with us on marine sensor technology?" from public descriptions
  only and states that no one has agreed to anything. Partner cards link to the partner's Radar profile.
- **Events**: filters by region (Blekinge, Stockholm, Västra Götaland, Skåne, elsewhere in Sweden,
  abroad, online, unknown), city and format. Unknown locations are shown as such.
- **Weekly digest** (Notifier): instant or weekly, manual "send now", unsubscribe link, preview of
  every email, a database lock against duplicate sending.
- **Evidence** (`/evidence`): the team rates the top 10 for demo companies (hit rate), and every model
  call is logged with tokens and time. No prices are invented.

## Sign-in, roles and privacy

- **Start screen (simulated):** on the first visit Radar asks whether you are Blue Science Park or a member
  company and opens that view. This is a simulation for the demo: it grants no rights. The header shows the
  simulated view and lets you switch.
- **Real sign-in (Google)** is needed to change a profile or see a company's private data. Blue Science Park
  staff are the addresses in `RADAR_STAFF_EMAILS` and can see and edit everything and approve access requests
  (Account page). Company access is granted automatically only for the exact email domain of the company's
  website (or an approved alias, e.g. saabgroup.com for Saab); anything else is a request staff approve.
- **Private by default:** priorities a company adds, its saved items, feedback, alerts, email previews and
  chats are only shown to its signed-in members and staff (enforced in the API, tested in
  `backend/tests/test_privacy.py`). A company can choose to make an added priority public.
- **Two simulated views with their own features:**
  - *Blue Science Park*: **Park overview** (`/park`): each profiled member's strong and possible matches,
    nearest deadline and best match, plus **Who does this opportunity fit?**: pick a call, event or testbed,
    see the members it fits best (same 1–10 score) and **Send tip**.
  - *Member company*: **My radar** in the menu, **This week and next** (its upcoming deadlines and events)
    and **Tips from Blue Science Park** on its page. Tips are simulated: shown in Radar, no email is sent.
- **Anyone** can profile a member that has no profile yet (public sources only); rebuilding an existing
  profile is for the company or staff.

## Agents

| Agent | Model | Job |
|---|---|---|
| Collector | code | Fetches sources politely (robots.txt, rate limit, cache); stores URL + retrieval time |
| Profiler | gpt-oss-120b | Profile with fact/inferred labels, quotes, missing information |
| Verifier | code | Quote must appear in the saved source, otherwise downgraded to inferred |
| Scouts | gpt-oss-20b + APIs | Funding, events, testbeds; dates validated in code |
| Matcher | embeddings + gpt-oss-120b | 1–10 fit score with reasons; LLM explains the top matches |
| Connector | embeddings + gpt-oss-120b | Member search and partner suggestions from public data |
| Guard | Llama Prompt Guard 2 + rules + gpt-oss-20b | Relevant / unclear / unrelated / override / needs human / private data |
| Concierge | gpt-oss-120b | Cited answers from the company's own profile and public data only |
| Watcher | scheduled | Re-reads public pages, keeps the company's decisions, records changes |
| Notifier | code + SMTP | Instant alerts or weekly digest, deadline reminders |

Boundaries are enforced in code, not only in prompts: the Concierge's context contains only the
company's own profile, public opportunities and public member descriptions.

## Setup

Requirements: Python 3.10+, Node.js 20+, a Groq API key. All secrets live in `.env` in the project
root (never commit it).

```bash
# Backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip
.venv/Scripts/python -m playwright install chromium
.venv/Scripts/python -m radar.pipeline all          # collect, profile, match
.venv/Scripts/python -m uvicorn radar.api:app --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev                                          # http://localhost:3000
```

`.env` settings:

| Key | Purpose |
|---|---|
| `GROQ_API_KEY` | Models (required) |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Sign-in for profile corrections |
| `RADAR_STAFF_EMAILS` | Comma-separated staff addresses that may edit any profile |
| `BOLAGSVERKET_CLIENT_ID`, `BOLAGSVERKET_CLIENT_SECRET` | Company register facts |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_FROM`, `RADAR_APP_URL` | Real email sending |
| `RADAR_MAIL_ALLOWLIST` | **Set this for rehearsals**: only these addresses get real email, all others get a preview |
| `RADAR_SCHEDULER=1`, `RADAR_SCHEDULER_MINUTES=60` | Send digests automatically while the API runs |
| `DATABASE_URL` | Use Postgres instead of SQLite |
| `RADAR_TODAY` | Freeze "today" for a demo, e.g. `2026-11-14` |

## Useful commands

On Windows, double-click `start-radar.bat` to start the API and the website and open the browser.

```bash
python -m radar.pipeline collect       # refresh all sources (incl. national testbeds)
python -m radar.pipeline match         # re-rank and re-explain
python -m radar.evals                  # quality & boundary report
python -m radar.reset_demo --save      # save the current state as the demo snapshot
python -m radar.reset_demo             # back to the snapshot between rehearsals (safe while the API runs)
python -m pytest tests                 # offline tests (use a throw-away database)
NEXT_DIST_DIR=.next-build npx next build   # production build next to a running dev server
```

`reset_demo` keeps caches, measured model usage and the team's relevance ratings.

## Data sources (all public)

Blue Science Park (members, events), member websites, Wikipedia (Ericsson, Saab), Bolagsverket
(company register), Vinnova open data (calls and funded projects), EU Funding & Tenders, event
calendars (see above), Marine Technology Center of Sweden, and the hand-verified national testbed list.
See `SOURCES.md`.

## Known limits

- Some sites block automated reading (ericsson.com, ri.se, Testbed Sweden). Radar does not bypass blocks.
- The fit score and its weights are provisional and not yet calibrated with staff or members.
- Requirement checks are indicative; eligibility is decided by the funder. Testbed availability is never confirmed.
- Regional events are sparse in machine-readable form; most events found are online.
- Sign-in is Google only; company membership is approved by domain match or by staff.
- The scheduler only runs while the API process runs on that machine.

## Next steps

1. Calibrate the score weights with Blue Science Park staff using the evidence page.
2. Blue Science Park's own sign-in and member register instead of Google + domain matching.
3. Hosted deployment with Postgres and a proper job scheduler.
4. Consortium builder: members + BTH researchers for calls that need partners.
5. More sources: Swecris, JobTech hiring signals, TED public procurement.

**First rollout step:** run Radar for 5–10 volunteer members for one month, with weekly digests
and a staff member reviewing the top 10 each week on the evidence page.

**Biggest risk:** trust. If a member gets a few confidently wrong suggestions or a profile with a
wrong fact, they stop reading. That is why every claim has a source, every score shows its reasons
and missing information, and members can correct their own profile.
