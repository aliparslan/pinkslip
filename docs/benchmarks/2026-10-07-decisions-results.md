# Representative benchmark: Jev versus OpenAI Decisions

Run date: October 7, 2026. Recommendation: retain Jev for the current pilot.
OpenAI Decisions did not improve overall agreement on this frozen contract.
No production classification, eligibility, notification or budget settings were
changed. No fresh Jev requests were purchased for this comparison.

## Same inputs, different providers

Both models answered the frozen 27-question contract on the same 196 full-text
postings: 148 real jobs and 48 authored controls. Decisions used the direct
OpenAI `/v1/decisions` endpoint, resolving `gpt-6-luna`. Jev results are the
cached October 3 OpenRouter run, resolving `typesafe/jev-1.13-20260917`.
Question instructions and choice descriptions were preserved in translation;
reference labels and existing classifier answers were never sent to OpenAI.

Real annotations cover 228 selected fields on 76 postings; controls cover 157
fields on 48 postings. Real labels remain assistant-provisional and need owner
review. This is a deliberately stratified sample, not a population-weighted
estimate or a measurement of whole-job feed eligibility. The existing scoring
projection collapses out-of-scope job families to `other`; it does not measure
fine-grained distinctions between those families. Skills and seniority have
particularly small labelled subsets.

| Measurement | Jev | OpenAI Decisions |
| --- | ---: | ---: |
| Valid requests | 196/196 | 196/196 |
| Real labelled fields correct | 214/228 (93.9%) | 203/228 (89.0%) |
| Controlled labelled fields correct | 148/157 (94.3%) | 143/157 (91.1%) |
| Real cases with every labelled field correct | 64/76 | 57/76 |
| Controls with every labelled field correct | 40/48 | 36/48 |
| Real US eligibility fields correct | 62/66 | 57/66 |
| Real PhD internship eligibility fields correct | 7/9 | 8/9 |
| Real seniority fields correct | 5/6 | 6/6 |
| Supplementary cross-field warnings | 5 | 0 |
| Request latency median | 216ms | 236ms |
| Request latency p95 | 312ms | 389ms |
| Maximum request latency | 935ms | 1,415ms |
| Usage-based inference cost | $0.068825 | $0.165727 |

Paired real fields: both correct 197, both wrong 8, Jev alone correct 17,
Decisions alone correct 6. Paired controlled fields: both correct 139, both
wrong 5, Jev alone correct 9, Decisions alone correct 4. Across these selected
fields, Decisions fixed 10 Jev disagreements and introduced 26 others.

Zero Decisions cross-field warnings is a narrow consistency result, not proof
of accurate qualification routes. It rejected some valid doctoral-student
routes consistently. Jev's five warnings still warrant fixes or review.

## Errors relevant to Pinkslip

- **Location uncertainty became eligibility.** On two real postings whose
  location was simply Remote, Decisions answered US-eligible, against the
  provisional unclear label. Jev retained unclear. Decisions confidence was
  0.94 and 0.91, so an arbitrary high-confidence cutoff would not fix these.
- **Explicit foreign postings became unclear.** Decisions returned unclear
  instead of no on seven of the 22 real labelled foreign postings; Jev did so
  on four. Examples where Jev succeeded include Applied Intuition in Tokyo,
  Snowflake's Berlin Java Platform role, and GitLab Remote, Poland. Neither
  model answered yes for a labelled explicitly foreign posting in this sample.
  A fail-closed policy would send these unclear results to review rather than
  show them to US-only users.
- **Clear doctoral controls still failed.** For an internship requiring
  "Currently pursuing a PhD in computer science," Decisions marked PhD
  eligibility unknown (confidence 0.91), while Jev answered yes. For enrollment
  in BS, MS or PhD, Decisions rejected the PhD-student experience route. It
  also admitted a PhD cohort where BS/MS enrollment was mandatory and PhD
  research experience appeared only as a preference. Jev got those cohort
  decisions right, though it had a contradictory student-route answer on the
  preferred-PhD control.
- **Degree and experience alternatives remained fragile.** Decisions gave an
  ineligible bachelor's route on the master-or-PhD control and on a real Airbnb
  role. It also missed a valid PhD-student route on a Zipline internship that
  explicitly said master's and PhD students were eligible. These require
  coherent qualification routes, not independent minimum-degree/year answers.

Both models also share some labelled disagreements, and some real reference
cases have known ambiguity. Do not tune the contract against these results and
then describe the same sample as fresh validation. The frozen labels were not
changed after viewing provider answers.

## Cost and latency

Decisions returned 1,657,269 input tokens, zero cached tokens and zero output
tokens. At the documented $0.10/M Decisions rate, its cost was $0.1657269;
this is computed from returned usage, not a separate account invoice. The
Jev run reported 1,638,684 input tokens and $0.068824728 cost. OpenAI requests
used a single pilot followed by at most two concurrent calls, with no automatic
retries, under the $0.50 observed-cost stop. There were no errors, refusals,
invalid answers or unknown usage calls. No additional paid calls were needed
for scoring.

At this measured request size, 10,000 uncached classifications would be about
$8.46 for Decisions versus $3.51 for Jev, an extra $4.94. These are inference
costs, not a monthly forecast; only new or changed postings should incur calls.

Measured Decisions latency was about 20ms slower at the median and 77ms slower
at p95. Runs occurred four days apart through different provider routes; those
differences are descriptive, not proof of an inherent model-speed advantage.
The app now routes Jev through Workers AI, whose latency was not measured here.
OpenAI's roughly 10x claim is relative to Responses, not Jev.

## Next step

Keep Jev's budgeted comparison mode. Prioritize owner-reviewed labels and
consistent handling of uncertain locations and degree/enrollment routes before
allowing model facts to drive feed eligibility. Decisions remains a benchmark
candidate, but the current evidence does not justify replacing Jev or running
both on every posting. Any future model-specific question improvements should
be evaluated on a separate held-out set.

Reproduce scoring without further provider charges:

```sh
python scripts/benchmarks/analyze_representative.py \
  --root "$benchmark_directory" --providers baseline jev decisions
```

Private inputs, frozen labels and raw caches remain outside Git. This report
contains only aggregate results and public posting examples. Sources:
[Decisions guide](https://developers.openai.com/api/docs/guides/decisions),
[original sample and Jev results](2026-10-03-representative.md).
