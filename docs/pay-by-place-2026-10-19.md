# Pay by place (2026-10-19)

The owner, looking at a job's Locations sheet: "it should be showing the
salary with the location right?" Today it can't: Pinkslip keeps one pay
range per job and drops which place it's for.

## Where it's lost

- **Greenhouse** (`worker/adapters/greenhouse.ts`) sends
  `pay_input_ranges: { min_cents, max_cents, currency_type, title }[]`. The
  importer keeps `[0]` (`formatGreenhouseSalary`) and drops its `title`, the
  zone's name.
- **Posting text** (`extractSalaryFromHtml` in `worker/adapters/salary.ts`)
  keeps every range it matches but not the place words around them;
  `normalizeSalaryText` and `formatCompactSalaryText`
  (`packages/core/src/job-format.ts`) then show only the first band.
- **Ashby** gives `compensationTierSummary`, one summary string. **Lever**
  gives one `salaryRange`. Both carry one range today.

## What Greenhouse sends (live boards, 2026-10-19)

| Board | Jobs with 2+ ranges | What a range's title says |
| --- | --- | --- |
| Robinhood | 119 of 151 | The places: "Zone 1 (Menlo Park, CA; New York, NY; Bellevue, WA; Washington, DC)" |
| Airbnb | 1 of 177 | The country: "France Annual Pay Range", "Italy Annual Pay Range" |
| Databricks | 166 of 901 | Only the zone: "Zone 1 Pay Range"; the zones are defined in the posting's text |
| Dropbox | 12 of 18 | Only the zone: "US Zone 2", "US Zone 3" |
| Anthropic, Figma, Discord | 0 | One range, or none |

So a range's title names its places sometimes (Robinhood, Airbnb) and
only a zone other times (Databricks, Dropbox).

## Proposed data (additive)

`salary` stays exactly as it is, so builds already on phones keep working.
Each job gains `pay_ranges`, a JSON list kept in a new nullable column:

```ts
interface PayRange {
  /** The zone or place as the posting names it: "Zone 1", "France". */
  label: string | null;
  /** The places it covers, when the label or posting names them. */
  places: string[];
  min: number;
  max: number;
  currency: string;
  period: "year" | "hour";
}
```

- Greenhouse fills it from every `pay_input_ranges` entry. Places come from
  a title's parentheses ("Zone 1 (Menlo Park, CA; …)") or a title that is a
  place ("France Annual Pay Range"). A bare zone keeps its label with no
  places.
- Other sources fill one entry (or none) until they're looked at.
- The job API returns `pay_ranges`; the app matches each of the job's
  places to a range by name (the same `placeMatches` aliases the Locations
  sheet uses).

## On screen

Paper "Pay by place · Oct 19". The owner picked P2, and P1 for postings
that name only zones ("if we know what cities are in each zone, then we can
go back to grouping"):

- The ticket's Pay is the range for the place on its Location line (your
  search's place first). A posting that names only zones shows the full
  spread there.
- The Locations sheet groups places under each range (P2). Zones that name
  no places are listed by their zone's name with their pay beside them
  (P1), under the places.

Built 2026-10-19: `shared/pay-ranges.ts` (reading a title, formatting,
matching a place), Greenhouse asks for `pay_transparency` on the list and on
one job (one job's page had never listed its ranges), the poller stores
`pay_ranges`, and the job API returns them. Jobs saved before read their
ranges the first time they're opened.

Building needs a migration (the new column) and a Worker deploy, each with
the owner's go-ahead.
