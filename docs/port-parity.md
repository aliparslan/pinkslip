# React + Expo parity inventory

Source snapshot: `8b9a77c`, audited 2026-10-09. Companion to
[the port plan](REACT_EXPO_PORT_PLAN.md), chunk **0.3**.

This is the frozen Svelte/Capacitor inventory. Read references to deleted source
paths with `git show svelte-final:<path>`. Current implementation and validation
status is in the progress notes, the port plan and [integration closeout](port-closeout.md).
The earlier React/Expo attempt and stash were not used. The owner confirmed the
new TestFlight installation launches; that is separate from full native parity.

Checkboxes are acceptance requirements for the replacement, not a claim that
the current app already passes them. Each completed row needs web/native
evidence, or an explicit owner-approved cut with a date. Platform differences
and planned additions are called out rather than silently made equivalent.

## Scope and review choices

The saved decisions remain: TanStack Start web, native Expo iOS, Base UI with
CSS Modules on web, no Tailwind, shared data/domain logic, Hono as the API,
web first, and outright Svelte/Capacitor removal at chunk 3.4.

The owner reaffirmed the shell/placeholder cutover, accepted the shared-code,
state-ownership, and public/personal-data boundaries, and asked for the closest
practical reproduction of the current design through Base UI and a consistent
component kit. Native resume import and application-browser experiments move
into foundations. These decisions are D12–D16 in the plan; they do not approve
new visual implementations or settle the remaining feature cuts below.

| Item | Current scope / review status |
| --- | --- |
| Cutover | Outright replacement at 3.4 reaffirmed. Feature screens follow in Phase 4. |
| Design and kit | Preserve the current look through semantic tokens and a mapped Base UI kit, built before feature screens. Capture references in 0.4 and compare kit/screens in 2.4/Phase 4. |
| Native feasibility | Validate session/data, resume import/files, and application-browser filling in 1.6a–c. Resolve import strategy D10 in 1.6b, ahead of the full native port. |
| Discover, read, save, apply, Library, You/settings, companies, resume, answers | Preserve the behaviors below. No proposed cuts. |
| Onboarding | Explicit redesign in 4.7; preserve preference validation, migration, and completion semantics. |
| Tailoring | Owner accepted the placeholder and explicitly tabled tailoring indefinitely on 2026-10-10. Full behavior stays inventoried for later. |
| Native admin | Web link-out accepted and implemented in 6.11. |
| Offline web | Owner accepted cutting cold offline web/font support in the 2026-10-10 5.1 review. Native read-cache persistence remains separate. |
| Web Apple sign-in | Redirect flow implemented locally in closeout; actual Services ID/credentials and owner browser verification remain required. |
| Public SSR, job metadata, sitemap, typed feed filters in URL | Planned additions; not existing Svelte behavior. |
| Native role filters / applied toggle / Undo variants | Existing platform differences below; decide whether to unify when porting each slice. |

## Route coverage

All 19 entries in the frozen `packages/client/src/route-config.ts`
(`git show svelte-final:packages/client/src/route-config.ts`), plus
the public About page, have requirements below. Each route also inherits the
cross-cutting requirements. “Client” describes the planned page rendering;
public SSR must not include personal saved/applied state.

| ID | Route | Current owner | Web chunk | Native chunk | Planned rendering |
| --- | --- | --- | --- | --- | --- |
| R01 | `/` | `Feed.svelte`, `JobRow.svelte` | 4.1–4.2 | 6.4 | Public content SSR; personalized feed on client |
| R02 | `/jobs/:jobId` | `JobDetail.svelte` | 4.3, 4.13 | 6.5, 6.10 | Public job SSR; personal actions on client |
| R03 | `/tailor/:jobId` | `Tailor.svelte` | 4.15 / D7 | 6.12 / D7 | Client |
| R04 | `/library/saved` | `JobLibrary.svelte` | 4.4 | 6.6 | Client |
| R05 | `/library/applied` | `JobLibrary.svelte` | 4.4 | 6.6 | Client |
| R06 | `/you` | `Profile.svelte` | 4.5 | 6.7 | Client |
| R07 | `/you/preferences` | `Profile.svelte`, `JobsSection.svelte`, `SearchProfileFields.svelte` | 4.6 | 6.7 | Client |
| R08 | `/you/alerts` | `Profile.svelte`, `NotifySection.svelte` | 4.8 | 6.7 | Client |
| R09 | `/you/companies` | `Companies.svelte`, `CompanyRow.svelte` | 4.9 | 6.7 | Client |
| R10 | `/you/resume` | `ResumeProfile.svelte` | 4.10–4.11 | 6.9 / D10 | Client |
| R11 | `/you/tailoring` | `Profile.svelte`, `TailorSection.svelte` | 4.15 / D7 | 6.12 / D7 | Client |
| R12 | `/you/answers` | `Profile.svelte`, `AnswersSection.svelte` | 4.12 | 6.9 | Client |
| R13 | `/you/account` | `Profile.svelte`, `AccountSection.svelte` | 3.2, 4.5 | 6.3, 6.7 | Client |
| R14 | `/you/feedback` | `Profile.svelte` | 4.5 | 6.7 | Client |
| R15 | `/admin` | `Admin.svelte`, `AdminSection.svelte` | 4.14 | 6.11 / D9 | Client; admin guard |
| R16 | `/admin/inbox` | `InboxSection.svelte` | 4.14 | 6.11 / D9 | Client; admin guard |
| R17 | `/admin/sources` | `Companies.svelte`, admin mode | 4.14 | 6.11 / D9 | Client; admin guard |
| R18 | `/admin/runs` | `RunsSection.svelte` | 4.14 | 6.11 / D9 | Client; admin guard |
| R19 | `/admin/jev` | `JevSection.svelte` | 4.14 | 6.11 / D9 | Client; admin guard |
| R20 | `/about` | `apps/web/src/routes/about/+page.svelte` | 4.16 | Web link | Public, prerendered |

