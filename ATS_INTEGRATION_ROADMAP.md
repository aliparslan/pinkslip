# ATS Integration Roadmap

## Goal

Pinkslip should discover a company's canonical posting as quickly as practical,
notify users once, and keep one durable job record even when the same role
appears on several sites.

This means the project should optimize for:

1. Direct ATS or company-owned sources before job aggregators.
2. Stable source identifiers and complete open-job snapshots.
3. Conservative cross-source deduplication.
4. Fast, observable, source-specific polling.
5. Explicit handling of source terms, robots directives, and rate limits.

## Current Constraints

The current model is intentionally simple:

- A company has one `ats_type` and one `ats_slug`.
- A job is unique only by `(company_id, external_id)`.
- Missing jobs are closed by comparing one fetched snapshot with that company's
  existing external IDs.
- The cron polls all enabled supported companies every 15 minutes, with
  concurrency 6.
- `custom` companies are excluded from polling.

That works for Greenhouse, Lever, and Ashby, but it cannot safely support:

- Multiple sources for one company.
- A company changing ATS providers.
- The same job appearing on a direct ATS and an aggregator.
- Partial or paginated snapshots.
- Source-specific poll frequencies.
- Generic or company-specific career sites.

Adding aggregator adapters before fixing this model would create duplicate
notifications and unreliable closure behavior.

## Source Strategy

### Coverage Rule

Pinkslip is not a general-purpose job index. Its target catalog is concentrated
on AI labs, startups, unicorns, developer infrastructure, fintech, autonomy,
robotics, trading firms, and selective large technology companies.

Across the two main seed migrations, the declared sources are approximately:

- 205 Greenhouse entries.
- 81 Ashby entries.
- 8 Lever entries.

The next adapter should therefore be selected by auditing unsupported target
companies, not by an ATS vendor's total global customer count. A product can
have thousands of customers and still add little value if they are mostly
small, non-technical, or outside Pinkslip's intended market.

Use this gate before building an adapter:

1. Which named target companies does it unlock?
2. How many are currently missing or using a broken guessed source?
3. Are the jobs unique and timely?
4. Is the interface stable enough to maintain?

### Tier 1: Target-Market Coverage

| Source | Recommendation | Notes |
| --- | --- | --- |
| Workday | Highest-priority broad adapter | It is common among the large, mature technology and enterprise companies missing from the current catalog. Public career sites use structured JSON requests, but the interface is not documented as a public third-party API. |
| Custom-site detection | Build alongside Workday | Provider detection, JSON-LD, sitemaps, and structured feeds can recover branded sites such as Spotify and Shopify without pretending every site is a new ATS. |
| Rippling ATS | Implemented; add curated boards | Strong startup relevance. Pinkslip uses Rippling's public board JSON endpoint with complete pagination and structured detail pages. |
| Gem ATS | Implemented; add curated boards | Gem publishes a public Job Board API with live postings, descriptions, departments, offices, and publication dates. |
| Avature | Build as a site family | The likely intended name is Avature. It matters for some marquee employers, but its career portals are highly configurable and do not behave like one universal public API. |

### Tier 2: Only When Named Targets Justify Them

| Source | Recommendation | Notes |
| --- | --- | --- |
| SmartRecruiters | Implemented; add selectively | Its public Posting API supports US-only pagination and structured detail retrieval. Keep additions limited to relevant technology employers. |
| iCIMS, SuccessFactors, Oracle Recruiting, Taleo | Conditional | Potentially unlock major companies, but each is fragmented or expensive to support. Rank them by named target coverage. |
| Jobvite, Comeet, Teamtailor, Pinpoint | Conditional | Relevant to some technology companies but not automatically worth building. |
| Workable | Defer by default | It has substantial adoption, but much of its market is broad SMB hiring rather than Pinkslip's curated target segment. |
| Recruitee and Personio | Defer by default | Both are real and widely used, especially by European and smaller employers, but they are not obvious matches for the current US-heavy startup/unicorn catalog. |
| BambooHR, ADP, Dayforce | Low priority | Broad HR-market coverage does not necessarily translate into high-value Pinkslip coverage. |

### Aggregators and Networks

