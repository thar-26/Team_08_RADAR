# Radar: a Virtual Science Park for Blue Science Park

Radar helps companies in the Blue Science Park ecosystem in Karlskrona find funding, events, testbeds and
partners across Sweden and Europe. AI agents build an evidence-backed profile of each member from public
sources, watch Swedish and EU opportunities, and explain, with a source link and date on every claim, why
an opportunity matters to that company and how well it fits (an indicative 1–10 score).

Built for **BUILD Hackathon 2026** (Karlskrona, 13–15 November), challenge *Virtual Science Park* by
Blue Science Park.

> A prototype from BUILD Hackathon 2026 in Karlskrona. Not an official Blue Science Park service.

---

## Contents

1. [What Radar does](#what-radar-does)
2. [Challenge requirements](#challenge-requirements)
3. [Roles, sign-in and privacy](#roles-sign-in-and-privacy)
4. [How the fit score works](#how-the-fit-score-works)
5. [Agents](#agents)
6. [Tech stack and project structure](#tech-stack-and-project-structure)
7. [Setup](#setup)
8. [Running Radar](#running-radar)
9. [Five-minute demo](#five-minute-demo)
10. [Tests and quality checks](#tests-and-quality-checks)
11. [Data sources](#data-sources)
12. [What was built when](#what-was-built-when)
13. [Known limits and next steps](#known-limits-and-next-steps)

---

## What Radar does

**For every member company**
- A **profile** built from public sources (the company's website, its Blue Science Park member page,
  Wikipedia for the large groups, Bolagsverket). Every statement is either a *fact* with a verbatim quote,
  link and retrieval date, or an *inference* with its reasoning. The Verifier checks every quote word for word.
- A **personal feed** of funding calls, events and testbeds with an indicative **1–10 fit score**, a
  plain-language **"Why this match?"**, what is **missing or uncertain**, a requirement check, the
  funder's named contacts and a concrete **next step**. Top 10 first, "show more" for the rest.
- **Possible partners** among the other members, from public information only.
- **Ask Radar**, a Concierge chat that answers with citations and stays within its remit
  (it refuses unrelated requests and attempts to override its rules).
- **Profile history** and **email alerts** (instant or a weekly digest).

**Across the park**
- **Members**: all 56 members; search them by expertise ("marine sensor technology"); anyone can
  click **Profile member** to build a profile for a member that has none.
- **Event filters** by region, city and format; **national testbeds** (Vinnova open data plus a
  hand-verified list) next to the testbeds at Marine Technology Center in Karlskrona.
- Swedish by default, with a full **SV / EN** switch.

**Two views for the demo** (chosen on the start screen, see below)
- **Blue Science Park:** a **Park overview** (`/park`) with every profiled member's strong and possible
  matches, nearest deadline and best match, and **Who does this opportunity fit?**: pick a call,
  event or testbed, see which members it fits best and **Send tip**.
- **Member company:** **My radar** in the menu, **This week and next** (the company's upcoming deadlines
  and events) and **Tips from Blue Science Park** on its page.

## Challenge requirements

| Requirement | Where in Radar |
|---|---|
| Baseline profiles for ≥3 companies from public sources | 7 members profiled in our demo database (Ocean Harvesting, Techinova, 3D Vision, EmbeddedArt, Ericsson, Saab, NKT); any of the 56 can be profiled from **Members** |
| Evidence; facts vs inferred interests | Each statement is a fact (quote + link + date, verified word for word) or inferred (with reasoning); "Possible interests" are always inferred; Bolagsverket facts are labelled |
| Review and refine a profile | **Profile** tab: confirm, edit, mark outdated, add priorities. Name and date are recorded; the feed re-ranks |
| ≥2 public opportunity sources | Vinnova, EU Funding & Tenders, nine event calendars, Marine Technology Center, national testbeds |
| Different rankings per profile | Mean top-10 overlap between members about 8.5% (`python -m radar.evals`) |
| Source links and dates | On every claim, opportunity and chat citation |
| Relevant / unrelated / override requests | Three-layer **Guard**; 17-case boundary suite (all pass), including staff impersonation and a hidden instruction in a pasted document |
| Label simulated data | Simulated sign-in, simulated test company, simulated tips and preview-only emails are labelled |

The **Quality & safety** page (footer) shows these checks live, including a box to test the Guard.

## Roles, sign-in and privacy

**Start screen (simulated sign-in).** On the first visit Radar asks who is using it: *Blue Science Park*
or *a member company*. This is a simulation for the demo (a real sign-in takes too long in a five-minute
pitch). It only chooses the view; it grants no rights. The header shows the simulated view
("Simulated: Ocean Harvesting") and lets you switch.

**Real sign-in (Google)** is needed to change a profile or see a company's private data.

| | Visitor / simulated view | Company member (signed in) | Blue Science Park staff (signed in) |
|---|---|---|---|
| Public profiles, matches, events, testbeds, partners, Concierge | yes | yes | yes |
| Profile a member that has no profile yet | yes | yes | yes |
| Correct a profile, add priorities, make a priority public | no | own company | every company |
| Private priorities, saved items, feedback, alerts, email previews | no | own company | every company |
| Approve or reject access requests (Account page) | no | no | yes |

- **Staff** are the addresses listed in `RADAR_STAFF_EMAILS`.
- **Company access** is granted automatically only when the email domain is exactly the company's website
  domain (or an approved alias, e.g. `saabgroup.com` for Saab). Look-alike domains and free mail
  (Gmail, Outlook…) become a request that staff approve.
- **Private by default:** priorities a company adds are private until it chooses *Make public*. Visitors
  see recommendations ranked on the public profile only, and the shared written explanations are
  generated from public information only, so private priorities cannot leak through them.
- **Chats** belong to one visitor (browser session) or to the company's members; nobody sees anyone
  else's conversation.
- All of this is enforced in the API (`backend/radar/api.py`, `auth.py`) and tested in
  `backend/tests/test_privacy.py`, including "change the company in the URL".
- Without a configured login provider, nobody can edit.

## How the fit score works

Each opportunity gets an **indicative** score from 1 to 10, not a probability. Five factors, each 0–1,
with provisional weights to calibrate with park staff:

| Factor | Weight | From |
|---|---|---|
| Technology & industry | 35% | Embedding similarity of the opportunity to the profile and its closest statement |
| Company priorities | 25% | What the company itself confirmed or added (neutral when nothing is stated) |
| Eligibility | 20% | E.g. SME-only calls for large companies; missing eligibility text |
| Geography | 10% | National/EU calls and online events count as reachable; in-person events by region |
| Timing | 10% | Days to the deadline or event |

Technical fit gates the rest, so a nearby event that has nothing to do with the company stays low.
Where the Matcher has read the full texts, its strong/possible/weak judgement counts for 30% of the
final score. Labels: **strong ≥ 7.0**, **possible ≥ 4.5**, otherwise weak.

## Agents

| Agent | Model | Job |
|---|---|---|
| Collector | code | Fetches sources politely (robots.txt, rate limit, cache); stores URL and retrieval time |
| Profiler | gpt-oss-120b | Profile with fact/inferred labels, quotes and missing information |
| Verifier | code | A quote must appear in the saved source, otherwise the fact is downgraded to inferred |
| Scouts | gpt-oss-20b + APIs | Funding, events and testbeds; dates validated in code |
| Matcher | embeddings + gpt-oss-120b | 1–10 fit score with reasons; the LLM explains the top matches |
| Connector | embeddings + gpt-oss-120b | Member search and partner suggestions from public data |
| Guard | Llama Prompt Guard 2 + rules + gpt-oss-20b | Relevant / unclear / unrelated / override / needs a human / another company's private data |
| Concierge | gpt-oss-120b | Cited answers from the company's own profile and public data only |
| Watcher | scheduled | Re-reads public pages, keeps the company's decisions, records changes |
| Notifier | code + SMTP | Instant alerts or a weekly digest, deadline reminders |

Boundaries are enforced in code, not only in prompts: the Concierge's context contains only what the
caller may see.

## Tech stack and project structure

- **Backend:** Python 3.10+, FastAPI, SQLite (or Postgres via `DATABASE_URL`), Groq-hosted models,
  local multilingual embeddings (fastembed), Playwright for JavaScript-rendered calendars.
- **Frontend:** Next.js 15 (React, TypeScript), Auth.js (Google sign-in), Roboto, Blue Science Park's
  colours as a visual reference.

```
radar/
├── backend/
│   ├── radar/
│   │   ├── api.py            REST API used by the website
│   │   ├── agents/           profiler, verifier, matcher, connector, guard, concierge, notifier, …
│   │   ├── collectors/       members, websites, funding, events, testbeds, Bolagsverket
│   │   ├── pipeline.py       collect → profile → match → translate
│   │   ├── evals.py          quality and boundary report
│   │   ├── evaluate_demo.py  writes docs/EVALUATION.md
│   │   └── reset_demo.py     snapshot / restore for rehearsals
│   ├── tests/                offline tests (throw-away database)
│   └── requirements.txt
├── frontend/
│   └── src/app, src/components, src/lib   pages, components, API client, Swedish/English texts
├── data/                     member list, hand-verified national testbeds, eval report
│                             (the database, caches and models are created here, not committed)
├── docs/EVALUATION.md        top matches for three demo companies + refinement test
├── SOURCES.md                every data source, its endpoint and status
├── start-radar.bat           one-click start on Windows
└── .env.example              all settings, without values
```

## Setup

**Requirements:** Python 3.10 or newer, Node.js 20 or newer, Git, and a free
[Groq](https://console.groq.com) API key. About 1 GB of disk space for the embedding model and the
headless browser.

### 1. Get the code and the settings file

```bash
git clone <repository-url> radar
cd radar
```

Copy `.env.example` to `.env` (in the `radar` folder) and fill in at least `GROQ_API_KEY`.
Everything else is optional. **Never commit `.env`.**

### 2. Backend

Windows (Command Prompt):

```
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m playwright install chromium
.venv\Scripts\python -m radar.pipeline all
```

macOS / Linux:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
.venv/bin/python -m radar.pipeline all
```

`radar.pipeline all` collects every source, profiles the five default demo companies (Techinova, Ocean
Harvesting, EmbeddedArt, Ericsson, Saab), ranks and explains their matches and pre-translates them.
The first run takes several minutes and downloads a ~220 MB multilingual embedding model into
`data/models/`. Other members (e.g. 3D Vision, NKT) can then be profiled from the **Members** page.

### 3. Frontend

```bash
cd frontend
npm install
```

### Settings (`.env`)

| Key | Needed for |
|---|---|
| `GROQ_API_KEY` | **Required.** The language models |
| `AUTH_SECRET` | Signing sessions (any long random string) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in (profile corrections). Redirect URI: `http://localhost:3000/api/auth/callback/google` |
| `RADAR_STAFF_EMAILS` | Comma-separated Blue Science Park staff addresses |
| `RADAR_COMPANY_DOMAINS` | Extra approved email domains, e.g. `saab=saabgroup.com;techinova=techinova.com` |
| `BOLAGSVERKET_CLIENT_ID`, `BOLAGSVERKET_CLIENT_SECRET` | Official company facts from Bolagsverket |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_FROM`, `RADAR_APP_URL` | Real email alerts (otherwise emails are previews in Radar) |
| `RADAR_MAIL_ALLOWLIST` | **Set this for rehearsals:** only these addresses get real email |
| `RADAR_SCHEDULER=1`, `RADAR_SCHEDULER_MINUTES` | Send digests automatically while the API runs |
| `DATABASE_URL` | Use Postgres instead of the local SQLite file |
| `RADAR_TODAY` | Freeze "today" for a demo, e.g. `2026-11-14` |

## Running Radar

**Windows, one click:** double-click `start-radar.bat`. It opens the API and the website in two
windows and then opens http://localhost:3000. Close those two windows to stop Radar.

**By hand**, in two terminals:

```
cd backend
.venv\Scripts\python -m uvicorn radar.api:app --port 8000
```

```
cd frontend
npm run dev
```

Then open http://localhost:3000. (On macOS/Linux use `.venv/bin/python`.)

**Useful commands** (in `backend/`, with the virtual environment's Python):

```bash
python -m radar.pipeline collect       # refresh all sources
python -m radar.pipeline match         # re-rank and re-explain
python -m radar.evals                  # quality and boundary report → data/eval_report.json
python -m radar.evaluate_demo          # docs/EVALUATION.md
python -m radar.reset_demo --save      # save the current state as the demo snapshot
python -m radar.reset_demo             # back to the snapshot between rehearsals (safe while the API runs)
python -m pytest tests                 # offline tests
```

`reset_demo` restores profiles, feedback, tips, chats and alerts, and keeps caches, measured model usage
and the team's relevance ratings. Data is refreshed by running the pipeline, not live on every page view;
every item shows when it was retrieved.

## Five-minute demo

1. Open Radar and choose **Blue Science Park** on the start screen. Show the **Park overview**: which
   members have strong matches and deadlines coming up.
2. Under **Who does this opportunity fit?**, pick the EU wave and tidal energy call. Ocean Harvesting
   fits best. Click **Send tip**.
3. Switch the view (header) to **Ocean Harvesting**. Show **Tips from Blue Science Park**, **This week
   and next** and the feed: score, *Why this match?*, missing information, source and date, contact.
4. Open the **Profile** tab: facts with verbatim quotes and links, inferred interests, what is missing.
   Signed in as staff or a member, add a priority and watch the feed re-rank.
5. **Ask Radar** a relevant question, then an unrelated one and an override attempt: it answers with
   citations, then politely refuses.

Before each rehearsal run `python -m radar.reset_demo` so the demo starts clean.

## Tests and quality checks

Measured on the submission version:

- **26 offline tests pass** (`python -m pytest tests`): sign-in tokens and domain rules, privacy and
  cross-company access, profile edits, Bolagsverket parsing, digest timing and duplicate protection,
  demo reset, park tips.
- **Evals** (`python -m radar.evals`): 17/17 boundary cases with no unsafe answer; the planted prompt
  injection is flagged and ignored; every fact in the five default profiles has a verified quote;
  mean top-10 overlap between companies about 8.5%; no SME-only calls in Ericsson's or Saab's top 10.
- `docs/EVALUATION.md`: the top five matches for three smaller companies with source, date and
  eligibility, and a refinement test (adding one priority changes 2–4 of the top 10). The
  *team assessment* column is for people to fill in; Radar does not grade itself.

## Data sources

All public: Blue Science Park (members, events), member websites, Wikipedia (Ericsson, Saab),
Bolagsverket (company register), Vinnova open data (calls and funded testbed projects),
EU Funding & Tenders, event calendars (Vinnova, BTH, AI Sweden, Region Blekinge, SISP,
Blue Science Park, Tech Concept Lab, Almi, NetPort), Marine Technology Center of Sweden and a
hand-verified list of national testbeds (`data/national_testbeds.json`).
Radar follows robots.txt and never bypasses blocks. See `SOURCES.md` for endpoints.

Photos: Wikimedia Commons (CC0 and CC BY-SA, credited in their captions; see
`frontend/public/assets/credits.json`).

## What was built when

| | What |
|---|---|
| **Before the hackathon** (12 Nov, team kick-off and practice, allowed by the organisers) | Data collection, the ten agents, profiles with fact/inferred labels and verification, ranking, Concierge and Guard, Swedish/English interface, email alerts, profile corrections with Google sign-in, Bolagsverket facts, Postgres support |
| **During the hackathon** (from 13 Nov) | 1–10 fit score with reasons; national testbeds; member search and cross-company Concierge questions; event filters; weekly digest; evidence page; privacy rules (private priorities, per-company data, per-visitor chat, strict domain matching); start screen with Blue Science Park and member views; park overview, "who fits this opportunity?" and tips; "This week"; compact footer and homepage steps; demo reset; one-click start |
| **Reused, not built by us** | Open-source libraries (FastAPI, Next.js, Auth.js, fastembed, Playwright, trafilatura), hosted models on Groq, a multilingual embedding model, public APIs and data, Blue Science Park's colours as a visual reference |

## Known limits and next steps

**Limits**
- Some sites block automated reading (ericsson.com, ri.se, Testbed Sweden); Radar uses other public sources.
- The fit score weights are provisional and not yet calibrated with staff or members.
- Requirement checks are indicative; eligibility is decided by the funder. Testbed availability is never confirmed.
- Regional events are sparse in machine-readable form; most events found are online.
- The start screen is a simulated sign-in; real sign-in is Google only, with membership by email domain or staff approval.
- Tips from the park are shown in Radar only; no email is sent. The scheduler runs only while the API runs.

**Next steps**
1. Calibrate the score weights with Blue Science Park staff, using the evidence page and member feedback.
2. Blue Science Park's own sign-in and member register instead of Google and domain matching.
3. Hosted deployment with Postgres and a proper job scheduler; real email for park tips.
4. Consortium builder: members and BTH researchers for calls that need partners.
5. More sources: Swecris, JobTech hiring signals, TED public procurement.

**First rollout step:** run Radar for 5–10 volunteer members for one month, with weekly digests and a
staff member reviewing the top 10 each week.

**Biggest risk:** trust. If a member gets a few confidently wrong suggestions or a profile with a wrong
fact, they stop reading. That is why every claim has a source, every score shows its reasons and missing
information, and members can correct their own profile.