## Cross-cutting requirements

### Session, access, and data ownership

- [ ] **G01** Distinguish anonymous, guest, authenticated, and admin. `bootstrap.get` supplies session, feature flags, and preferences. A passive anonymous read must not create a D1 user/session. First permitted mutation can establish a guest; signing in preserves/merges that guest's state according to the existing auth contract.
- [x] **G02** Preserve the shared-code gate (`access_required`): required/incorrect code errors, busy state, focused retry, successful unlock followed by bootstrap. Show loading and recoverable startup failure separately.
- [ ] **G03** Preserve versioned onboarding replay, initialize from saved preferences, and avoid dropping signed-in state when a refresh fails. Native can display its cached bootstrap while refreshing. Cached web reading currently admits only feed/detail after bootstrap failure.
- [x] **G04** Partition/clear personal data caches when the user changes. Logout/deletion clears cached jobs and the locally imported resume file. New Query caches and SSR clients must not reuse personal state across users or requests.
- [ ] **G05** Native bearer storage, client/build headers, token rotation, and one retry on `invalid_token`; a stale request must not clear a newer sign-in token. Native magic links work both on cold launch and when already open, once per token.
- [x] **G06** Preserve session feature gates: `auto_apply_enabled`, `auto_submit_enabled`, `outreach_enabled`, and tailoring availability/provider/model. Hidden buttons are not substitutes for API authorization.

### Navigation, presentation, and persistence

- [ ] **G07** Jobs/Library/You roots retain useful list position and state. Web supports narrow navigation and desktop master–detail panes; deep links, reload, browser history, and back-to-origin work. `from=library-saved` / `from=library-applied` survives reload and defaults safely to Jobs for invalid values.
- [ ] **G08** Preserve native stacks, back gestures, sheet dismissal, keyboard avoidance, safe areas, and scroll restoration as outcomes. Reimplement using native navigation rather than porting CSS/WebView emulation. The shell owns these decisions.
- [x] **G09** Every data screen has initial loading, first-use/empty, full failure with retry, usable-data refresh failure, and mutation busy/error feedback where applicable. Guest/signed-in/admin and feature-off states are distinct. Static About has no data-loading/empty state.
- [ ] **G10** Dark/light/system appearance, increased contrast, reduced motion, narrow/wide layouts, zoom/Dynamic Type, visible focus, labeled controls, one route landmark, and keyboard/screen-reader access. Modal focus trap/return, Escape, accessible names, and an explicit Close control remain required.
- [x] **G11** Autosaves serialize in-flight changes, retain edits typed during a save, expose saving/saved/failure and Retry, and flush before app navigation. Failed flush prevents silent loss on back navigation. Page-hide flushing is best effort; native needs an AppState/navigation adapter.
- [x] **G12** Preserve original timing versus discovery timing, evergreen/closed/content-pending indicators, salary formatting/fallback, and logo fallback. Native logo cache and web `/logo?domain=…` are platform implementations of the same outcome.
- [ ] **G13** External links open once without replacing the web app. Share uses the OS/browser share sheet or clipboard fallback and treats cancellation normally. Native file export presents the share sheet; web export downloads a PDF.
- [ ] **G14** Preserve cached-feed/detail saved-copy indication and disabled writes/pagination while read-only, or record the explicit offline scope cut above. Query persistence alone does not make the web app shell available offline.
- [ ] **G15** Match the current visual design through the component catalog, semantic tokens, and mapped Base UI patterns. Preserve reference images before Svelte removal; compare kit compositions and finished screens using matching fixture content/viewports. React/native components remain in Quarantine until owner approval; current screenshots do not automatically approve new implementations.
- [x] **G16** Query owns server data without a parallel global copy. Validated web URLs own committed shareable filters; local/form state owns filter drafts and edits. Feature coordination owns autosave/application-return behavior. Cross-screen stores need an explicit use and reset policy.
- [ ] **G17** Share pure rules, API/capability contracts, and applicable data hooks. File/PDF execution, notifications, credential storage, navigation, and browser bridges remain app-owned adapters. Verify the boundary with 1.6's native experiments before broad feature implementation.
- [x] **G18** Public SSR reads a Hono public projection with no personal fields, user credentials, or session creation. Client queries fetch personal state separately; server clients/caches are request-scoped. Tests distinguish public reads, guest/authenticated state, and private authorization.

**Common API calls:** `bootstrap.get` → `GET /bootstrap`; `access.unlock` →
`POST /access`; `native.startSession` → `POST /native/session`;
`auth.verifyEmailToken` → `POST /auth/email/verify`.
API paths in this document are relative to **`/api/v2`**, except where explicitly
identified as Worker-owned paths. All Profile-owned routes (R06–R08, R11–R14)
currently load `bootstrap.get`, `push.settings`, and `profile.get`. This is
inventory of current calls, not a requirement to duplicate those requests in
the Query implementation.

