# Source health audit (2026-10-12)

The admin Sources screen reports 57 sources that "need attention". This audit
checks whether they can be fixed.

**Status:** the owner approved every fix (2026-10-12). Migration
`0087_source_catalog_repair.sql` repairs the catalog. Migration
`0088_empty_snapshot_since.sql`, together with the poller change, fixes the
empty-board errors (option 1 in section 7). Both apply with the next
`bun run deploy:backend`. See "What was applied" at the end.

## How this was checked, and its limits

- This session can't read production. Starting a session on the live site was
  refused, and there are no Cloudflare credentials. So the catalog was rebuilt
  by applying all 85 migrations to a local SQLite file: 1,115 enabled sources
  and 28 disabled ones.
- Every source was polled with Pinkslip's own adapters (`worker/ats.ts`), the
  same discovery path `pollCompany` uses, from this container's network. No
  database was written.
- **Production has drifted from the migrations.** Migration 0049 records 221
  enabled sources at that point, but the migrations alone give 245. Some
  sources were disabled, removed or edited in the admin, and some may have
  been added there. So the 130 broken boards below are a superset of the
  production list, not the same 57. Any of the 57 that match a row here can be
  fixed as shown. A row already fixed in production is simply skipped (see
  "Applying the fixes").
- The 28 sources the migrations add disabled (Apple, Google, Meta, Uber,
  PayPal, Bloomberg and six Workday companies) all poll cleanly, except Tesla.
  Tesla's state API returned 403 to this network, which may not apply to
  Cloudflare's.

## Summary

Of 1,115 enabled sources, 130 fail with a 404 (89 Greenhouse, 41 Ashby): the
board no longer exists under that slug. Another 85 return a valid but empty
board, and those can also show as errors (see the last section).

