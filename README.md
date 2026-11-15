<p align="center"><img src="apps/web/public/brand/logo-wordmark.png" alt="Groundwork. Lay the groundwork. Build what's next." width="560"></p>

# Groundwork

Startup intelligence dashboard: ranked ideas, funding rounds, funding opportunities, jobs and skills, government schemes and regulations, with an **India** and a **United States** edition and a state picker.

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
| `POST /auth/login` | no | `{ password }` returns `{ token }` (12 h, 8 tries per 15 min per IP) |
| `GET /data` `/jobs` `/policy` `/funding` `/opportunities` | yes | edition-filtered datasets, `?region=in\|us`, `&refresh=1` to bypass the cache |
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

`FIXTURE_DIR=<dir>` makes the API read `data.json`, `jobs.json`, `policy.json`, `funding.json` and `opportunities.json` from disk instead of Supabase, which is handy for offline work.

## Deploy

**API (Vercel).** Import the repo, set the root directory to `apps/api`, and add the environment variables from `apps/api/.env.example`. Vercel detects NestJS and uses `src/app.ts` as the entry point.

**Web (Hostinger).** `.github/workflows/web-dist.yml` builds `apps/web` on every push to `main` and force-pushes the static output to the `web-dist` branch. Point Hostinger's Git deployment (static) for `groundwork.viagradient.com` at that branch. Set the repository variable `NEXT_PUBLIC_API_URL` to the public API URL first.

## Brand

Logo files live in `apps/web/public/brand/`. The mark sits on a white rounded chip so it reads on both light and dark themes.

&copy; 2026 Gradient Technology Labs LLP. All rights reserved.