## Route requirements and API calls

### R01 — Jobs `/`

- [x] Search, locations/Remote, salary bounds, saved-only on web, career-stage subset, and evergreen filter. Native also has temporary role filters; native evergreen controls are admin-only. Empty states distinguish no jobs, no matches, and no saved jobs.
- [x] Filters are draft-only until Apply; Cancel leaves results unchanged. Failed Apply restores previous criteria and pagination, including a cached fallback that cannot confirm the requested criteria. “All saved career stages” omits the stages parameter; an explicit empty subset is not broadened silently.
- [x] Preferences seed locations/work modes/stages; manual location choices survive ordinary bootstrap refresh. Preference changes invalidate the feed and reset temporary role/stage narrowing. New URL filters must preserve these semantics.
- [ ] Incremental pagination, search debouncing, refresh, native pull-to-refresh, new-job indicators, viewed state, and stale-poller context. Stale requests cannot overwrite newer criteria. Failed stats must not fail an otherwise healthy feed; failed refresh/load-more retains visible rows and offers recovery.
- [ ] Row open/save/unsave/hide, native Undo, mark viewed/unviewed, and admin block confirmation; synchronize successful mutations across feed, detail, and Library. Back from detail preserves the list; notification return intentionally refreshes it.

**Reads:** `jobs.list` (`GET /jobs`, `limit`, `offset`, `q`, `locations`,
`roles`, `saved`, `min_salary`, `max_salary`, `stages`, `posted`);
`stats.get` (`GET /stats`); `interactions.viewedJobs` (`GET /interactions/viewed-jobs`).
**Writes:** common row actions below; `jobs.block` (`DELETE /jobs/:id/block`, admin);
`interactions.event` (`POST /interactions/events`, `job_displayed`).

**Row actions shared with R04/R05:** `savedJobs.save` / `savedJobs.unsave`
(`PATCH /jobs/:id`, `saved`); `jobs.dismiss` / `jobs.undismiss`
(`PATCH /jobs/:id`, `dismissed`); `interactions.markViewed` /
`interactions.markUnviewed` (`POST` / `DELETE /interactions/viewed-jobs/:id`).
Logos use `GET /logo?domain=…` directly or through the native cache.

### R02 — Job detail `/jobs/:jobId`

- [x] Company, role facts, location/pay, timing, sanitized description and plain-text fallback, external listing, share, and back-to-origin. Missing/closed jobs and absent descriptions have usable recovery states.
- [x] A pending description refreshes a bounded number of times (currently five), announces arrival or unavailability, and stops on navigation. Background refresh never resets a save/apply action performed since that request began.
- [ ] Optimistic save/unsave with rollback and synchronized lists. Mark applied removes the job from discovery; native can unmark applied and restore it. Web currently prevents repeating Mark applied, rather than offering that toggle.
- [ ] Hide listing, hide company, native Undo, report listing with reason/notes, and admin-only global removal confirmation. Mutation failures leave a recoverable screen.
- [x] Plain Apply opens the employer site and records a pending application intent. Returning asks whether the user applied; opening a site alone must not mark the job applied. Intent survives a same-tab reload, expires, and is dismissed after answering.
- [x] Feature-gated prep/auto-apply and outreach requirements below. `?outreach=<thread>` opens the requested reminder thread once the job and feature state are ready.
- [x] Planned SSR renders public fields without user state; client hydration fills in personal actions without duplicate fetching or changing another user's cache. Public API access is a prerequisite, described under implementation findings.

**Reads:** `jobs.get` (`GET /jobs/:id`, including description refresh), logo.
**Writes:** `savedJobs.save`, `savedJobs.unsave`, `jobs.dismiss`, `jobs.undismiss`,
`jobs.markApplied` / `jobs.unmarkApplied` (`PATCH /jobs/:id`, applied + dismissed),
`jobs.block`, `companies.block` / `companies.restore`
(`POST` / `DELETE /interactions/companies/:id/block`),
`interactions.markViewed`, `interactions.report` (`POST /interactions/reports`),
`interactions.event` (`job_opened`, `apply_clicked`). The global return prompt
also calls `jobs.markApplied` and must update Library.

### R03 — Tailor `/tailor/:jobId` (full port conditional on D7)

- [x] Resolve D7: either an intentional coming-soon state with no generation calls, or all remaining R03 requirements. Preserve route/back behavior in either case.
- [ ] Load job/existing tailoring; distinguish no plan, pending, generated, source-profile changed, stale plan requiring regeneration, and initial/partial failure. Select/exclude evidence before generation; show requirements, matches, and gaps.
- [ ] Edit/reorder/exclude/lock bullets, compare with original evidence at word level, regenerate an unlocked bullet with instructions, and restore content removed for space. Validate the evidence before export.
- [ ] Serialized autosave/retry and unsaved-navigation guard; responsive editor/preview tabs retain editor state. Compile the exact PDF preview with Worker/WASM failure recovery.
- [ ] PDF artifact history: list, download/share, select, delete confirmation. Export validates content/page count, saves PDF plus provenance metadata, and reports preview/compile quality outcomes. Failed history loading must not erase the draft.