| Source | Recommendation | Reason |
| --- | --- | --- |
| LinkedIn | Do not ingest | Companies can post manually or use Easy Apply, but marquee employers usually syndicate from an ATS. The likely unique remainder is recruiter, staffing, stale, or low-confidence inventory. LinkedIn explicitly prohibits crawlers, bots, scraping, and automated activity. |
| Y Combinator / Work at a Startup | Company-scoped adapter implemented with permission | This is genuinely unique. The current adapter polls curated YC companies individually so it fits the existing canonical company model without introducing network-wide duplicates. |
| Wellfound | Medium strategic value; partnership or native-only | Companies can post directly, so exclusive early-stage startup jobs exist. Synced ATS jobs may take up to 12 hours and require manual review, making that portion slower and duplicate-heavy. Its terms restrict scraping and competitive commercial use. |
| Welcome to the Jungle / Otta | Lower priority; partnership or native-only | Direct postings can be exclusive, but ATS-synced and direct jobs are reviewed and may take up to one working day to appear. That makes it a weak source for beating direct ATS feeds. |
| Indeed, Glassdoor, ZipRecruiter | Do not prioritize | Mostly syndicated inventory, high duplicate volume, weaker freshness, and substantial platform constraints. |

For an aggregator partnership, ingest only records that are demonstrably native
or cannot be resolved to a direct company source. If an aggregator exposes an
upstream apply URL, use it as an identity hint and send users to the canonical
company/ATS page.

### Do Companies Use Multiple Sources?

Most companies in Pinkslip's target market have one canonical ATS or careers
system and syndicate those jobs to LinkedIn, Indeed, Wellfound, Welcome to the
Jungle, and other boards. Those mirrors are not independent sources of truth.

Multiple direct sources do occur:

- Different business units or acquired subsidiaries use different ATS systems.
- A company is migrating between providers.
- Internships, university recruiting, or international roles use a separate
  portal.
- A native network listing exists outside the company's main ATS.

The point of multi-source support is resilience and selective unique coverage,
not polling every mirror. It does not need to block the next direct adapter.
Build deterministic cross-source deduplication before adding YC, Wellfound, or
another network, but Workday and other direct sources can be added under the
current one-source-per-company model first.

## Workday Implementation Notes

Workday is different from Greenhouse, Lever, and Ashby:

- The other adapters use a documented board endpoint and one company slug.
- Workday sources need a full public board URL containing a host cluster,
  tenant, optional locale, and career-site name.
- Listing requests are POST requests with JSON pagination.
- Listing pages contain requisition IDs and job paths but not full descriptions
  or reliable multi-location data.
- Job-detail requests contain the HTML description, exact start date, primary
  and additional locations, and application metadata.
- Workday limits pages to 20 jobs and appears to cap broad result sets at 2,000.

The implemented source format is a public board URL:

```text
https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite?country=US
```

The adapter derives:

```text
POST https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs
GET  https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/...
```

For boards that reach Workday's 2,000-result cap, `?country=US` selects the
board's United States country facet before pagination. The adapter refuses a
capped unfiltered snapshot rather than silently treating partial results as
complete and closing jobs incorrectly.

Public boards validated on June 9, 2026:

| Company | Board | Observed open jobs |
| --- | --- | ---: |
| Netflix | `netflix.wd108.../Netflix` | 692 |
| NVIDIA | `nvidia.wd5.../NVIDIAExternalCareerSite` | capped at 2,000 globally |
| Adobe | `adobe.wd5.../external_experienced` | 1,201 |
| Snap | `snapchat.wd1.../sourced` | 111 |
| Autodesk | `autodesk.wd1.../Ext` | 659 |

These are strong initial target additions. NVIDIA should initially use the US
country scope because its global board exceeds Workday's broad-query cap.

## Permitted YC Connector

The first implementation is deliberately company-scoped:

- Store the YC company slug, such as `onechronos`.
- Poll `https://www.ycombinator.com/companies/{slug}/jobs`.
- Use the numeric YC job ID as the external ID.
- Use the job detail page's JobPosting JSON-LD for the exact publication date
  and HTML description.
- Apply the same US and target-role eligibility gate used by every other source.

This unlocks curated YC companies now without requiring a multi-source data
model. A future network-wide discovery connector should:

1. Poll the public job index ordered by newest or updated listings.
2. Use the numeric `/jobs/{id}` value as the stable source ID.
3. Parse the job page for title, YC company ID/name, batch, locations, salary,
   equity, experience, visa policy, employment type, skills, and description.