| Outcome for the 130 broken boards | Count |
|---|---|
| Fixable: moved to another board or slug, verified live | 69 |
| Fixable: board is live but has no openings right now | 7 |
| Board found, but no US roles: re-point or disable (owner's call) | 4 |
| Acquired, and covered by another source: disable | 5 |
| Jobs are on a platform Pinkslip can't read: disable or build an adapter | 9 |
| No public board found: disable | 36 |

"Verified" means the candidate board was read through Pinkslip's adapter and
its postings name the company. For Rippling and YC boards, which don't return
descriptions, the board's own company name or website was checked instead.

## 1. Moved boards (69): re-point

| Source | Now | Move to | Jobs today |
|---|---|---|---|
| Alchemy | greenhouse `alchemy` | ashby `alchemy` | 20 |
| Amplitude | greenhouse `amplitude` | ashby `amplitude` | 39 |
| Applied Intuition | greenhouse `appliedintuition` | ashby `applied` | 323 |
| Belvedere Trading | greenhouse `belvederetrading` | lever `belvederetrading` | 19 |
| Bilt Rewards | greenhouse `biltrewards` | gem `bilt` | 20 |
| Boom Supersonic | greenhouse `boomsupersonic` | rippling `boom-supersonic` | 29 |
| Boston Dynamics | greenhouse `bostondynamics` | workday `https://bostondynamics.wd1.myworkdayjobs.com/en-US/Boston_Dynamics?country=US` | 31 |
| ClickHouse | greenhouse `clickhouse` | ashby `clickhouse` | 194 |
| Coalition | greenhouse `coalitioninc` | greenhouse `coalition` | 40 |
| Coder | greenhouse `coder` | ashby `coder` | 25 |
| Commonwealth Fusion Systems | greenhouse `commonwealthfusionsystems` | lever `cfsenergy` | 123 |
| Convex | ashby `convex` | ashby `convex-dev` | 13 |
| Eight Sleep | greenhouse `eightsleep` | ashby `eightsleep` | 37 |
| Five Rings | greenhouse `fiverings` | greenhouse `fiveringsllc` | 17 |
| Form Energy | greenhouse `formenergy` | ashby `formenergy` | 205 |
| Function Health | ashby `functionhealth` | gem `function-health` | 33 |
| Hadrian | ashby `hadrian` | gem `hadrian` | 4 |
| Hasura | greenhouse `hasura` | gem `promptql` | 5 |
| Headlands Tech | greenhouse `headlandstech` | greenhouse `headlandstechnologiesllc` | 8 |
| Heirloom | greenhouse `heirloomcarbon` | ashby `heirloomcarbon` | 2 |
| Helion Energy | greenhouse `helionenergy` | ashby `helion` | 69 |
| Hermeus | greenhouse `hermeus` | lever `hermeus` | 81 |
| Hightouch | greenhouse `hightouch` | ashby `hightouch` | 1 |
| Hims & Hers | greenhouse `forhims` | ashby `hims-and-hers` | 141 |
| Hippo | greenhouse `hippoinsurance` | greenhouse `hippo70` | 21 |
| Hopper | greenhouse `hopper` | ashby `hopper` | 19 |
| Inceptive | ashby `inceptive` | greenhouse `inceptive` | 11 |
| Insitro | greenhouse `insitro` | ashby `insitro` | 14 |
| K2 Space | ashby `k2space` | greenhouse `k2spacecorporation` | 251 |
| Kit (ConvertKit) | greenhouse `kit` | ashby `kit` | 9 |
| Kraken | greenhouse `payward` | ashby `kraken.com` | 82 |
| Linktree | greenhouse `linktree` | gem `linktree` | 29 |
| M1 Finance | greenhouse `m1finance` | smartrecruiters `M1Finance` | 1 |
| Magic Eden | greenhouse `magiceden` | ashby `magiceden` | 5 |
| Motion | greenhouse `usemotion` | yc `motion` | 1 |
| Opendoor | greenhouse `opendoor` | rippling `opendoor` | 58 |
| OpenSea | greenhouse `opensea` | ashby `opensea` | 2 |
| Oura | greenhouse `ouraring` | greenhouse `oura` | 75 |
| Pacific Fusion | ashby `pacificfusion` | greenhouse `pacificfusion` | 25 |
| Palantir | greenhouse `palantir` | lever `palantir` | 309 |
| Persona | greenhouse `withpersona` | ashby `persona` | 13 |
| Pilot | greenhouse `pilot` | greenhouse `pilothq` | 9 |
| Polygon Labs | greenhouse `polygonlabs` | ashby `polygon-labs` | 3 |
| Porter | ashby `porter` | yc `porter` | 8 |
| Postmark | greenhouse `activecampaign` | lever `activecampaign` | 13 |
| Pulumi | greenhouse `pulumi` | greenhouse `pulumicorporation` | 4 |
| QuickNode | greenhouse `quicknode` | ashby `quicknode` | 2 |
| Read.ai | ashby `readai` | ashby `read-ai` | 16 |
| Rho | greenhouse `rho` | ashby `rho` | 44 |
| Ro | greenhouse `ro` | lever `ro` | 54 |
| Root Insurance | greenhouse `rootinsurance` | rippling `joinroot` | 15 |
| SigmaOS | greenhouse `sigmaos` | yc `sigmaos` | 1 |
| Sisense | greenhouse `sisense` | ashby `sisense` | 5 |
| Speakeasy | ashby `speakeasyapi` | ashby `speakeasy` | 5 |
| Stoke Space | greenhouse `stokespace` | greenhouse `stokespacetechnologies` | 68 |
| Strava | greenhouse `strava` | ashby `strava` | 33 |
| Temporal | greenhouse `temporaltechnologies` | ashby `temporal` | 67 |
| Twelve | greenhouse `twelve` | ashby `twelve` | 5 |
| Uniswap Labs | greenhouse `uniswaplabs` | ashby `uniswap` | 5 |
| Unit | greenhouse `unit` | ashby `unit` | 3 |
| Vannevar Labs | ashby `vannevarlabs` | greenhouse `vannevarlabs` | 30 |
| Wayve | greenhouse `wayve` | ashby `wayve` | 156 |
| Wealthfront | greenhouse `wealthfrontcareers` | lever `wealthfront` | 22 |
| Webull | greenhouse `webull` | rippling `webull` | 22 |
| Whatnot | greenhouse `whatnot` | yc `whatnot` | 151 |
| Wispr Flow | ashby `wisprflow` | ashby `wispr-flow` | 30 |
| WorkOS | greenhouse `workos` | ashby `workos` | 30 |
| World Labs | greenhouse `worldlabs` | ashby `worldlabs` | 11 |
| Xaira Therapeutics | ashby `xaira` | greenhouse `xairatherapeutics` | 28 |

Notes:
- **Postmark** was pointed at ActiveCampaign's board on purpose (Postmark is an
  ActiveCampaign brand). The new board is ActiveCampaign's Lever board, so
  consider renaming the source to ActiveCampaign.