**API:** `jobs.get`; `tailor.get` (`GET /tailor/:jobId`);
`tailor.plan` (`POST /tailor/:jobId/plan`); `tailor.generate`
(`POST /tailorings/:id/generate`); `tailor.regenerateBullet`
(`POST /tailorings/:id/regenerate`); `tailor.saveStructured`
(`PATCH /tailorings/:id`); `tailor.recordQuality` (`POST /tailorings/:id/quality`);
`tailor.createArtifact` / `tailor.artifacts.list` (`POST` multipart / `GET
/tailorings/:id/artifacts`); `tailor.artifacts.download` /
`tailor.artifacts.delete` (`GET` PDF / `DELETE /tailorings/:id/artifacts/:artifactId`);
`tailor.artifacts.select` (`POST /tailorings/:id/artifacts/:artifactId/select`).

### R04 / R05 — Library saved and applied

- [x] Both `/library/saved` and `/library/applied` are reloadable routes. Tabs support keyboard selection, counts, browser history, and focus retention. Each has its own empty state and navigation to a job preserving its origin.
- [x] Preserve both hydrated collections on return and update them from successful save/apply changes elsewhere. Applied entries show application timing. Clear data when the session owner changes.
- [x] Initial loading, usable-data refresh errors, and list action failure recovery. Native currently loads the lists independently so one failure does not hide the other; preserve this resilience in the new shared data layer.

**Reads on either route:** `savedJobs.list` (`GET /jobs/saved/list`),
`appliedJobs.list` (`GET /jobs/applied/list`). **Row writes:** R01 common row
actions; successful detail/return-prompt apply mutations also update these lists.

### R06 — You `/you`

- [x] Account/guest summary, preferences summary, notification capability/status, resume readiness, tailoring readiness, and links to settings. Answers/outreach-related entry points respect feature availability; admin navigation respects role.
- [ ] Appearance switch persists dark/light/system preference. Preserve privacy/support entry points, native in-app opening, and browser navigation. Load errors must not falsely turn a known signed-in session into a guest.

**API:** Profile common reads. Shared settings autosave uses `me.update`
(`PATCH /me`), `preferences.update` (`PUT /preferences`), and
`push.updateSettings` (`PUT /push/settings`) only for changed values.

### R07 — Job preferences `/you/preferences`

- [x] Roles and no-preference choice; career stages with at least one selected; work-mode multiselect; work authorization; metros/Remote/anywhere/relocation. Preserve normalization of the forward-deployed role grouping on web.
- [x] Relevant years of experience, required-years ceiling, unstated-experience inclusion, completed education, and doctoral enrollment are independent fields. Reset-to-defaults works and persists.
- [x] Web advanced include/exclude job-title lists and additional location text are inventoried; do not silently omit them from the new form. Autosave/retry and back-navigation flush follow G11 and refresh feed criteria on success.

**API:** Profile common reads; `preferences.update`; `interactions.event`
(`search_profile_adjusted`). No standalone form-specific endpoint.

### R08 — Job alerts `/you/alerts`

- [ ] Account-level alert enable/disable is distinct from device permission and registration. Show unsupported, install-required, denied, disabled/promptable, enabled, and registration-failed states accurately.
- [ ] Enable/register, retry registration, native Settings opening, and browser install guidance. Recheck permission on return/focus. Test notification immediately or after five seconds; show pending, no-device-received, success, and failure outcomes.
- [ ] Notification click opens the correct clean route and records opened job IDs. A foreground push must not navigate away; a notification targeting an inactive feed invalidates it for the next return.

**API:** Profile common reads; `push.settings` (`GET /push/settings`);
`push.updateSettings`; `push.subscribe` (`POST /push/subscribe`, browser subscription JSON);
`push.registerApns` (`POST /push/apns`, token + installation ID);
`push.test` (`POST /push/test?delay=…`); `push.opened` (`POST /push/opened`, native).
The web service worker calls the same opened endpoint directly.

### R09 — Companies `/you/companies`

- [x] Search by name/source identifier, source-type filter, All/Hidden views, incremental display, no-match state, logo/fallback, and company links. Native All currently includes hidden companies; web All excludes them.
- [x] Hide/restore a company for this user with pending state/error recovery; report a company. Keep this separate from admin disabling/deleting a source globally. The current implementation is visibility/blocking, not a separate follow-subscription API.
- [x] Request a missing company from search: name, careers URL, notes, validation, submission busy/error, and duplicate feedback handling.

**API:** `companies.list` (`GET /companies`); `companies.block`, `companies.restore`;
`interactions.report`; `interactions.submitFeedback` (`POST /interactions/feedback`,
company request); logo. Admin-only CRUD belongs to R17.

### R10 — Resume `/you/resume`

- [ ] Load/edit contact, experience, education (multiple credentials/majors/minors), projects, skill groups, and optional sections. Add/remove entries/bullets with Undo where currently provided; preserve month dates, current-role state, location fields, and native cancellation of untouched new entries.
- [x] Overview/section/record navigation retains position. Autosave tracks newer edits during requests; dirty exit flush and failure/retry do not discard work. Empty resume and loading/failure states remain useful.
- [x] Validate PDF signature/type and 5 MB limit before import. Adaptive local extraction → server parse / OCR follows quality assessment, not merely a failed HTTP request. Scanned/protected/invalid/empty PDFs, offline, rate limit, sign-in-required, and unavailable conversion each have relevant recovery.
- [x] Preview the proposed *data import*: counts, warnings, and uncertain fields before confirmation. Cancel changes nothing; confirm replaces populated collections and updates nonempty contact fields while retaining absent sections. Current resume screen does not embed `ResumePdfPreview`; that component is used by Tailor. A new PDF preview here is additional scope.
- [x] Keep the imported PDF locally for application attachment. Clear-resume confirmation removes profile content/local attachment but preserves previously created tailored artifacts; account logout/deletion also clears the local file.
- [ ] Native import/files/preview use the strategy proven in 1.6b (D10); the full editor in 6.9 consumes those contracts. Record text/scanned fixture results and device limitations early.