4. Resolve the Apply action before insertion.
5. If Apply leads to Greenhouse, Lever, Ashby, Workday, or a company careers
   page, attach YC as a secondary source and deduplicate against that canonical
   listing.
6. If the application is native to YC, keep it as a unique `native_network`
   canonical job.
7. Revisit known IDs for edits and closure, while polling the newest index more
   frequently for discovery.

Network-wide discovery still belongs after `company_sources`, `job_sources`,
and deterministic cross-source deduplication. The company-scoped adapter does
not attempt to discover every YC company automatically.

## Target Data Model

Keep `jobs` as the canonical user-facing entity so saved jobs, applications,
tailorings, notifications, scores, and feedback retain stable foreign keys.

### `company_sources`

One company can have several independently polled sources.

Suggested fields:

```sql
CREATE TABLE company_sources (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  config_json TEXT,
  authority TEXT NOT NULL DEFAULT 'direct',
  enabled INTEGER NOT NULL DEFAULT 1,
  poll_interval_seconds INTEGER NOT NULL DEFAULT 900,
  next_poll_at TEXT,
  last_polled_at TEXT,
  last_poll_status TEXT,
  last_poll_error TEXT,
  etag TEXT,
  last_modified TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_type, source_key)
);
```

`authority` should distinguish:

- `direct_ats`
- `company_site`
- `native_network`
- `aggregator`

The current `companies.ats_type`, `ats_slug`, and poll-status fields can remain
during migration, then be retired after the admin UI and poller use sources.

### `job_sources`

Each canonical job can have one or more observed listings.

```sql
CREATE TABLE job_sources (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES company_sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  apply_url TEXT,
  canonical_apply_url TEXT,
  requisition_id TEXT,
  source_published_at TEXT,
  source_updated_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  closed_at TEXT,
  payload_hash TEXT,
  UNIQUE(source_id, external_id)
);
```

Useful indexes:

- `(source_id, external_id)`
- `(canonical_apply_url)`
- `(requisition_id)`
- `(job_id, closed_at)`
- `(source_id, last_seen_at)`

Do not store full raw responses in D1 by default. Keep normalized fields,
payload hashes, and small diagnostic metadata. Store short-lived raw fixtures
only when debugging a source.

### Canonical Job Fields

Over time, `jobs` should add:

- `primary_source_id`
- `canonical_key`
- `updated_at`
- `dedupe_version`
- `dedupe_confidence`

Keep distinct timestamps:

- `first_seen_at`: when Pinkslip first discovered the canonical job.
- `posted_at`: the best available original publication time.
- `source_updated_at`: listing edits, stored on `job_sources`.

Do not treat a source's generic `updated_at` as the publication time. For the
"beat the crowd" product promise, Pinkslip discovery time is the trustworthy
fallback.

## Adapter Contract

The adapter contract should return snapshot metadata, identity hints, and
structured locations.

```ts
interface SourceFetchResult {
  listings: SourceJobListing[];
  completeness: "complete" | "partial";
  etag?: string;
  lastModified?: string;
}

interface SourceJobListing {
  externalId: string;
  title: string;
  sourceUrl: string;
  applyUrl: string | null;
  requisitionId: string | null;
  locations: string[];
  department: string | null;
  employmentType: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  description: string | null;
  salary: string | null;
}
```

Important behavior:

- Only close missing source listings after a `complete` snapshot.
- A valid empty complete snapshot must be able to close all remaining listings.
- A partial page, parser anomaly, HTTP error, or unexpectedly truncated result
  must never close jobs.
- Use conditional requests when sources support ETag or Last-Modified.
- Adapters should have strict payload validation and fail closed on schema drift.

## Deduplication

Deduplication should be deterministic first and fuzzy only as a conservative
fallback.

### Match Order

1. Existing `(source_id, external_id)`.
2. Same normalized upstream ATS identity.
3. Same normalized canonical apply URL.
4. Same company and requisition ID.
5. Same company plus a high-confidence content fingerprint.
6. Otherwise create a new canonical job.

An upstream ATS identity is stronger than the visible source. For example, an
Otta listing that applies to a Greenhouse posting should carry the Greenhouse
board and job ID as an identity hint.

### URL Normalization

- Lowercase scheme and hostname.
- Remove fragments.
- Remove known tracking parameters such as `utm_*`, `source`, and referral IDs.
- Preserve path components and identifiers.
- Resolve only safe, allowlisted HTTP redirects.
- Reject private-network, loopback, link-local, and non-HTTP destinations.

