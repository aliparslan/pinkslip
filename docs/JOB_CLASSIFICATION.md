# Classification audit and Jev shadow pilot

The deterministic catalog policy remains authoritative. This change repairs
verified title and qualification misses and adds a bounded Jev comparison path.
Jev does not write job features, accept jobs, change human labels, or send alerts.
This is not yet a production model classifier rollout.

## Enablement

Apply migration `0078_classification_shadow.sql` with the normal migration process
before enabling either mode. Both modes are off unless explicitly configured:

- `JOB_CLASSIFICATION_AUDIT=true`: progressively record catalog decisions for
  source listings, including rejected rows. Unchanged content and decisions do
  not incur repeated writes. No provider calls.
- `JOB_CLASSIFICATION_SHADOW=true`: also sample listings for Jev. Includes all
  rejection categories, rather than sampling only today's accepted jobs.
- `OPENROUTER_API_KEY`: Cloudflare secret containing a dedicated restricted
  OpenRouter inference key. Never put a real key in TOML, examples, Git or logs.
- `JEV_DAILY_CALL_LIMIT`: integer 0–100; default 100, zero pauses calls. Invalid
  values fail closed. This cannot raise the hard 100-call daily ceiling.

Audit at most 25 listings per recording checkpoint. Unseen IDs are prioritized;
after the initial inventory is covered, cached rows rotate on the polling cadence
to detect content changes. This bounds hashing, writes and time spent holding
large source snapshots in memory. Large boards need multiple observations before
the audit covers their full inventory. Ingestion itself still examines the full
source snapshot. Start with a small sample before enabling shadow across sources.
The cache records observed catalog decisions; it is not a historical archive or
the final personalized match decision. Existing human overrides remain separate.
Source adapters that omit descriptions for rejected rows contribute decision
telemetry, but cannot enter the model sample until full content is available.
Reference-only sources record successfully hydrated detail rows, not uninspected
references. No extra crawl is added merely to obtain a rejected description.

## Limits and cache

One D1 queue reuses the existing notification cron. Jev runs after notification
delivery, with at most ten calls per invocation, two concurrent calls, and an
eight-second request deadline. Feed reads do not call the provider. Queue capacity
is enforced atomically at 500 pending/running rows. Polling samples at most eight
rows per company/checkpoint and two per first-rejection category. Samples that
cannot enter a full queue remain eligible at the next observation.

The cache key includes source identity, SHA-256 of the full source content, gate
version, requested model and question version. Accepted and rejected results are
both cached. Content, policy or question changes permit a new result; an unchanged
source row is never automatically billed again, including provider failures.
No historical bulk backfill is started by deployment.

Inference descriptions are capped at 12,000 characters and metadata fields at
500 each. Truncated samples are explicitly marked: a requirement omitted past
the cap can change the result, so those results need separate review. Input text
is released after success or ordinary failure; hashes, answers and usage remain.

Daily call reservations are atomic and happen before inference. Timeouts and
crashes consume quota. Expired ten-minute leases can be reclaimed once, with a
maximum two attempts per cache key; ordinary HTTP/malformed-output failures are
retained for review and receive no automatic paid retry. The limit is a request
ceiling, not a guaranteed dollar cap. Set a dollar limit on the dedicated
OpenRouter key as well. Estimated fees depend on actual token usage; no new
paid queue or AI subscription is required by this implementation.

## Review and usage

Admin-only `GET /api/v2/metrics/classification` exposes reason counts, queue
statuses, daily reservations, reported token/cost totals, average provider latency,
and the 50 latest completed/failed samples with their posting URLs and answers.
Each sample preserves the deterministic facts computed from the full source text
at capture time, so review can compare individual fields with Jev's answers.
Reason counts cover audited rows and are incomplete during initial cache filling.
No key or input description is returned. Counts of stored decisions are not a
live source inventory: sources may remove rows between observations.

The nine core questions cover US eligibility, job family, mandatory experience
band and exact years, required education, doctorate requirements, clearance,
seniority and work mode. The v2 qualification question contract creates a new
cache key; it does not re-enable shadow or raise the daily call limit. Skills extraction is
deliberately deferred until the core policy is calibrated. Explicit `unclear` and
`unknown` answers are preserved. There is no unvalidated confidence threshold
that silently admits or rejects jobs. Probability is not measured accuracy.

The tested provider interface is OpenRouter's `/api/v1/systemone`, requested model
`typesafe/jev-1.13`. Each result records the resolved model ID, request ID, latency,
input/output tokens and provider-reported cost. Missing cost stays unknown;
failed requests may have incurred charges that need provider reconciliation.
Reservations may exceed completed rows after crashes; provider usage is the
source of truth for billing. The same inference key can read OpenRouter's
`/api/v1/key` daily/weekly/monthly usage; no management key is necessary.

Before model decisions influence the feed, label a separate representative set
covering false accepts and false rejects, evaluate each fact and eligibility
outcome, and verify real ingestion-to-alert timing. This stratified queue finds
disagreements; it does not establish a population-wide accuracy rate.

## Education and experience preferences

Apply `0079_qualification_requirements.sql` before deploying classifier v23 and
matcher v17. Qualification groups are extracted deterministically once per
listing and cached in `job_features.qualification_requirements_json`. All groups
must be satisfied, but any complete route in each group can qualify. For
`bachelor's + 4 years OR master's + 2 years`, the catalog sees the two-year route;
a bachelor's graduate cannot borrow its years without also meeting its degree.
Independent minimums still apply. Experience ranges use their lower bound.

Search profile v5 adds optional highest completed education, a numeric
`years_experience`, `max_required_years` (null follows personal experience), and
`include_unspecified_experience`. Default migration keeps the former three-year
ceiling, includes unstated experience, and applies no new education filter.
Existing v4 role/stage choices and internship consent remain intact. Older
clients that omit the new fields preserve the saved values. Preference edits
invalidate matches and cancel pending alerts so feed and delivery use the same
policy. Migration resets cursors even for users with no former matches.

Mandatory completed degrees filter only when users select their education.
Preferred and contextual mentions do not gate, explicit equivalent-experience
routes remain available, and unstated education stays included. Current
enrollment is distinct from a completed credential and is not inferred from the
completed-education preference. These controls narrow the existing catalog:
the US, early-career, three-year, doctorate-only and clearance policies remain.
No extra model calls occur when users change preferences. Additional Jev shadow
questions support comparison only; independent lowest-degree and lowest-years
answers cannot safely represent conditional routes and never drive matching.

## Startup sources

Investor boards such as a16z, Accel, Sequoia and Techstars are discovery sources.
Resolve company identity and follow the original application link during
onboarding or source repair, then poll the employer's supported ATS directly.
Keep the investor URL as provenance and deduplicate against existing ATS/company
identities. Stable investor-board IDs do not establish employer ownership or
freshness. A platform-native listing without an employer ATS can be a primary
source if its provenance and closure behavior are validated. Investor-board
discovery adapters are not included in this classifier change.
