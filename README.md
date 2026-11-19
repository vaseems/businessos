<p align="center"><img src="apps/web/public/brand/logo-wordmark.png" alt="Groundwork. Lay the groundwork. Build what's next." width="560"></p>

# Groundwork

Startup intelligence dashboard: ranked ideas, funding rounds, funding opportunities, jobs and skills, government schemes and regulations, end-of-day stock market data, with an **India** and a **United States** edition and a state picker.

This repository is the NestJS + Next.js rewrite of the original PHP app. Functionality, data and behaviour are unchanged.

```
apps/
  api/   NestJS API       -> Vercel   (serverless, reads Supabase RPCs)
  web/   Next.js frontend -> Hostinger (static export, groundwork.viagradient.com)
```

## How it fits together

```
Browser ── static pages (Hostinger) ──► NestJS API (Vercel) ──► Supabase RPCs
                 JWT in localStorage        region filtering, caching, CSV export
```

* The frontend is a static export, so Hostinger only serves files. It never sees the Supabase key.
* The API holds all secrets. Every data route needs a bearer token from `POST /api/auth/login`.
* Region (India or US) is sent as `?region=in|us`. The API applies the same row filters as the PHP version.

### API routes (`/api`)

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | no | liveness |
| `GET /geo` | no | edition guess from the edge country header |
| `POST /auth/login` | no | `{ username, password }` returns `{ token, user }` (12 h, 8 tries per 15 min per IP) |
| `GET /auth/check` | yes | confirms the session and returns the user |
| `POST /auth/password` | yes | `{ current, next }` changes your own password and returns a fresh token |
| `GET /users` `POST /users` `PATCH /users/:id` `POST /users/:id/reset-password` `DELETE /users/:id` | admins only | user management; new users get a one-time temporary password. Only the initial admin can tag or untag admins (`PATCH` with `role`) or manage other admins |
| `GET /history/:section` | yes | every row ever stored, paginated on the server (`page`, `size`, `q`, `since`). Sections: ideas, startups, funding, opportunities, schemes, regulations, jobs, changes, runs |
| `GET /search` | yes | global search across all datasets, grouped into lanes and categories |
| `POST /chat` | yes | asks a question about the data; answers with linked cards (20 per minute per user) |
| `GET /data` `/jobs` `/policy` `/funding` `/opportunities` | yes | edition-filtered datasets, `?region=in\|us`, `&refresh=1` to bypass the cache |
| `GET /market` | yes | Markets overview for `?region=`: indices with price history, sector indices, movers, listed startups, macro, IPOs, holidays, plus a computed market `status` (open/closed, next open, next holiday, stale flag) |
| `GET /market/movers` | yes | `?region=&universe=nifty500\|all&limit=` top gainers and losers |
| `GET /market/search` | yes | `?region=&q=` symbol / company typeahead (used by the watchlist) |
| `GET /market/watchlist` `POST /market/watchlist` `DELETE /market/watchlist/:symbol` | yes | the signed-in user's own watchlist (max 50 per market); never visible to other users |
| `GET /export/ideas` `/export/startups` | yes | CSV download |

## Local development

```bash
# API  (needs the env vars in apps/api/.env.example)
cd apps/api && npm install && npm run start:dev      # http://localhost:3000/api

# Web
cd apps/web && npm install
echo NEXT_PUBLIC_API_URL=http://localhost:3000/api > .env.local
npm run dev                                           # http://localhost:3100
```

### Previous results, search and chat

Nothing is deleted from Supabase. The pages show a window of recent rows (funding: last 24 months, 30-day default filter, 400 rows; closed schemes hidden; 10 feed entries on Overview). The **History** page (in the sidebar) shows everything, newest first, with a tab for each section and a paginated table with search, a time range and rows per page. Edits and removals are recorded in `change_log` by database triggers from the day the migration was applied (`supabase/migrations/20261116_history_and_roles.sql`); earlier edits were not versioned and are not there.