### Content Fingerprint

Use only within the same canonical company:

- Normalized title.
- Normalized location set.
- Employment type.
- Requisition ID when present.
- Description text with boilerplate removed.

A fuzzy match should auto-merge only at very high confidence. Generic titles
such as "Software Engineer" must not merge on title and location alone.

Store uncertain candidates in a duplicate-review queue. The existing
`duplicate_listing` feedback type can feed corrections into this review flow.

### Merge Rules

Field precedence:

1. Direct ATS.
2. Company-owned career site.
3. Native network listing.
4. Aggregator.

Adding a secondary listing to an existing canonical job must not create another
notification. Closing one listing must not close the canonical job while an
authoritative listing remains open.

## Custom Sites

Custom sites should be a first-class, constrained source type rather than
arbitrary scraper code stored in the database.

### Detection

When an admin submits a careers URL:

1. Normalize the URL and verify it is public HTTP(S).
2. Detect known providers from hostname, paths, scripts, and page metadata.
3. Look for JSON-LD `JobPosting` objects.
4. Look for RSS, Atom, XML, sitemap, or documented JSON endpoints.
5. If no safe parser is found, create a review item instead of silently saving a
   nonfunctional `custom` company.

This flow would often identify a branded site as Workday, Avature, Workable,
SmartRecruiters, or another supported provider even when the ATS brand is
hidden.

### Supported Custom Modes

Implement these in order:

1. `json_feed`: allowlisted URL plus checked-in field mapping.
2. `xml_feed`: allowlisted URL plus checked-in field mapping.
3. `json_ld`: crawl an allowlisted job index or sitemap and parse `JobPosting`.
4. `html_index`: checked-in parser for a known site family.
5. `company_specific`: small code adapter with fixtures and an owner.

Avoid a database-configured arbitrary CSS-selector or JavaScript engine. It is
hard to validate, creates SSRF and maintenance risks, and makes failures opaque.

For Spotify and Shopify:

- Start with provider detection and JSON-LD/sitemap inspection.
- If their job pages expose stable structured data, add checked-in manifests.
- If they use private or heavily client-rendered endpoints, add explicit
  company adapters only if the coverage value justifies maintenance.

Every custom parser needs:

- A list fixture.
- At least one detail fixture.
- A zero-job fixture.
- A pagination fixture when applicable.
- A schema-drift test.
- A source owner and health signal.

## Polling Architecture

The current fixed batch will become progressively slower as sources are added.
Move to due-source scheduling:

1. A frequent cron selects `company_sources` where `next_poll_at <= now`.
2. It atomically claims a bounded set and sends source IDs to a Cloudflare Queue.
3. Queue consumers fetch and normalize one source at a time.
4. Ingestion is idempotent because queue delivery may be repeated.
5. Consumers update source health, backoff, and `next_poll_at`.

Suggested starting cadences:

| Source class | Normal cadence |
| --- | --- |
| Direct structured ATS | 5 minutes |
| Direct but brittle/heavy | 10-15 minutes |
| Custom company site | 15 minutes |
| Approved native network | 10-15 minutes |
| Aggregator | 30-60 minutes |

Add jitter so all sources do not hit upstream providers simultaneously.

Backoff behavior:

- `429`: honor `Retry-After`.
- `5xx` or network error: exponential backoff with a cap.
- Schema error: disable closure, mark degraded, and alert the admin.
- Large unexpected count drop: treat the snapshot as partial until confirmed.

Cloudflare Queues fit this work because they separate scheduling from fetching
and provide batching/retry behavior. Keep manual single-source polling for
verification and operations.

## Source Health

Track per-source:

- Last successful fetch.
- Last HTTP status and error category.
- Duration.
- Listing count.
- New, changed, closed, and deduplicated counts.
- Consecutive failures.
- Payload/parser version.
- Last complete snapshot.

Alert on:

- Repeated failures.
- A sudden drop to zero.
- A large count decrease.
- Duplicate-rate spikes.
- A source returning only partial pages.
- A job detail fetch repeatedly failing.

The admin UI should show companies separately from their sources and support:

- Add source by URL.
- Auto-detected provider preview.
- Verify without saving.
- Poll one source.
- Disable a broken source without hiding the company.
- Inspect duplicate matches and source variants.

## Incremental Implementation Plan

### Phase 0: Characterization