**API:** `profile.get` / `profile.update` (`GET` / `PUT /profile`, optional
keepalive); `resumeImport.parse` (`POST /resume-import/parse`, multipart file);
`resumeImport.ocr` (`POST /resume-import/ocr`, multipart page images). Local
extraction and local file persistence do not themselves call the API.

### R11 — Tailoring settings `/you/tailoring`

- [x] Feature/account readiness, link to structured resume, and coming-soon/unavailable state. If keeping the live feature, show provider/model-aware daily included usage and reset information. Resolve its relationship to the D7 placeholder explicitly.

**API:** Profile common reads; `tailor.usage` (`GET /tailor/usage?model=…`) when
the current usage-meter conditions apply.

### R12 — Application answers `/you/answers`

- [x] Feature-off state; loading/retry; common questions and remembered-answer empty state. Sponsorship edits the shared work-authorization preference rather than a conflicting second truth.
- [x] Office mode/hybrid days, relocation, start date, graduation month (resume default), salary, pronouns/custom response. Preserve nullable/unanswered and declined answers without inventing values.
- [x] Remembered boolean/text/long-text/list answers can be edited or deleted with Undo. Optimistic failures restore the prior value/position; save presentation surfaces failures. Keyboard edit/commit/cancel works.

**API:** Profile common reads; `apply.answers` (`GET /apply/answers`);
`apply.setAnswer` / `apply.deleteAnswer` (`PUT` / `DELETE /apply/answers/:encodedKey`);
`profile.get` for graduation; `preferences.update` for sponsorship.

### R13 — Account `/you/account`

- [ ] Guest vs signed-in identity/provider, display-name autosave, native Apple login/cancel/error, email validation/send/resend/sent-to state. Web email success/expired query feedback is consumed once without losing unrelated query state.
- [ ] Logout/start-over confirmation, account deletion confirmation, pending/error handling, post-delete guest state, and Apple disconnect follow-up when `apple_revoke_required` is returned. Clear local personal caches/files.
- [ ] Native cold/warm email links and token races follow G05. Browser Apple sign-in is new planned work: design and test its browser credential/callback flow rather than assuming the native adapter works on web.

**API:** Profile common reads; `me.update`; `auth.signInWithApple`
(`POST /auth/apple/exchange`); `auth.startEmailLogin` (`POST /auth/email/start`);
`auth.verifyEmailToken` (native); `auth.logout` (`POST /auth/logout`);
`auth.deleteAccount` (`DELETE /auth/account`). Browser magic-link completion
uses Worker-owned **`GET /auth/email/verify`**, outside `/api/v2`.

### R14 — Feedback `/you/feedback`

- [x] Feature-request/general-feedback type, subject validation, optional details, pending/error, and duplicate-vs-new success. Successful submission returns to You; failed submission retains the draft.

**API:** Profile common reads; `interactions.submitFeedback`.

### R15 — Admin overview `/admin`

- [x] Denied state and Back to You for non-admins on every admin route. Authorized users can switch among Manage, Inbox, Sources, Runs, and Jev without losing the admin shell.
- [x] Product metrics, activity/conversion and operational/quality summaries, loading, missing values, and failed-load recovery. Preserve the existing metric meanings, not just the labels.

**API:** `metrics.get` (`GET /metrics`).

### R16 — Admin inbox `/admin/inbox`

- [x] Feedback, listing reports, and jobs needing review load with independent states where supported. Feedback can be planned/resolved/declined; reports resolved/dismissed; jobs approved/rejected with an optional note.
- [x] Expand/load more review results without duplicates, retain total/has-more, disable duplicate actions, and recover from failure. Native Undo restores prior status/order and focus after removal; port keyboard focus recovery to the new web UI.

**API:** `interactions.reports` (`GET /interactions/reports?status=open`);
`interactions.feedback` (`GET /interactions/feedback?status=active`);
`interactions.jobReviews` (`GET /interactions/job-reviews?state=needs_review&limit=…&offset=…`);
`interactions.updateReport` (`PATCH /interactions/reports/:id`);
`interactions.updateFeedback` (`PATCH /interactions/feedback/:id`);
`interactions.updateJobReview` (`PATCH /interactions/job-reviews/:jobId`). Undo uses the same mutations.

### R17 — Admin sources `/admin/sources`

- [x] Search/source-type/status filters (active, needs attention, disabled, any), counts, incremental list, failed/quarantined source status, and empty/error/loading states.
- [x] Add/edit name, source type/identifier, website on creation, source verification, global enable/disable, and delete confirmation. Editable/pollable source types follow the domain catalog. Editing can trigger a poll and reports its result separately from persistence.
- [x] Preserve verification pending/error/success and clear stale verification when inputs change. Ordinary company controls must not expose these admin operations.