**Search** (`/search/`, or Cmd/Ctrl+K anywhere) searches ideas, startups, funding rounds, angels, VCs, accelerators, grants, perks, schemes, regulations, roles and skills. Results come in five lanes (Build, Market, Capital, Policy, Careers), with a best match on top and groups below.

**Ask** (the button at the bottom right) answers questions about the same data and links to the source rows. By default it retrieves from the data and writes a short answer, which costs nothing. To let a model write the answers from the retrieved rows, set `LLM_API_KEY` (and optionally `LLM_PROVIDER` = `anthropic` or `openai`, `LLM_MODEL`, `LLM_BASE_URL`) on the API.

### Users and the initial admin

Accounts live in the `app_users` table in Supabase and are only reachable through app-key RPCs. The first time `ADMIN_USERNAME` (default `admin`) signs in with the password behind `PASSWORD_HASH`, the initial admin account is created. After that the password is changed in the app (Account page) and `PASSWORD_HASH` is no longer used. Users are visible to admins only; members never see the Users page and `/users` returns 403 for them. Any admin can add members and manage members. Only the initial admin can tag a member as admin (or remove the tag) on the Users page, and it cannot be demoted, disabled or deleted. Nobody can change their own role or disable or delete their own account. Roles are read from the database on every request, so untagging takes effect immediately. Disabling a user or resetting a password signs them out (within about 30 seconds for a disabled user).

If the admin password is lost, delete the `is_initial` row from `app_users`; the next sign-in with the `PASSWORD_HASH` password recreates it.

Tests: `cd apps/api && npm run build && node test/auth.e2e.js && node test/features.e2e.js && node test/llm.e2e.js && node test/market.e2e.js` runs the auth, roles, history, search, chat and Markets rules against an in-memory stand-in for the database. `node test/serve-mock.js` serves that stand-in for offline UI work (sign in as `admin` / `Initial-Pass-123`).

`FIXTURE_DIR=<dir>` makes the API read `data.json`, `jobs.json`, `policy.json`, `funding.json` and `opportunities.json` from disk instead of Supabase for the datasets. Sign-in still needs the user RPCs, so use `node test/serve-mock.js` when you are fully offline.

## Markets (end-of-day stock market)

The **Markets** page (sidebar, `/markets/`) follows the India / US toggle. Both the **India** and **US** editions are live; the schema, API and page are region-aware and each region has its own collector (`scripts/market/india.mjs`, `scripts/market/us.mjs`).

**What it shows (India):** market open/closed (IST, NSE holiday calendar) with next open, next holiday and the "data as of" date; index cards for Nifty 50, Sensex, Nifty Bank, Nifty Midcap 100, Nifty Smallcap 100 and India VIX with a 1D / 1W / 1M / 3M / 6M / 1Y toggle and a hoverable chart for the selected index; USD/INR, gold, Brent and WTI; top gainers and losers (Nifty 500 or all NSE stocks) with advance/decline breadth; a sector and theme heat map (21 NSE indices); IPOs (open, upcoming, recently listed with listing-day and since-listing gain, Mainboard / SME); about 25 listed startups with category filters; and a **per-user watchlist** with typeahead search (50 per market, private to the user). Direction is always shown with an arrow as well as colour. Data is end of day, not live; figures can differ slightly from a terminal. Information only, not investment advice.

**What it shows (US):** the same layout in US terms. NYSE / Nasdaq status (ET, NYSE holiday calendar); index cards for S&P 500, Nasdaq Composite, Dow Jones, Russell 2000 and VIX; US dollar index, US 10-year yield, gold, WTI and Brent; top movers in the S&P 500 (or including startups and new IPOs); a sector heat map of 14 sector and theme ETFs (XLK, XLF, ... plus Internet, IPO ETF and ARKK); IPOs from the Nasdaq calendar (expected pricing and recently listed, SPACs excluded, filter by exchange); about 44 US-listed startup-born companies (Airbnb, Uber, Coinbase, Palantir, Duolingo, Shopify and others; `STARTUPS` in `us.mjs`); and a US watchlist. Prices are in USD, turnover in $ millions. The database group named `nifty500` is the generic "main index constituents" group, so for the US it holds the S&P 500.

