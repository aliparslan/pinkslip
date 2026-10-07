# OpenAI Decisions comparison: prepared, live run pending access

Research date: October 7, 2026. No OpenAI requests were made. There is no
measured Decisions accuracy, latency or billed cost yet.

## Verified API

The [official guide](https://developers.openai.com/api/docs/guides/decisions)
documents a public beta using `POST https://api.openai.com/v1/decisions`,
currently with `gpt-6-luna`. It supports predicate, choice and score questions
over shared text or image input. The existing benchmark's 27 discrete questions
map to choice questions without changing the instructions or option meanings.
Named answers include the selected option, probabilities and confidence;
individual questions can return refusals. OpenAI authentication is required;
an OpenRouter credential is not a direct OpenAI credential.

Decisions-specific pricing is $0.10 per million input tokens, with no cache-read,
cache-write or output-token charges. Regional premiums and long-context
multipliers can apply. This is distinct from ordinary Luna Responses pricing.
The benchmark uses public job text, standard short-context processing, and no
regional processing selection. Input usage determines its estimated charge.
The provider's advertised roughly 10x speedup is against Responses, not Jev.

## Current Pinkslip setup

GitHub main `abf95cd` has moved Jev shadow comparisons to `typesafe/jev` on the
Workers AI binding. Configuration enables the pilot with a $10 monthly budget
and a hard 100-call daily ceiling; deployment state was not queried in this
study. The shadow path does not determine feed eligibility or delay delivery
on model answers. Admin disagreements are useful review candidates, but
disagreement with rules alone is not proof of a model error or improvement.

The previous representative Jev benchmark used OpenRouter and resolved
`typesafe/jev-1.13-20260917`. It completed 196 cases for $0.068824728, with
1,638,684 reported input tokens. Median latency was 216ms and p95 312ms.
Real provisional labelled-field agreement was 214/228; authored controls were
148/157. These are selected-field results, not whole-job eligibility accuracy.
The sample is deliberately stratified and labels still need owner review.

## Cost scale

Holding the previous token volume fixed, at standard uncached input rates:

| Classifications | Jev at $0.042/M | Decisions at $0.10/M | Difference |
| --- | ---: | ---: | ---: |
| 196 | $0.069 | $0.164 | $0.095 |
| 10,000 | $3.51 | $8.36 | $4.85 |
| 100,000 | $35.11 | $83.61 | $48.50 |

These are illustrative model costs, excluding platform overhead. Different
tokenizers, question encoding and cache treatment can change actual usage.
The new Decisions request-byte dry run estimates $0.184 for 196 cases;
it is not a measured bill. The runner retains its $0.50 default observed-cost
stop, single pilot, two-call concurrency, no automatic retries and cache.
This stop is not a provider-enforced spending cap.

## Comparison and decision

First run the frozen 196-case contract, preserving complete posting text and
keeping labels out of requests. Compare real postings separately from controls,
using paired correct/incorrect field results. Inspect US location false accepts,
wrong doctoral cohorts, completed-degree versus enrollment requirements, and
degree-linked experience routes. Compare cross-field contradictions, invalid
answers and uncertain results as well as latency and cost.

Historical cached Jev results give a cheap first comparison. A fresh latency
comparison needs current calls and the same environment; OpenRouter versus
Workers AI route differences must be reported. Owner review and a separate
held-out set are required before promoting model answers to eligibility rules.
If Decisions only helps ambiguous cases, use it on those cached extraction
misses rather than paying for two models on every listing or every poll.
Classification remains per new/changed posting, not per user or feed read.

The adapter, analyzer option and six offline protocol/guard tests are prepared.
The existing benchmark scores were checked and preserved. The only immediate
blocker to the live OpenAI run is an authorized `OPENAI_API_KEY` in the test
environment. No production classifier switch is part of this study.
