# Representative classifier benchmark — October 3, 2026

Jev improves extraction on this sample, but needs deterministic policy checks,
review for unresolved answers, and qualification consistency validation before
being used to determine feed eligibility. Production Jev classification remains
disabled. No production job records changed during the benchmark.

## Coverage and limitations

196 complete postings: 148 real, spanning 92 companies and 11 source adapters,
plus 48 authored controls. Includes live reported/reviewed jobs, held-out foreign,
remote, doctoral, internship, senior and non-software postings, with earlier
reference postings identified separately. The sample is deliberately stratified,
not representative of traffic proportions. No descriptions were truncated.

76 real postings have 228 provisional field annotations frozen before fresh
inference. These are assistant annotations, not owner-approved ground truth.
Controls have 157 labels. Unlabelled fields are not counted. Reported field
agreement is not whole-job accuracy or an estimate of production feed accuracy.

## Results

| Scored subset | Current parser | Jev |
| --- | ---: | ---: |
| Shared fields, provisional real postings | 167/199 (83.9%) | 186/199 (93.5%) |
| Shared fields, controlled cases | 115/133 (86.5%) | 127/133 (95.5%) |
| All annotated fields, provisional real postings | Unsupported fields excluded | 214/228 (93.9%) |
| All annotated fields, controlled cases | Unsupported fields excluded | 148/157 (94.3%) |

Shared family comparisons collapse model families outside software/data/security
to `other`; unsupported parser skills and location-region fields are excluded.
On shared real fields, Jev matched 19 more annotations, an increase of 9.5
percentage points. This is preliminary evidence, not an independently validated
accuracy gain. The current parser is an extraction baseline, not the entire
production admission workflow.

| Shared real-job field | Current parser | Jev |
| --- | ---: | ---: |
| US eligibility | 60/66 | 62/66 |
| Work mode | 15/18 | 17/18 |
| Non-doctoral experience minimum | 7/7 | 7/7 |
| Coarse job family | 17/20 | 19/20 |
| Specialty | 5/9 | 9/9 |
| Seniority | 5/6 | 5/6 |
| Doctorate requirement status | 15/15 | 15/15 |
| PhD internship cohort | 6/9 | 7/9 |
| Bachelor / master / doctorate / enrolled PhD experience routes | 37/49 | 45/49 |

Jev returned all 196 outputs in the valid question schema, with zero request
errors. That does not establish correctness. Resolved model:
`typesafe/jev-1.13-20260917`.

Fresh Clef and Clef Flash each stopped after one HTTP 401 pilot request. The
current Cloudflare token is active for deployment but Workers AI access fails;
an earlier AI token is expired. There is no fresh Clef comparison under this
contract. Earlier benchmarks used a different scope and must not be combined.

## Cost and latency

Provider-reported Jev cost for 196 calls: **$0.068824728**. At this input size and
27-question contract, 1,000 calls would be about **$0.35**, and 10,000 about
**$3.51**. These are extrapolations, not monthly forecasts; changed-job volume,
contract size, text length and future rates matter.

Measured request latency, with two requests at most in flight: **216 ms median,
312 ms p95, 935 ms maximum**. The local parser was 3.7 ms median / 8.2 ms p95.
This measures this provider run from this environment, not full job-to-alert
latency or production load. No retries were needed or enabled. Predicted gross
costs for the blocked full Clef/Flash runs were about $0.37 / $0.14, before any
Cloudflare account allowance; neither full run occurred.

## Findings that affect implementation

- Jev sometimes says `unclear` for explicitly foreign job locations. Keep the
  deterministic country check and never turn an unresolved answer into US
  eligibility. In these annotated cases it did not confidently admit a foreign
  job as US eligible.
- It incorrectly gave an enrolled PhD student a 3-year route for Meta's
  Multimedia & Multimodal AI role. The posting requires 8 years, or 4 years
  **with a PhD**, plus an independent 3-year ML requirement. Enrollment is not
  degree completion.
- Some outputs reject a PhD internship cohort but simultaneously give the PhD
  student an experience route. Five cross-field warnings occurred across the
  complete dataset. Contradictory outputs should go to review.
- Generic graduate-program and unrestricted degree-program internships remain
  difficult. Some actual eligible postings were unresolved by Jev. The parser
  also misses some of these and can mishandle explicit undergraduate/master
  exclusions or mixed eligibility.
- A completed-PhD internship control was marked PhD-eligible despite requiring
  completion before joining. Keep completion and enrollment distinct.
- Negative language mentions were returned as `mentioned` rather than `absent`.
  They were not labelled required or preferred; this is a reference/contract
  semantic issue to settle before using skills as filters.
- A Pinterest Toronto graduate posting contains conflicting internship wording
  in its body. Its seniority reference needs owner review, not an unquestioned
  assertion that the model is wrong.

## Recommended next step

Review the blinded real-job annotations, especially ambiguous cases. Repair
cohort/qualification consistency checks with focused regression examples, then
finish the same frozen benchmark on Clef and Clef Flash after restoring AI
access. If Jev is adopted, start with new/changed uncertain postings, retain
hard exclusions, cache results by content and contract, and cap daily usage.
Do not reclassify the entire database on every polling cycle.

Reproducible harness and contract: `scripts/benchmarks/`. Raw source snapshots,
cache and a model-blinded review document remain outside Git.
