# JobRadar — Design Spec

Personal job alerting PWA that monitors ~150 company career sites every 15 minutes, scores listings against your preferences, and sends iOS push notifications for high-scoring matches.

## Goals

- Be the first to know about job postings at target companies (FAANG, top startups, AI labs)
- Filter noise with rule-based scoring so only relevant roles hit your phone
- Single-user, low-maintenance, all on Cloudflare's free/cheap tiers

## Non-Goals (Phase 1)

- Recruiting events (needs source research)
- Resume tailoring (LLM-powered, future phase)
- Company discovery/recommendations
- Multi-user support

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Svelte + Vite + svelte-spa-router + DaisyUI |
| Backend | Hono on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Polling | CF Cron Triggers (every 15 min) |
| Notifications | Web Push (VAPID) |
| Auth | Cloudflare Access (single user) |
| Hosting | CF Static Assets (PWA), CF Workers (API + cron) |

## Architecture

Single Cloudflare Worker handles all responsibilities:

1. **Hono API** — REST endpoints for jobs, companies, preferences
2. **Cron Poller** — fires every 15 min, fans out ~150 parallel `fetch()` calls to ATS APIs, diffs results against D1, scores new jobs, sends push notifications
3. **Static Asset Serving** — PWA deployed via CF Static Assets
4. **CF Access** — zero-trust auth, single user only

### Poll Cycle

```
Cron fires (every 15 min)
  → Load enabled companies from D1
  → Fan out parallel fetch() to ATS endpoints
  → Parse responses via ATS adapters
  → Diff against stored jobs (dedup on company_id + external_id)
  → Score new jobs (rule-based, 0-100)
  → Store new jobs in D1
  → Send Web Push for jobs above notification threshold
```

### Failure Handling

If an individual ATS fetch fails (timeout, 429, network error), log it and continue. The next 15-minute cycle retries automatically. No explicit retry logic — the polling cadence is the retry.

## ATS Adapters

Each ATS platform implements a common interface:

```ts
interface JobListing {
  externalId: string
  title: string
  url: string
  location: string
  department?: string
  postedAt?: string
}

interface ATSAdapter {
  fetchJobs(slug: string): Promise<JobListing[]>
}
```

### Launch Adapters

