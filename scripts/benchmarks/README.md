# Representative classifier benchmark

This is an offline benchmark, not a production classifier switch. Provider
requests contain only title, location, department and complete public posting
text plus the frozen questions. They never contain reference labels, current
classifier answers, reporter identity or admin notes. No jobs are modified.

The October 3, 2026 sample contains 148 real postings from 92 companies and 11
adapters, plus 48 authored controls. It deliberately oversamples reports,
reviews, foreign locations, doctoral routes, internships, senior roles and
non-software functions. It is not a population-weighted accuracy estimate.
Previous reference postings are distinguished from held-out postings.

Real annotations cover 228 selected fields in 76 postings. They were frozen
before new provider inference, but are assistant annotations and need owner
review. Controls have 157 labelled fields. Neither set labels every field on
every posting. Unknown/unlabelled answers are not assumed correct. The current
parser has no language extraction or location-region output; compare models
only on shared dimensions. Its four job families are compared by collapsing
out-of-scope model families to `other`, consistently for both providers.

`representative_sample.py` consumes authorized public-text snapshots and a
previous reference set. `representative_challenges.py` writes controlled
postings. Keep snapshots, inference cache and real annotations in a private
scratch directory, outside Git. Freeze SHA-256 hashes of `real-labels.json` and
`challenges.json` in `labels-frozen.json` before calling any provider. Assemble
`dataset.json` from the real sample plus controls, retaining provenance.

Run from the repository root:

```sh
python scripts/benchmarks/run_representative.py --root "$benchmark_directory" --provider jev --dry-run
# OPENROUTER_API_KEY is supplied in the process environment, never in CLI arguments.
python scripts/benchmarks/run_representative.py --root "$benchmark_directory" --provider jev --budget 0.20
# Cloudflare equivalents need CLOUDFLARE_API_TOKEN with Workers AI permission.
python scripts/benchmarks/run_representative.py --root "$benchmark_directory" --provider clef --budget 0.80
python scripts/benchmarks/run_representative.py --root "$benchmark_directory" --provider clef-flash --budget 0.30
bun scripts/benchmarks/representative_baseline.ts "$benchmark_directory"
python scripts/benchmarks/analyze_representative.py --root "$benchmark_directory"
python scripts/benchmarks/build_representative_review.py --root "$benchmark_directory"
```

The default contract is checked in as `representative-questions.json`. All
providers receive the same 27 questions and full descriptions; input is never
silently truncated. Limits: 250 postings, two concurrent calls, a single pilot,
no automatic retries, authentication/rate-limit stop, cached successes and
failures. A corrected credential requires explicitly removing just failed
authentication cache entries; successful calls remain cached. This is an
estimated budget and an observed-cost stop, not a provider-enforced billing
cap. Failed calls without usage cannot be assumed free. Default published
input rates used for estimates are Jev $0.042, Clef $0.24 and Clef Flash $0.09
per million tokens; Cloudflare billing/allowances may differ. Prefer returned
usage costs when provided.

The parser projection evaluates extraction facts, not end-to-end feed
eligibility. It uses the current parser and qualification matcher on the same
plain text. It does not simulate closed-job removal, source polling, freshness,
user locations, title-scope rejection or notification delivery. In particular,
a broad parser family assignment can be stopped later by title-scope rules.
Do not interpret that assignment alone as a feed leak.

`review.html` hides provider answers and can export edited owner annotations.
It does not send data anywhere or persist edits after closing/reloading the
page. Exports contain changed fields only, plus explicitly cleared field names.
Unchanged provisional fields remain provisional, not explicitly approved.
Preserve original frozen scores and report reviewed scores separately. Known
reference ambiguities include a Pinterest graduate posting whose body calls
it an internship, and language mentions inside explicit negations. These are
review issues rather than unquestionable model errors.

For deployment, keep hard policy limits and coherent qualification routes
outside the model. `unclear` must go to review. Validate cross-field consistency:
a rejected PhD cohort cannot also provide an eligible student route, and
current enrollment cannot substitute for a completed PhD. Cache extraction
by normalized content/model/contract version and classify only new or changed
postings. Do not send every unchanged job through AI on every polling cycle.
