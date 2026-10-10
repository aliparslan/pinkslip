# Parity review (port plan 5.1), 2026-10-10

Every row of [port-parity.md](port-parity.md) checked against the React web app
after Batch D (`2be3d16`). Native-only requirements belong to Phase 6 and are
not judged here. Evidence is the code path plus the e2e spec that exercises it.

## Result

- **Web rows:** all implemented, except the decisions below.
- **Fixed during this review:** the admin inbox kept keyboard focus nowhere
  after a decision removed an entry (R16), so focus now moves to the entry that
  took its place, or to the empty message. A pending job description now
  announces when it arrives, or that it isn't available (R02).
- **New evidence:** `e2e/a11y.pw.ts` runs axe (WCAG 2.1 A/AA) on all 23 screens
  at 390px and 1280px in light mode, and at 1280px in dark mode, as an admin
  with every feature flag on. No violations. The full suite has 89 tests.

## Owner decisions (2026-10-10)

| # | Row | Decision |
| --- | --- | --- |
| 1 | G14, N03 offline | **Cut for the web.** No cached app shell or cached reading; the offline strip shows and Query pauses and resumes requests. Revisit with the Expo app, which can persist the Query cache. |
| 2 | R13 web Apple sign-in | **Deferred to Phase 6.** Email sign-in covers the web. The owner's email account was made an admin so the admin pages work on the web meanwhile. Web Apple sign-in needs a Services ID (domain and return URL) in the Apple Developer portal, and the API has to accept its audience and exchange codes with it. |
| 3 | R03, R11 tailoring | Coming-soon pages (D7 placeholder, 4.15), already decided. |
| 4 | R06 Privacy and Support on You | Hidden (owner, 2026-10-10). The pages remain. |
| 5 | R01 failed filter Apply | **Keep the URL model.** A failed load for new filters shows Retry; Back returns to the previous filters and their cached rows. |
| 6 | R16 Undo focus | Accepted: Undo restores the item, and focus stays on the toast. Focus after removal is fixed. |
| 7 | Search launch | **On.** `SEARCH_INDEXING` is `"on"`: `/`, job pages, `/about`, `/privacy` and `/support` can be indexed; everything else stays `noindex`. Owner steps: submit `https://pinkslip.work/sitemap.xml` in Search Console and run the Rich Results test on a job page. The Klim web licence is still to buy. |

## Notes on rows that read differently from the app

- **R09 source-type filter:** the Svelte user view filtered by ATS in code but
  never showed the control (only admin mode did). The React user view matches
  that; admin Sources has the filter.
- **R20 "Open Pinkslip" link:** it's "Browse jobs" now, pointing to the feed.
- **Prep sheet "load the local resume attachment":** this is only for native
  autofill. The web opens the employer's form in a new tab, and the person
  attaches the PDF there.
- **R07 relocation:** the "Anywhere in the US" location chip sets it, as in 4.6.

## Native rows (Phase 6)

These are G05, G08, the native halves of G01, G03, G07 and G13, native Undo
variants, R08 APNs, R10 native import (D10), R13 native auth, the native
auto-apply browser (prep rows 3–5), and D9 native admin.