| Adapter | Endpoint | Format |
|---------|----------|--------|
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` | JSON, paginated |
| Lever | `api.lever.co/v0/postings/{slug}` | JSON array |
| Ashby | `jobs.ashbyhq.com/api/non-user-graphql` | GraphQL POST |

### Coverage

- **Greenhouse**: Anthropic, Stripe, Airbnb, Figma, Linear, Notion, OpenAI, Scale AI, Brex, Plaid, Ramp, Rippling
- **Lever**: Robinhood, Coinbase, and many mid-stage startups
- **Ashby**: Cursor, Perplexity, and many newer AI startups
- **Custom scrapers** (added incrementally, not at launch): Google, Meta, Apple, Amazon, Netflix, Bloomberg — these use proprietary career systems (Workday, custom)

The starting company list will be ~150 curated companies. The user manages the list (enable/disable/remove) from the Companies view.

## D1 Schema

### companies

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| name | TEXT | Display name |
| ats_type | TEXT | greenhouse, lever, ashby, custom |
| ats_slug | TEXT | e.g. "anthropic" for boards.greenhouse.io/anthropic |
| website | TEXT | Company careers URL |
| enabled | BOOLEAN | Default true |
| added_at | TIMESTAMP | |

### jobs

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| company_id | TEXT FK | → companies.id |
| external_id | TEXT | ATS-specific job ID |
| title | TEXT | |
| url | TEXT | Direct link to posting |
| location | TEXT | |
| department | TEXT | Nullable |
| posted_at | TIMESTAMP | From the ATS |
| first_seen_at | TIMESTAMP | When we first found it |
| score | INTEGER | 0-100 |
| dismissed | BOOLEAN | Default false |
| UNIQUE | | (company_id, external_id) |

### preferences

| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | |
| value | TEXT | JSON |

Example rows:
- `locations` → `["Remote", "NYC", "SF", "Dallas"]`
- `min_yoe` → `"0"`
- `max_yoe` → `"2"`
- `role_keywords` → `["software", "fullstack", "backend", "frontend", "forward deployed"]`
- `notify_threshold` → `"50"`

### push_subscriptions

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| endpoint | TEXT | Push service URL |
| p256dh | TEXT | Client public key |
| auth | TEXT | Auth secret |
| created_at | TIMESTAMP | |

## Scoring

Rule-based scoring, 0-100. No LLM needed for v1.

| Factor | Points | Logic |
|--------|--------|-------|
| Title match | 0-35 | High: "software engineer", "fullstack", "backend", "frontend", "forward deployed engineer". Zero: "staff", "principal", "director", "intern", "manager". |
| YOE fit | 0-25 | "0-3 years" = 25. "5+ years" = 0. Not mentioned = 15. |
| Location match | 0-20 | Remote = 20. Preferred cities (SF, NYC, Dallas) = 20. Location not specified or "Multiple Locations" = 10. Non-preferred city = 0. |
| Department match | 0-10 | Engineering/Product = 10. Other = 0. |
| Recency bonus | 0-10 | Today = 10. Yesterday = 7. This week = 3. Older = 0. |

### Notification Threshold

Default: 50. Configurable from preferences. Jobs below threshold still appear in the feed — the threshold only controls what triggers a push notification.

## Notifications

### Web Push (VAPID)

- VAPID keypair generated once, stored as CF Worker secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)
- Public key embedded in PWA service worker
- Push subscription registered on first app visit, stored in `push_subscriptions`
- Worker sends push directly using the Web Push protocol

### Notification Content

- **Title**: Company name
- **Body**: Job title + location
- **Action**: Tap opens the app's job detail view
- **Batching**: If 5+ new qualifying jobs in a single poll cycle, group into one notification (e.g., "4 new jobs from Anthropic, Stripe, Cursor")

### No Fallback Channel

Single device, single user. If push delivery fails (expired subscription, etc.), jobs remain in the feed. No email digest or secondary channel.

## PWA Views

### 1. Job Feed (Home)

- Scrollable list of jobs sorted by `first_seen_at` descending
- Each row: job title, company, location, relative time, score badge (color-coded)
- Filter chips: All, Remote, NYC, SF, Dallas (from preferences)
- Low-scoring or dismissed jobs visually de-emphasized

### 2. Job Detail

- Job title, company, location, posted date
- Score breakdown (title/YOE/location/dept/recency with points)
- "Apply" button → opens company's job page in browser
- "Dismiss" button → hides from feed, does not delete

### 3. Companies

- List of all companies with enable/disable toggles
- Filter by ATS type (Greenhouse, Lever, Ashby)
- Company count displayed
- Disabled companies greyed out

### 4. Preferences

- Locations (multi-select)
- YOE range (min/max)
- Role keywords (editable list)
- Notification threshold (slider or number input)
- Poll interval (display only, hardcoded at 15 min)
- Push notification status

### Navigation

Bottom tab bar: Jobs | Companies | Settings

## API Endpoints

```
GET    /api/jobs                    List jobs (filterable by score, company, location, dismissed)
GET    /api/jobs/:id                Job detail
PATCH  /api/jobs/:id                Update job (dismiss/undismiss)

GET    /api/companies               List companies
POST   /api/companies               Add company
PATCH  /api/companies/:id           Update company (enable/disable, edit ATS config)
DELETE /api/companies/:id           Remove company

GET    /api/preferences             Get all preferences
PUT    /api/preferences             Update preferences

POST   /api/push/subscribe          Register push subscription
DELETE /api/push/subscribe          Remove push subscription

GET    /api/stats                   Dashboard stats (total jobs, new today, companies active)
```

## Seed Data

The app ships with a curated list of ~150 companies pre-populated in D1, covering:

- **AI labs**: Anthropic, OpenAI, DeepMind, Cohere, Mistral, xAI, Inflection, Adept, Character.ai
- **AI infra/tools**: Scale AI, Weights & Biases, Hugging Face, Cursor, Perplexity, Replit, Vercel
- **FAANG+**: Google, Apple, Amazon, Meta, Netflix, Microsoft
- **Fintech**: Robinhood, Stripe, Plaid, Ramp, Brex, Mercury, Affirm
- **Dev tools**: Linear, Figma, Notion, Supabase, Railway, Fly.io, PlanetScale
- **Enterprise/cloud**: Snowflake, Databricks, Cloudflare, Datadog, HashiCorp
- **High-comp**: Bloomberg, Two Sigma, Citadel, Jane Street, Hudson River Trading, DE Shaw
- **Hot startups**: Retool, Temporal, Resend, Clerk, Neon, Turso, Convex

Each entry needs: name, ats_type, ats_slug. Companies using proprietary career systems ship with `ats_type: "custom"` and `enabled: false` until a custom scraper is built.

## Deployment

- **Domain**: User's existing Cloudflare domain
- **Worker**: Single `wrangler deploy`, configured with D1 binding and cron trigger
- **Static Assets**: PWA built with Vite, deployed as CF Static Assets
- **Secrets**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` set via `wrangler secret put`
- **CF Access**: Configured via dashboard, email-based policy for single user