**API:** `companies.list`; `companies.toggle` / `companies.update`
(`PATCH /companies/:id`); `companies.create` (`POST /companies`);
`companies.verify` (`POST /companies/verify`); `companies.poll`
(`POST /companies/:id/poll`); `companies.delete` (`DELETE /companies/:id`); logo.

### R18 — Admin runs `/admin/runs`

- [x] Fetch-run history, duration/counts/status, readable per-company errors with expansion, and empty/loading/failure. Alert-speed rows show cadence, p50/p95, overdue sources, and unavailable data without making history fail.
- [x] Refresh-all operation has a busy state, result counts/log, success/error, and refreshed history. Preserve the longer timeout for this operation.

**API:** `runs.list` (`GET /runs?limit=50`); `runs.latency`
(`GET /runs/latency`, optional result); `ops.refreshAll` (`POST /poll`).

### R19 — Admin Jev `/admin/jev`

- [x] Comparison availability, summary counts, open/reviewed filters, empty/loading/error, per-field disagreement, truncation indication, and original job link.
- [x] Record rules/Jev/neither/unclear verdict; reopen a review; show per-item busy/error and update counts without losing the list.

**API:** `classification.disagreements` (`GET /metrics/classification/disagreements`);
`classification.review` / `classification.clearReview`
(`PUT` / `DELETE /metrics/classification/reviews/:encodedCacheKey`).

### R20 — About `/about`

- [x] Public readable content with JavaScript disabled, title/description/canonical/OG/Twitter metadata, and Open Pinkslip link. Preserve its distinction from gated personal routes. No API calls or session bootstrap required.

## Flows without their own route

### Onboarding (3.2 / 4.7 / 6.8)

- [x] Begin → validated search preferences → optional notifications → finish, with back navigation, focus movement, existing-choice migration, failure retry, and version/completion timestamp persistence. Current flow has three steps and no resume import; the planned skippable resume step is a redesign addition.
- [x] Notification refusal/failure does not trap setup. Preserve `onboarding_started` / `onboarding_completed` events and feed invalidation after successful preference saves.

**API:** `preferences.update`; `push.updateSettings`; platform registration
calls from R08; `interactions.event`.

### Application prep and native auto-apply (4.13 / 6.10)

- [x] Load supported ATS questions, with initially unanswered required questions first and a stable group order after editing. Show about/questions/voluntary groups, declined defaults, missing count, text/choice/multiselect controls, and save failure feedback. Unsupported forms open normally; failed preparation can recover.
- [ ] Prepare and edit answers before opening the real form; load the local resume attachment. Browser mode opens externally; native supports script-assisted filling. Do not claim browser cross-origin autofill works without the native bridge.
- [ ] Native browser reads each loaded form, obtains a plan, fills individual fields/files, rereads required answers, learns user corrections, and reports outcomes. Refilling, page changes, timeouts, manual fallback, close cleanup, and submission detection remain functional.
- [ ] Auto-submit is separately feature-gated; missing required answers, CAPTCHA, and validation failures leave control with the user. Only confirmed submission marks Applied. The employer page receives fill data, never the Pinkslip session token.
- [ ] Prove the native bridge and file attachment on controlled form fixtures in 1.6c, then complete supported ATS integration and device checks in 6.10. Keep prototype results distinct from production feature parity.

**API:** `apply.prepare` (`GET /apply/jobs/:jobId`); `apply.saveAnswers`
(`PUT /apply/jobs/:jobId/answers`); `apply.plan` (`POST /apply/plan`);
`apply.learn` (`POST /apply/learn`); `apply.report` (`POST /apply/report`);
`jobs.markApplied` on confirmed submission. These calls belong to R02's feature
flow, not to pure kit components.

### Recruiter outreach (4.13 / 6.10)

- [x] Open existing/requested thread or generate one; handle no recruiter, loading, error/retry, and feature-off. Show first email and two follow-ups, recipient, due times, sent/replied/stopped state.
- [x] Edit and save subject/body before opening the user's mail app; copy with recovery. Mark Sent explicitly with timezone, mark replied, stop follow-ups, or discard. Opening mail alone must not record a sent email. Reminders reopen the correct thread via R02.

**API:** `outreach.list` (`GET /outreach/threads?job_id=…`); `outreach.get`
(`GET /outreach/threads/:id`); `outreach.start` (`POST /outreach/threads`);
`outreach.edit` (`PATCH /outreach/messages/:id`); `outreach.markSent`
(`POST /outreach/messages/:id/sent`); `outreach.markReplied` / `outreach.stop`
(`POST /outreach/threads/:id/replied` / `/stop`); `outreach.discard`
(`DELETE /outreach/threads/:id`). Mail handoff/clipboard are platform operations.

## Redirects and Worker-owned routes