**Data flow.** Browser → `GET /api/market*` (NestJS, cached about 5 minutes, serves the last good copy if Supabase errors) → Supabase RPCs `app_market_*` (app-key protected). Nothing is fetched from exchanges at request time. A scheduled GitHub Action loads the data:

```
GitHub Action "market-ingest"  →  scripts/market/ingest.mjs  →  RPC app_market_ingest (token-guarded)  →  tables
```

| Source (all free) | Used for |
| --- | --- |
| NSE archives `ind_close_all_DDMMYYYY.csv` | index closes (open, high, low, close, previous close, volume, turnover) |
| NSE archives `sec_bhavdata_full_DDMMYYYY.csv` | every EQ-series stock's close, previous close, volume, turnover (lakh converted to crore) |
| NSE archives `ind_nifty500list.csv`, `EQUITY_L.csv` | Nifty 500 membership and industries, company names, ISINs |
| NSE JSON `ipo-current-issue`, `all-upcoming-issues`, `public-past-issues`, `holiday-master` | IPOs and the trading-holiday calendar |
| Yahoo Finance chart API | Sensex (not in NSE files), USD/INR, gold, Brent, WTI |
| **US:** Yahoo Finance chart API | S&P 500, Nasdaq, Dow, Russell 2000, VIX, sector ETFs, DXY, US 10-year yield, gold, oil, and daily prices for every S&P 500 / startup / IPO stock |
| **US:** Wikipedia "List of S&P 500 companies" | S&P 500 membership, company names, GICS sectors (validated to 495-510 rows) |
| **US:** Nasdaq IPO calendar (`api.nasdaq.com/api/ipo/calendar`) | upcoming and priced IPOs, 5 months back and 2 months ahead; SPACs / blank checks dropped |
| **US:** rule-based NYSE holidays (`nyseHolidays` in `lib.mjs`, tested by `us.test.mjs`) | `market_calendar` (3 years) |

There is no free source for the India 10-year yield, so it is not shown. The listed-startup watchlist is a curated symbol list in `scripts/market/india.mjs` (`STARTUPS`); symbols not found in the exchange files are skipped and reported in the run log.

**Database** (`supabase/migrations/20261118_markets.sql`): `market_quotes` (region, kind index/stock/macro, symbol, trade date), `market_universe` (names, industry, groups: headline, sector, nifty500, startup, macro), `market_ipos`, `market_calendar`, `market_refresh_log`, `market_watchlist` (per user, cascades with the user) and `market_ingest_key` (sha-256 of the ingest token). Row level security is on with no policies and everything is revoked from `anon` / `authenticated`; access is only through `SECURITY DEFINER` RPCs. The read RPCs need the app key like the rest of the app; the write RPCs (`app_market_ingest`, `app_market_ingest_tracked`) need the ingest token.

**Retention.** Indices and macro series are kept; stocks outside Nifty 500 / S&P 500, the startup list, IPO listings and anyone's watchlist keep only the latest session; tracked stocks keep history up to 400 days. Re-running a day is safe (upserts).

**Schedule and runs.** `.github/workflows/market-ingest.yml` runs the India job weekdays at 19:00 IST (13:30 UTC) and again at 08:00 IST the next morning, and the US job weekdays at 22:30 UTC (17:30 EST / 18:30 EDT) and again at 11:00 UTC the next morning. The cron expression decides the region; manual runs take `region` = `in`, `us` or `both`, and the backfill push loads both. Each run reloads the last 8 days, so a missed day heals itself. For the US a bar for the current day is only used after 16:15 ET. The API marks data **stale** (banner on the page) if the session that should be loaded by about 19:30 IST is missing, and shows a notice if the last run reported an error (`market_refresh_log`).

