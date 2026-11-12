# Radar – verified public data sources (Sweden)

Tested live on 2026-11-12. "Works" = we got real data back without an account.

## Summary

| # | Source | Used for | Status | Access |
|---|--------|----------|--------|--------|
| 1 | Blue Science Park WordPress API | Member list, events, news | Works | No key |
| 2 | Blue Science Park member pages | Each member's official website link | Works | No key (HTML) |
| 3 | Vinnova open data API | Open calls + all funded projects and partners | Works | No key |
| 4 | EU Funding & Tenders search API | EU calls (Horizon, Digital Europe, ...) | Works | Public key `SEDIA` |
| 5 | JobTech JobSearch API (Arbetsförmedlingen) | Hiring signals per company | Works | No key |
| 6 | TED API v3 | Public procurement in Blekinge/Sweden | Works | No key |
| 7 | OpenAlex | Research papers and BTH expertise | Works | No key |
| 8 | DiVA (BTH) OAI-PMH | BTH publications | Works | No key |
| 9 | Marine Technology Center of Sweden (mtcos.se) | Testbeds / test environments | Works | No key (HTML) |
| 10 | Swecris (Swedish Research Council) | Swedish research projects | Needs token. Public token `VRSwecrisAPI2026-1` from vr.se still returned 401 on 2026-11-12 | Register for a personal token at vr.se/english/swecris/swecris-api.html (arrives within a week) |
| 11 | Bolagsverket open data API | Official company facts (org no., SNI) | Portal blocks scripts | Free registration, you do it |
| 12 | Testbed Sweden | National testbed directory | Blocked (now redirects to RISE, 403) | Don't scrape; use 9 + Vinnova projects |

## Details

### 1. Blue Science Park (bluesciencepark.se)
- `robots.txt` allows everything.
- Members: `GET https://www.bluesciencepark.se/wp-json/wp/v2/medlem?per_page=100` → **56 members** (slug, title, link, modified).
- Events: `GET .../wp-json/wp/v2/event` (also `event-sitemap.xml`).
- News: `GET .../wp-json/wp/v2/posts`, RSS at `/feed/`.
- Member body text is **not** in the API; the member page HTML has the outgoing website link (e.g. techinova → techinova.se).
- Members include companies (Techinova, Ocean Harvesting, Njord-X, Roxtec, Spirius, EmbeddedArt, ...), large firms (Ericsson, Saab, NKT, Telenor) and public bodies (Försvarsmakten, Kustbevakningen, Region Blekinge, BTH). **Pick demo companies from the small/medium firms** — their needs are clearer and they benefit most.

### 3. Vinnova – `https://data.vinnova.se/api/`
- `GET /api/utlysningar/{since-date}` → calls (title SV/EN, description, published date, links, contacts).
- `GET /api/projekt/{since-date}` → funded projects with goals/results. Use for: past partners, "who has worked with whom", collaboration graph, consortium builder.
- Text is mostly Swedish → translate/embed multilingually.

### 4. EU Funding & Tenders
- `POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***`
  with a multipart `query` JSON. Returned 6,801 results.
- TODO on Friday: tune the status filter so only open/forthcoming topics come back (our first filter still returned a 2024 topic).

### 5. JobTech JobSearch
- `GET https://jobsearch.api.jobtechdev.se/search?q=...` → live Swedish job ads (headline, employer, date).
- Free-text search by company name is imprecise (0 hits for "Techinova"). Match by **employer organisation number** once we have it from Bolagsverket.
- Always label as **inferred** ("from job ads").

### 6. TED (EU procurement)
- `POST https://api.ted.europa.eu/v3/notices/search` with an expert query, e.g. `buyer-country=SWE AND place-of-performance=SE221` (SE221 = Blekinge).
- Add a date filter; the default order returned 2016 notices first.

### 7–8. Research
- OpenAlex: BTH = `I52719799` (6,706 works). Example: `works?filter=institutions.country_code:SE,default.search:...`.
- DiVA OAI-PMH: `https://bth.diva-portal.org/dice/oai` (Identify OK). The CSV export URL returned nothing; use OAI or OpenAlex.

## Rules we follow
- Respect robots.txt; max ~1 request/second per site; identify the client in the User-Agent (no personal details).
- Store URL + retrieval date for every fetched page (the brief requires it).
- Don't collect personal data beyond what a profile needs (GDPR); skip staff names/emails.
- Never bypass a block (Testbed Sweden/RISE, Bolagsverket portal).

## Member list
- `data/bsp_members.csv`: all 56 members with name, slug, Blue Science Park page, official website, LinkedIn (where linked) and page-modified date. Built 2026-11-12.
- `data/raw_bsp/`: the saved member pages it was built from (so we don't need to fetch them again).

## Still to do
- Request Swecris token and Bolagsverket API access (you).