| Incoming path | Required destination / behavior |
| --- | --- |
| `/library` | `/library/saved` |
| `/my-jobs/saved` | `/library/saved` |
| `/my-jobs/applied` | `/library/applied` |
| `/profile`, `/settings` | `/you` |
| `/companies` | `/you/companies` |
| `/resume` | `/you/resume` |
| `/you/operations` | `/admin` |
| `/#/<route>` | Clean canonical route; preserve query parameters both before and inside the hash, including auth feedback and job origin |
| Trailing slash | Normalize without losing query state |
| Unknown route | Recovery page; planned real HTTP 404 (existing e2e checks the screen, not the HTTP status) |
| `pinkslip.alip.dev` HTML GET/HEAD | Current Worker uses 308 to `pinkslip.work`, preserves path/query and sets `ps_moved=1`; web shell shows the migration notice. Legacy API calls are not redirected. |
| `/auth/email/verify` | Forward to Hono preserving cookies, redirects and query; this is outside `/api/*` |
| `/.well-known/apple-app-site-association`, `/apple-app-site-association` | Forward/serve actual association JSON without a redirect; preserve host-specific behavior and email universal-link paths |
| `/privacy`, `/support`, `/legal.css` | Existing public Worker-owned documents/stylesheet remain reachable after hostname cutover |
| `/sw.js` | Existing registration URL; chunk 3.4's retirement worker must be served here, then coordinated with the future push worker |
| `/manifest.json`, icons, `/robots.txt`, `/sitemap.xml` | Decide and verify web ownership during cutover; public indexing remains disabled until launch criteria are met |

- [x] **N01** Exercise every redirect with reload and query parameters, plus legacy hash links with outer auth query state.
- [x] **N02** Exercise email callback, legal/support, both association URLs, API cookies/bearer/Set-Cookie, and legacy-host behavior through the actual new Worker routing.
- [ ] **N03** Old installed PWAs and open tabs stop serving the retired shell. Cache retirement does not accidentally remove a newly registered push worker or unrelated origin data. Record the explicit offline/install scope decision.

## Existing evidence and missing tests

These are test sources to port or extend, **not test results from this audit**.
The existing smoke/axe suite covers four routes, not all nineteen. Backend unit
tests do not substitute for interaction tests in React or on a device.

| Evidence in the current repo | What it establishes / next gap |
| --- | --- |
| `apps/web/e2e/core-routes.pw.ts` | Jobs, detail, saved Library, You: landmark/heading, axe, skip link. Add applied, all settings/admin routes, guest and feature-off coverage. |
| `apps/web/e2e/migration-flows.pw.ts` | Several redirects, retained collection/origin, keyboard Library tabs/work-mode menu/dialogs, tailoring tabs, public About, unknown-page recovery. Add all redirect cases and HTTP statuses. |
| `apps/web/e2e/career-stages.pw.ts`, `qualification-preferences.pw.ts` | Onboarding migration/defaults/validation, filter draft/apply/failure rollback, qualification autosave/reload. Retain these behaviors under the new form/data layer. |
| `apps/web/e2e/notification-feed.pw.ts`, `external-links.pw.ts` | Notification invalidation and external opening once. Extend to actual Worker click handling, cold starts, and native devices. |
| `apps/web/e2e/responsive-boundaries.pw.ts`, `design-system-contracts.pw.ts`, `visual-contracts.pw.ts` | Responsive/forced-color/zoom/font/visual evidence. Replace Svelte selectors and approved visual baselines while preserving behavior; screenshots are not proof of mutation flows. |
| `apps/web/e2e/pwa-runtime.pw.ts`, `pwa-screenshots.pw.ts` | Offline fonts/release reload and manifest imagery. Replace according to the explicit PWA scope decision and retirement-worker test. |
| `packages/client/tests/navigation.test.ts`, `tests/frontend-route-config.test.ts` | History/hash/origin route rules. Retain behavior without the Svelte router dependency. |
| `packages/client/tests/job-library-store.test.ts`, `tests/job-read-cache.test.ts`, `tests/bootstrap-cache.test.ts` | Mutation coherence and owner/cached-read boundaries. Reuse cases for Query, cancellation, logout, and SSR request isolation. |
| `packages/client/tests/autosave-lifecycle.test.ts`, `task-presentation.test.ts` | Save/flush/pending lifecycle. Add real form navigation and newer-edit-during-save cases. |
| `packages/client/tests/pdf-import-policy.test.ts`, `pdf-ocr.test.ts`, `resume-import-orchestrator.test.ts`, `resume-document.test.ts`; `tests/resume-import*.test.ts`, `tests/resume-profile-v2.test.ts` | Parsing/quality/compile/domain contracts. Add browser file-picker/confirm/cancel/clear flows and native import strategy validation. |
| `packages/client/tests/application-autofill.test.ts`; `tests/apply.test.ts`, `apply-plan.test.ts`, `apply-answers.test.ts`, `outreach.test.ts`, `auth.test.ts`, `apple-oauth.test.ts` | Feature/API behavior. Add UI/device evidence for answer rollback, prep, browser bridge, return prompt, mail handoff, logout/delete, and token races. |

For material implementation chunks run `bun run check`, `bun test`,
`bun run build`, and `bun run test:e2e`. Native changes also use
`bun --filter @pinkslip/native export:ios` and the native WebKit suite.
Native gestures, push, Apple login, file handoff and autofill require device
verification too.

## Foundation audit findings, 2026-10-09

These findings describe the frozen Svelte/foundation snapshot. References to
"currently" below mean that snapshot; they are not a list of remaining faults
in the present React/Expo implementation. The Progress section records later
resolution and the checks still outstanding.

1. **Public SSR needs an API contract.** `worker/auth.ts` currently allows
   anonymous GETs only for bootstrap/me/preferences/logo; a job GET returns
   `session_required` without a session, and the optional shared-code gate is
   checked first. Reading the public job through a service binding does not
   bypass this. Add an explicitly public, read-only projection through Hono
   before public job SSR; do not mint a guest per crawler request or send an
   admin/user token to render public HTML. Keep private fields and mutations
   behind existing guards. Track in 1.1/1.4 and verify in 4.3/4.16.