- **Hasura** renamed itself PromptQL. Consider renaming the source.
- **Applied Intuition** (Ashby `applied`) also covers EpiSci, which it bought.

## 2. Live but empty boards (7): re-point

Re-pointing these stops the errors, and new postings show up when the company
starts hiring again.

| Source | Now | Move to | Jobs today |
|---|---|---|---|
| Akiflow | greenhouse `akiflow` | yc `akiflow` | 0 |
| Continue | ashby `continue` | yc `continue` | 0 |
| Courier | ashby `courier` | yc `courier` | 0 |
| Increase | ashby `increase` | yc `increase` | 0 |
| Sublime Systems | greenhouse `sublimesystems` | lever `SublimeSystems` | 0 |
| Synctera | greenhouse `synctera` | ashby `synctera` | 0 |
| Vimcal | ashby `vimcal` | yc `vimcal` | 0 |

## 3. Board found, no US roles (4): owner's call

| Source | Now | Board found | Jobs today |
|---|---|---|---|
| Aleph Alpha | greenhouse `alephalpha` | ashby `alephalpha` | 3 (all in Germany) |
| Better Stack | ashby `betterstack` | gem `better-stack` | 1 (one remote role in Czechia; board name not confirmed) |
| Fireflies | greenhouse `firefliesai` | gem `fireflies` | 9 (all in Manila) |
| Tinybird | greenhouse `tinybird` | lever `tinybird` | 2 (all in Spain) |

## 4. Acquired (5): disable

| Source | Now | Covered by |
|---|---|---|
| Dynamic | ashby `dynamic` | Fireblocks (not in the catalog; its Greenhouse board `fireblocks` has 28 jobs) |
| EpiSci | greenhouse `episci` | Applied Intuition (already a source) |
| Highlight.io | ashby `highlight` | LaunchDarkly (already a source) |
| Replicate | ashby `replicate` | Cloudflare (already a source) |
| Stytch | greenhouse `stytch` | Twilio (already a source) |

The Dynamic row could be repurposed as a Fireblocks source instead.

## 5. Unsupported platforms (9): disable, or build an adapter

| Source | Now | Where its jobs are |
|---|---|---|
| Aiven | greenhouse `aiven` | Greenhouse EU region |
| Beehiiv | ashby `beehiiv` | BambooHR |
| Cherry | ashby `withcherry` | Ashby, with its public jobs API switched off |
| Circle | greenhouse `circle` | Phenom (careers.circle.com) |
| eToro | greenhouse `etoro` | Comeet |
| Riverside | greenhouse `riversidefm` | Comeet |
| Spacelift | greenhouse `spacelift` | Teamtailor |
| Susquehanna (SIG) | greenhouse `sig` | iCIMS |
| Wolverine Trading | greenhouse `wolverinetrading` | Pinpoint |

No single platform covers more than two of these, so none of them justifies a
new adapter on its own. Cherry's Ashby page still lists jobs while Ashby's
public API returns 404 for it. A page-scraping fallback in the Ashby adapter
would fix it, but it's the only source affected.

## 6. No public board found (36): disable

Checked: about 20 slug variants on Greenhouse, Ashby and Lever; name-based
slugs on Gem and Rippling; YC company pages; and the company's careers page.
For the better-known names, a web search too. Some of these may have shut
down, been acquired, or just stopped hiring. Quarantine already retries each
one daily, so leaving them enabled costs one request a day each. Disabling
them clears the "need attention" count.