**One-time setup.**
1. Add the repository secret `MARKET_INGEST_TOKEN` (Settings → Secrets and variables → Actions). Only its sha-256 is stored in Supabase (`market_ingest_key`). The Supabase URL and the publishable key are public by design and sit in the workflow file.
2. Load history once: push the `market-backfill` branch (`git push origin main:market-backfill`), or run the workflow manually with `days=380` and `stock_days=190`.

**Rotate the token.** Generate a random string, store its sha-256 in `market_ingest_key` (`insert ... on conflict (id) do update`), then update the repository secret.

**Run it yourself.**

```bash
# fetch + validate without writing (no secrets needed; NSE only answers from some networks, GitHub runners work)
node scripts/market/ingest.mjs --region in --days 12 --stock-days 6 --dry
node scripts/market/ingest.mjs --region us --days 12 --stock-days 6 --dry
node scripts/market/us.test.mjs        # NYSE holiday rules, no network
# real run
SUPABASE_URL=https://<project>.supabase.co SUPABASE_KEY=<publishable key> MARKET_INGEST_TOKEN=... \
  node scripts/market/ingest.mjs --region in --days 8
```

The ingest validates before it writes: Nifty 500 list near 500 symbols, at least 1,500 EQ stocks in the bhavcopy, Nifty 50 and Nifty Bank present, and each index's reported % change is recomputed from close and previous close (mismatches are logged as warnings). A failed run writes `ok=false` to the refresh log and exits non-zero, so the Action shows red.

**US validation.** The US ingest fails (and logs `ok=false`) if S&P 500, Nasdaq or Russell 2000 data is missing, the Wikipedia list is not 495-510 rows, or fewer than 450 S&P 500 stocks return prices. Startup, IPO or watchlist symbols Yahoo cannot find are skipped and listed in the run warnings. Share classes such as BRK.B are stored with a dot and fetched from Yahoo as BRK-B.

**Troubleshooting.** Page says "loading for the first time": no ingest has completed, check the Action run. "Latest figures are from ..." banner: the evening run failed or NSE had not published yet; the 08:00 IST run retries. A startup row missing: its symbol changed or it was delisted, check the warning in the run log and update `STARTUPS` in `india.mjs` or `us.mjs`. Offline UI work: `node apps/api/test/serve-mock.js` includes Markets sample data.

## Deploy

**API (Vercel).** Import the repo, set the root directory to `apps/api`, and add the environment variables from `apps/api/.env.example`. Vercel detects NestJS and uses `src/app.ts` as the entry point. When deploying through the Vercel API from a monorepo, pass `projectSettings` (`framework: nestjs`, `rootDirectory: apps/api`, `nodeVersion: 22.x`); without them the build fails with a `fsPath` error.

**Web (Hostinger).** `.github/workflows/web-dist.yml` builds `apps/web` on every push to `main` and appends a build commit with the static output to the `web-dist` branch. Point Hostinger's Git deployment (static) for `groundwork.viagradient.com` at that branch. Set the repository variable `NEXT_PUBLIC_API_URL` to the public API URL first. Hostinger does not auto-deploy this branch: after the workflow finishes, run the Git deploy for the site (repository `git@github.com:bizworks-org/groundwork.git`, branch `web-dist`) from hPanel or the Hostinger API.

The Supabase migrations in `supabase/migrations/` are applied by hand (Supabase SQL editor or MCP) and are not run by CI. Markets needs `20261118_markets.sql`.

## Brand

Logo files live in `apps/web/public/brand/`. The mark sits on a white rounded chip so it reads on both light and dark themes.

&copy; 2026 Gradient Technology Labs LLP. All rights reserved.