2. **Shared transport must be instance-scoped.** `core/api.ts` currently has
   module-global configuration and mutation listeners. SSR needs a client and
   Query cache per request; native needs injected fetch/storage. `PushSubscription`,
   File/multipart uploads, and browser blob behavior also need platform-neutral
   boundaries. Query retries must not multiply the existing transport retries.
3. **Not all listed lift candidates are framework-free.** `viewed.ts` uses a
   Svelte store; `job-navigation.ts` imports the current route config;
   `job-content.ts` creates DOM elements; autosave lifecycle uses document/window;
   `auto-apply.ts` imports an IndexedDB resume store. Split pure transformations
   from adapters before moving code. Form-reader/filler DOM code runs inside
   an injected page script; that is different from importing DOM-dependent
   execution into Hermes. Worker/WASM/PDF adapters remain platform-owned.
4. **Cutover has more than `/api/*`.** Preserve N02 routes before moving both
   hostnames. Public SSR responses need their own appropriate HTML headers;
   the API Worker's restrictive default CSP is not the web page policy.
5. **Current plan and current behavior differ in named places.** Browser Apple
   sign-in, resume PDF preview on the import route, typed URL feed filters,
   public SSR, and the onboarding resume step are additions. Company behavior
   is per-user hiding plus admin source management. Do not build extra APIs
   from shorthand labels such as “follow” or “notification feed.”
6. **Preserve unfinished work from this migration.** Claude left an uncommitted
   `apps/webapp/package.json` and lockfile change in worktree `port-1.1-webapp`,
   and an uncommitted `packages/tokens/src/oklch.ts` in `port-1.2-tokens`.
   These were starter files at the audit snapshot. The manifest has since been
   reviewed and used for the implemented 1.1 foundation; the color helper still
   needs review in 1.2. Both worktrees remain untouched. The removed earlier
   attempt remains out of scope.

## Progress

Inventory validation on 2026-10-09: source-to-document coverage check found all 19 app
routes, eight compatibility redirects, and 88 invoked API methods; local
Markdown links and `git diff --check` passed. The existing application's
`bun run check`, 853 unit tests, web build, and iOS web-bundle build passed.
Playwright and hands-on device checks were not run for this documentation
change.

Foundation implementation on 2026-10-09: chunk 1.1 now has public list/detail SSR,
client-only account reads, forwarding through the API binding, noindex and
404 coverage. The new Hono public projection is read-only and separate from
private routes. Checks passed: `bun run check`, 861 unit tests, seven Chromium
browser tests (including axe), both existing frontend builds, the React build,
and a deployment dry run. Forty-eight fresh design captures and 26 historical
images are preserved in [the reference set](port-design/README.md). These
foundation compositions remain Quarantine; product parity, native verification
and production cutover are still pending.

- [x] Inventory the 19 app routes and public About page against the current source.
- [x] Map screen calls, shared feature/platform calls, redirects, and existing test evidence.
- [x] Identify differences between current behavior and planned additions/cuts.
- [x] Record the owner's architecture, design-fidelity, native-experiment, and outright-cutover decisions (2026-10-09; plan D12–D16 and reaffirmed D2).
- [ ] Owner reviews scope and records any cuts (completion gate for chunk 0.3).
- [ ] Implement and verify the web/native parity rows in their assigned chunks.

5.1 web review on 2026-10-10 ([parity-review-5.1.md](parity-review-5.1.md)):
web-only rows are ticked. Rows that still carry native requirements stay open
for Phase 6, even where the web half is done. Proposed cuts and decisions
(offline web, web Apple sign-in, the filter-failure model, search launch) are
decided by the owner the same day: offline web cut, web Apple sign-in
deferred to Phase 6, the URL filter model kept, search indexing on.

Integration closeout on 2026-10-10 ([port-closeout.md](port-closeout.md)):

| Area | Current status |
| --- | --- |
| Public SSR and shared transport | The Hono public projection, instance-scoped clients and request-scoped Query caches are implemented. Native transport contracts are framework-neutral. Original audit findings 1–2 are resolved in source. |
| Cutover and DOM adapters | Svelte/Capacitor were removed in 3.4. DOM form scripts stay in the application WebView; native file/Keychain/push adapters own their platforms. Missing-text PDF import now has a temporary local PDF.js WebView and the existing OCR API. |
| Native autofill/session/import | Local regression and WebKit fixture checks pass. Admin autofill activation requires API deployment. Real ATS, retained attachment, scanned OCR service, signed-account persistence and gestures still need the owner's phone checks. |
| Website Apple sign-in | The chosen redirect flow is implemented and tested locally. Services ID/key setup, deployment and real browser consent/account continuity are outstanding. |
| Push and links | Owner confirms delayed notification delivery and app opening. Actual job destinations and cold/warm links remain open; the live AASA job path still needs deployment. |
| Accepted cuts | Tailoring stays a placeholder until explicit owner resumption, native Admin links to web, offline web is cut. Website Apple setup is now an activation prerequisite. |

The local closeout passed root checks, 870 unit tests, web build, native export
and seven native WebKit tests. Full web-suite results and exact owner flows
are recorded in the closeout report. Historical web-only ticks stay valid;
native rows stay open where fixture evidence does not establish full signed
device parity. This document is no longer a claim that the port has not started,
and it is not a claim that every phone integration is verified.