- Audit every disabled, broken, custom, and requested target company.
- Record its real careers URL, underlying provider, and importance.
- Group missing named targets by provider.
- Add fixtures for the highest-value Workday, custom, Rippling, Gem, Avature,
  and enterprise-site families found by the audit.
- Record which fields and identifiers each source exposes.
- Create an adapter capability matrix.

Exit condition: the next adapter is justified by a concrete list of important
companies, not generic ATS adoption.

### Phase 1: Highest-Coverage Direct Adapter

- Implement Workday if the audit confirms it unlocks the largest target group.
- Otherwise implement the provider with the highest target-company yield.
- Add strict pagination, completeness, and schema-drift tests.

Exit condition: a meaningful set of missing marquee companies is polling
reliably.

### Phase 2: Custom-Site Coverage

- Add provider detection.
- Add generic JSON-LD and sitemap support.
- Add checked-in JSON/XML manifests.
- Add explicit Spotify and Shopify parsers only if generic detection is
  insufficient.

Exit condition: branded careers URLs either resolve to a verified source or
produce a clear unsupported/review result.

### Phase 3: Selective Additional Direct Adapters

- Rippling or Gem based on audited target coverage.
- Avature or SmartRecruiters based on audited target coverage.
- Add enterprise families only when they unlock named target companies.

Ship one adapter at a time with fixtures, verification, and production source
health checks.

### Phase 4: Canonical Multi-Source Ingestion

- Add `company_sources` and `job_sources`.
- Add URL normalization and source identity extraction.
- Add deterministic deduplication.
- Add conservative content fingerprints and duplicate review.
- Change closure to source-listing closure and authoritative canonical closure.
- Ensure notifications are created only for new canonical jobs.

Exit condition: the same fixture arriving from two sources creates one job and
one notification candidate.

### Phase 5: Polling Scale

- Add due-source scheduling.
- Add a Cloudflare Queue producer and consumer.
- Add retries, backoff, jitter, and count-anomaly protection.
- Move source poll status from `companies` to `company_sources`.

Exit condition: adding sources does not increase the oldest direct source's
poll delay beyond its configured cadence.

### Phase 6: Approved Networks

- Seek formal access for YC first, then Wellfound.
- Ingest only native or otherwise unique listings.
- Resolve upstream apply URLs and dedupe before notification.
- Consider Welcome to the Jungle only if native unique-job yield is proven.

Do not add LinkedIn scraping.

## Future Auto-Apply Product

Auto-apply is technically possible, but the reliable product should begin as an
assisted application system rather than an invisible fire-and-forget bot.

### Why Browser Automation Is Needed

The official Greenhouse, Lever, and Ashby application APIs are employer-side
APIs that require credentials owned by the hiring company. Pinkslip cannot use
those APIs as a candidate to submit arbitrary applications.

The practical execution paths are:

1. A browser extension or desktop companion fills the form in the user's own
   browser, IP address, and session.
2. A remote browser submits public, no-login ATS forms with explicit user
   authorization.
3. A formal ATS or job-network partnership provides a supported application
   interface.

Start with the first path. It has fewer credential, session, blocking, and
privacy problems than storing every user's browser state on the server.

### Product Stages

#### Stage 1: Apply Assist

- Maintain a structured answer vault for identity, experience, authorization,
  sponsorship, location, salary, links, and reusable screening answers.
- Tailor a resume for the canonical job.
- Open the application in the user's browser.
- Detect and fill fields and upload the tailored resume.
- Pause before submission for review.

#### Stage 2: Trusted Auto-Submit

- Let users define explicit rules by company, role, location, salary, seniority,
  sponsorship and notification preferences.
- Auto-submit only when every required answer is already approved.
- Stop for CAPTCHA, login, verification, novel questions, demographic/EEO
  questions, assessments, or ambiguous answers.
- Record a screenshot, submitted values, confirmation URL, and timestamp.

#### Stage 3: Broader Automation

- Add adapter-specific form understanding for Greenhouse, Lever, and Ashby.
- Add Workday only after the first three are highly reliable; its account,
  multi-page, and screening flows are substantially harder.
- Add retries and idempotency so a failure never creates duplicate
  applications.

Never bypass CAPTCHA or fabricate qualifications. Treat work authorization,
sponsorship, criminal history, disability, veteran status, demographic
questions, legal attestations, and salary expectations as user-controlled data.

### Approximate Variable Cost

