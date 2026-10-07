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
# Decisions needs your own OPENAI_API_KEY in the process environment.
python scripts/benchmarks/run_representative.py --root "$benchmark_directory" --provider decisions --dry-run
python scripts/benchmarks/run_representative.py --root "$benchmark_directory" --provider decisions --budget 0.50
bun scripts/benchmarks/representative_baseline.ts "$benchmark_directory"
python scripts/benchmarks/analyze_representative.py --root "$benchmark_directory"
# After a complete, valid Decisions run:
python scripts/benchmarks/analyze_representative.py --root "$benchmark_directory" --providers baseline jev decisions
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

OpenAI Decisions uses `POST https://api.openai.com/v1/decisions`, model
`gpt-6-luna`, in public beta as of October 7, 2026. The adapter preserves every
question's instructions and option descriptions, converting the contract's
named criteria to OpenAI's named questions and value/description choices. It
serializes the same four posting fields as shared input. No reference answer
is added. Returned refusals, missing questions, unknown options and duplicate
names fail validation. Raw answers retain probabilities and confidence for
later calibration; neither is treated as measured accuracy.

Decisions costs $0.10 per million input tokens, with no cache-read, cache-write
or output-token charges. The benchmark records cost from returned input usage,
excluding cache reads, at the standard short-context price. It does not request
regional processing. All current cases are well below the long-context pricing
threshold. The 196-case dry-run estimate is approximately $0.184, using bytes/4;
this is not a measured charge. No OpenAI credential is bundled with the repo.
Source: [Decisions guide](https://developers.openai.com/api/docs/guides/decisions).

Keep Jev's cached October 3 run as a historical reference. For a current
provider/latency comparison, use a fresh private dataset directory, preserving
the exact dataset and frozen labels, and rerun both models. Latency depends on
the provider route: the original Jev run used OpenRouter, while the current app
uses Workers AI. A difference in these measurements is not necessarily a model
speed difference. Do not call either model again merely to rescore cached data.
The analyzer requires complete, valid runs and reports paired labelled-field
wins/losses for Jev versus Decisions, separately for real postings and controls.

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