| Source | Now | Note |
|---|---|---|
| Amie | ashby `amie` | — |
| Aurora Innovation | greenhouse `aurorainnovation` | — |
| Bolt | greenhouse `bolt` | bolt.com redirects to a domain-holding page |
| Chainlink Labs | greenhouse `chainlinklabs` | — |
| Climeworks | greenhouse `climeworks` | site blocks automated requests |
| Coherence | ashby `coherence` | — |
| Composer | ashby `composer` | — |
| Decart | ashby `decart` | — |
| DeepMind | greenhouse `deepmind` | careers page links no job board (roles may be on Google's own site) |
| Depop | greenhouse `depop` | site blocks automated requests |
| Etsy | greenhouse `etsy` | careers.etsy.com links no supported board |
| Gitpod | ashby `gitpod` | renamed Ona; no public Ashby board under `ona` |
| Kagi | greenhouse `kagi` | — |
| Kinde | ashby `kinde` | — |
| Koyeb | ashby `koyeb` | — |
| Lamini | ashby `lamini` | — |
| Liblab | ashby `liblab` | — |
| Marqeta | greenhouse `marqeta` | — |
| MultiOn | ashby `multion` | renamed The AGI Company; no job board linked |
| Northflank | ashby `northflank` | — |
| PEAK6 | greenhouse `peak6` | — |
| Petal | greenhouse `petal` | — |
| PostgresML | ashby `postgresml` | — |
| Preferred Networks | greenhouse `preferrednetworks` | — |
| Qodo (Codium) | ashby `qodo` | — |
| Redpanda | greenhouse `redpandadata` | — |
| Resy | greenhouse `resy` | — |
| Stan | ashby `stanstore` | — |
| Superhuman | greenhouse `superhuman` | now part of Grammarly; Grammarly's Greenhouse board is gone too |
| TAE Technologies | greenhouse `taetechnologies` | — |
| Tembo | ashby `tembo` | — |
| Tigris Data | ashby `tigrisdata` | — |
| Tock | greenhouse `tock` | site blocks automated requests |
| Turso | ashby `turso` | — |
| Wave | ashby `wavemusic` | — |
| Xata | ashby `xata` | — |

## 7. Empty boards are a code issue, not a data issue

85 sources return a valid board with no postings: 79 YC companies and 6
others. `pollCompany` (`worker/poller.ts`, the
`fetchedSnapshot.length === 0 && openExistingCount > 0` check) throws "Source
returned an empty snapshot while N jobs are still open" when a board is empty
but Pinkslip still has open jobs stored for that company. Nothing else closes
those jobs, so:

- the source stays in error, and quarantined, indefinitely, even though the
  board is healthy; and
- the stale jobs stay open in the feed.

Every company that removes its last listing ends up here, so this keeps adding
to "need attention" after a slug cleanup. Some of the 57 in production are
probably this case. Options (owner picks):

1. **Accept a persistent empty board.** Once a source has returned an empty
   board on N consecutive polls spanning at least 24 hours, treat it as real
   and close the open jobs through the normal missed-poll path. A small change
   in `pollCompany`, plus a test.
2. **Per-adapter trust.** Treat an empty but well-formed YC, Greenhouse or
   Ashby response as complete, and keep the guard for the custom adapters
   (Apple, Google, Workday and the rest), where an empty response is more
   likely to be a fault. Simpler, but it trusts a single response.
3. **Leave the code alone** and close those jobs by hand when they come up.

Option 1 keeps the protection the guard exists for: one bad response can't
wipe a board.

Empty YC boards today: AgentCollect, ANORIA, Arzana, AtlasGrid, AveryIQ, Blank Bio, Blaxel, Bolto, Canvas, Capitol AI, chrt, Clearline, CommodityAI, Constant, Convexia, Cranston AI, Crouton, CrowdVolt, Curo, Didit, Draftaid, Dream3D, Empirical Health, Feanix Biotechnologies, Gutgutgoose, Hazel, Hedgehog, hillclimb, Hindsight, InspectMind AI, Instant, Interface, Joon Health, Karsa, Labric, Leadbay, Liva AI, Loula, Maitai, Mantis, Mentra, Mercoa, Mindbase, Minerva, Multifactor, Mux, Olive, Onshore, Onyx, Origami, Parahelp, Parrot, Pave Robotics, Pelica, Persana AI, Perspectives Health, Pingo, Planbase, Prototyping.io, Quinn, Rise Reforming, River Markets, Sage Care, Slashy, SmartAsset, Sohar Health, Sprites, Sunflower, Superunit, Tara AI, The Hog, Third Chair, Tivara, Traceforce, Untether Labs, Velvet, Whip, Wolfia, ZeroEntropy.

Other empty boards: At-Bay (greenhouse `atbay`), Beacons (ashby `beacons`), Confluent (ashby `confluent`), Mercari (greenhouse `mercari`), Prisma (greenhouse `prisma`), Stainless (ashby `stainlessapi`). Confluent's Ashby board is empty and its
careers site rate-limited the check. IBM completed its acquisition of
Confluent on 2026-03-17, so its jobs have probably moved to IBM's site.

## What was applied

**Migration 0087** re-points 78 sources and retires 52:

- **Re-pointed (78):** the 69 moved boards, except Whatnot; the 7 live but
  empty boards; and Aleph Alpha, Fireflies and Tinybird from section 3. Their
  identity is confirmed and a healthy source can pick up US roles later.
  Postmark becomes **ActiveCampaign** and Hasura becomes **PromptQL**, with
  their websites. Re-pointed sources are enabled, leave quarantine, and take
  their new type's default poll tier (YC is tier 2).
- **Retired (52):** sections 4 to 6, plus:
  - Better Stack (its only lead is a dormant 2024 Gem board whose owner
    couldn't be confirmed);
  - Greenhouse Whatnot, a duplicate of the existing YC source `whatnot`,
    which has 151 jobs.

  Retired sources are disabled, not deleted, so saved and applied jobs keep
  their company. They leave "need attention", and their last error is kept as
  the reason.
- **Eight Sleep** was also a YC source, listing 13 of the 37 jobs on its
  Ashby board. The Ashby row becomes the one source, and the YC row is
  disabled.
- **Jobs on the dead boards are closed.** None of those boards can list
  them, and the poller could never close them because every poll failed. When
  a board only changed its slug, hosted job links are rewritten to the new
  slug, so a job the next poll finds under the same ID reopens with a working
  link.
- **Guards.** Rows match on name, source and the dead slug, so anything
  already fixed in the admin is left alone. If a new board already exists as
  another source, that row is retired instead of re-pointed, and the unique
  indexes are never violated.

Checked by rebuilding the catalog from all 88 migrations and polling every
enabled source with the adapters: 1,062 enabled, **0 failing**, 92 empty (the
next section). `tests/source-catalog-repair-migration.test.ts` covers the
guards.

**Alerts.** As with migration 0052, a re-pointed source's first polls import
its whole board. Jobs posted in the last 30 days that match someone's profile
will alert. Those are real openings Pinkslip missed while the source was
broken, but expect a one-off batch of alerts after the deploy.

**Empty boards (option 1).** `companies.empty_snapshot_since` records when a
board first answered empty while jobs were still open. The poller keeps
treating that as an error until the board has stayed empty for
`EMPTY_SNAPSHOT_SETTLE_MS` (24 hours). It then trusts the empty board, so the
open jobs close through the normal two-miss path and the source leaves
quarantine. Any non-empty snapshot clears the timestamp. Only adapters that
return a complete snapshot (Greenhouse, Ashby, Lever, YC and similar) use
this path. The reference-manifest adapters (Meta, Uber) keep their own guard.
Migration 0088 backfills the timestamp for sources already stuck on this
error, so they recover at their next daily retry. Tests are in
`tests/poller.test.ts`.