At current published prices:

- Cloudflare Browser Rendering is $0.09 per browser hour after the included
  allowance. A one-minute application is about $0.0015 in browser time.
- Gemini 3.1 Flash-Lite is $0.25 per million input tokens and $1.50 per million
  output tokens. A 10,000-input/3,000-output tailoring run is about $0.007.
- A stronger Gemini 3.5 Flash run at the same token volume is about $0.042.
- Queue and D1 costs should be negligible at early product scale.

For 100 applications per user per month, raw browser plus Flash-Lite model cost
can remain under $1. Real variable cost is more likely $2-$12 per active user
after retries, document processing, storage, observability, email, and failed
flows. Support and adapter maintenance will cost more than compute.

A plausible paid tier is roughly $20-$40 per month with an application cap,
quality controls, and a clear audit trail. The initial Greenhouse/Lever/Ashby
Apply Assist product is likely an 8-12 week focused build; dependable,
multi-ATS autonomous operation is a 6-12 month product and maintenance effort,
not a small add-on.

## Testing

Every adapter should test:

- Correct request URL, method, pagination, and headers.
- Field mapping.
- Stable external IDs.
- Publication versus update timestamps.
- Multiple locations.
- Salary and description extraction.
- Valid empty snapshots.
- Partial snapshots.
- Non-2xx responses.
- Schema drift.

Ingestion tests should cover:

- Same source and ID is idempotent.
- Same canonical apply URL across sources merges.
- Same requisition ID within a company merges.
- Similar generic jobs remain separate.
- Secondary source discovery does not notify.
- One source closing does not close a still-open canonical job.
- A partial snapshot closes nothing.
- A complete empty snapshot closes all source listings.
- A source reappearing reopens the canonical job correctly.

## Product Metrics

Track these before and after each source launch:

- Median and p95 `first_seen_at - source_published_at`.
- Poll interval achieved by source class.
- Unique canonical jobs per adapter.
- Percentage deduplicated into an existing job.
- Duplicate user reports per 1,000 jobs.
- False closure/reopen rate.
- Adapter failure rate.
- Notification delay from Pinkslip discovery.

An integration is valuable when it adds unique jobs or materially improves
discovery time. Raw listing count is not the success metric.

## Current Primary References

- Gem Job Board API:
  https://help.gem.com/databases/gem-help-center/the-job-board-api
- SmartRecruiters public Posting API:
  https://developers.smartrecruiters.com/docs/posting-api
- Recruitee Careers Site API:
  https://docs.recruitee.com/reference/intro-to-careers-site-api
- Personio open-position XML feed:
  https://developer.personio.de/docs/retrieving-open-job-positions
- Workable public/XML career feeds:
  https://help.workable.com/hc/en-us/articles/4420464031767-Utilizing-the-XML-Job-Feed
- Rippling public career boards:
  https://ats.rippling.com/pace/jobs
- LinkedIn Job Posting API:
  https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/sync-job-postings
- LinkedIn User Agreement:
  https://www.linkedin.com/legal/user-agreement
- Y Combinator Terms of Use:
  https://www.ycombinator.com/legal/#tou
- Y Combinator Recruiting ATS:
  https://www.ycombinator.com/jobs/ats
- Welcome to the Jungle ATS connection behavior:
  https://support.welcometothejungle.com/en/articles/7178536-can-you-connect-with-my-ats
- Welcome to the Jungle posting delay:
  https://support.welcometothejungle.com/en/articles/8926264-how-long-does-it-take-for-a-job-to-go-live
- Wellfound ATS sync behavior:
  https://help.wellfound.com/article/746-how-do-i-sync-new-jobs
- Wellfound terms:
  https://wellfound.com/terms
- Avature career sites and integration model:
  https://www.avature.net/leverage-the-best-career-sites-with-avature/
- Greenhouse application API:
  https://developers.greenhouse.io/job-board.html#submit-an-application
- Lever API authentication:
  https://hire.lever.co/developer/documentation#authentication
- Ashby application API:
  https://developers.ashbyhq.com/reference/applicationcreate
- Gemini API pricing:
  https://ai.google.dev/gemini-api/docs/pricing
- Cloudflare Browser Rendering pricing:
  https://developers.cloudflare.com/browser-rendering/platform/pricing/
- Cloudflare Cron Triggers:
  https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare Queues:
  https://developers.cloudflare.com/queues/
