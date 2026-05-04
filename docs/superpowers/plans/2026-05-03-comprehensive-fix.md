# Comprehensive Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all identified bugs, design issues, and feature gaps across the Pink Slip codebase — backend, frontend, and infrastructure.

**Architecture:** The work is split into 7 independent tasks that can be parallelized. Backend tasks touch `worker/`, frontend tasks touch `frontend/src/`. No task modifies files another task also modifies. Each task produces a working commit.

**Tech Stack:** Cloudflare Workers + D1 (Hono), Svelte 5, Tailwind CSS v4 with custom OKLCH theme, Vitest

---

## File Map

### Backend (Tasks 1-2)
- Modify: `worker/index.ts` — fix manual poll prefs, cap push delay reference
- Modify: `worker/poller.ts` — batch DB writes, clean up 410 subs
- Modify: `worker/scoring.ts` — fix `scoreYoeFit` to use prefs, fix `isUSOrRemote`
- Modify: `worker/routes/push.ts` — cap delay to 10s
- Modify: `worker/routes/jobs.ts` — remove global `saved` column updates
- Modify: `worker/routes/preferences.ts` — validate keys against allowlist
- Modify: `worker/adapters/greenhouse.ts` — extract salary formatter
- Modify: `worker/adapters/lever.ts` — extract salary formatter
- Create: `worker/adapters/salary.ts` — shared salary formatting
- Modify: `tests/push.test.ts` — fix assertions to check `result.ok`
- Modify: `tests/scoring.test.ts` — add tests for YOE prefs
- Modify: `package.json` — fix db:migrate scripts
- Create: `migrations/0012_unique_push_endpoint.sql`
- Delete: `migrations/0009_rescore_stale_jobs.sql` (duplicate of logic already in 0006)

### Frontend — Bug Fixes (Task 3)
- Modify: `frontend/src/App.svelte` — `$effect` → `onMount`, remove Events import
- Modify: `frontend/src/pages/Feed.svelte` — `$effect` → `onMount`
- Modify: `frontend/src/pages/Tracker.svelte` — `$effect` → `onMount`, use shared utils
- Modify: `frontend/src/pages/Companies.svelte` — `$effect` → `onMount`
- Modify: `frontend/src/pages/JobDetail.svelte` — `$effect` → `onMount`, remove unused imports, remove "Tailor resume" button
- Modify: `frontend/src/pages/Profile.svelte` — `$effect` → `onMount`
- Modify: `frontend/src/pages/Settings.svelte` — `$effect` → `onMount`
- Modify: `frontend/src/components/ScoreBadge.svelte` — use OKLCH theme colors
- Modify: `frontend/src/components/JobCard.svelte` — make keyboard accessible, use shared `timeAgo`
- Modify: `frontend/src/lib/utils.ts` — replace `cn()` with shared `timeAgo` and `companyMark`
- Modify: `frontend/src/lib/api.ts` — add proper types
- Modify: `frontend/src/lib/theme.ts` — fix theme-color values

### Frontend — Design (Task 4)
- Modify: `frontend/src/app.css` — max-width container, card feedback, deduplicate light theme, filter scroll indicator
- Modify: `frontend/index.html` — Google Fonts as link tags, fix theme-color
- Modify: `frontend/public/manifest.json` — add `id`, `scope`, fix colors

### Frontend — Feature Restructuring (Task 5)
- Modify: `frontend/src/App.svelte` — route Settings, remove Events from route table
- Modify: `frontend/src/components/TabBar.svelte` — 3 tabs (Feed/Tracker/Profile), add a11y attrs
- Modify: `frontend/src/pages/Profile.svelte` — simplify: cut skills/stats/resume/notifications, add Settings link
- Modify: `frontend/src/components/Onboarding.svelte` — simplify to single name-entry step
- Modify: `frontend/src/components/FilterChips.svelte` — add `aria-pressed`

### Frontend — Accessibility (Task 6)
- Modify: `frontend/src/pages/JobDetail.svelte` — focus trap + Escape on modal
- Modify: `frontend/src/pages/Companies.svelte` — focus trap + Escape on modals
- Modify: `frontend/src/components/CompanyRow.svelte` — checkbox aria-label

### Service Worker (Task 7)
- Modify: `frontend/public/sw.js` — add install/fetch handlers for app-shell caching

### Cleanup
- Remove: `frontend/src/pages/Events.svelte`
- Modify: `frontend/package.json` — remove `bits-ui`, `clsx`, `tailwind-merge`, `@types/bun`

---

### Task 1: Backend — Scoring, Poller & Migration Fixes

**Files:**
- Modify: `worker/scoring.ts:92-113` (scoreYoeFit) and `:124-138` (isUSOrRemote)
- Modify: `worker/poller.ts:130-198` (pollCompany) and `:286-304` (push cleanup)
- Modify: `worker/index.ts:43-66` (manual poll endpoint)
- Modify: `worker/routes/preferences.ts:27-36`
- Modify: `worker/routes/push.ts:48-59`
- Modify: `worker/routes/jobs.ts:103-160`
- Modify: `worker/adapters/greenhouse.ts:33-39,62-69`
- Modify: `worker/adapters/lever.ts:33-36,59-62`
- Create: `worker/adapters/salary.ts`
- Modify: `tests/push.test.ts:111-124`
- Modify: `package.json:11-12`
- Create: `migrations/0012_unique_push_endpoint.sql`

- [ ] **Step 1: Fix `scoreYoeFit` to accept and use prefs**

In `worker/scoring.ts`, change the `scoreYoeFit` function signature and logic to use `prefs.min_yoe` and `prefs.max_yoe`:

```ts
function scoreYoeFit(title: string, prefs: ScoringPrefs): number {
  const lower = title.toLowerCase();

  if (containsKeyword(lower, "junior") || containsKeyword(lower, "new grad")) return 25;
  if (/\bsenior\b/.test(lower) || /\bsr\.?\b/.test(lower)) return 5;

  const match = lower.match(YOE_PATTERN);
  if (match) {
    const years = parseInt(match[1], 10);
    if (years <= prefs.max_yoe) return 25;
    if (years <= prefs.max_yoe + 2) return 10;
    return 0;
  }

  return 15;
}
```

Update the call in `scoreJob` at line 237:
```ts
const yoeScore = scoreYoeFit(job.title, prefs);
```

- [ ] **Step 2: Fix `isUSOrRemote` overly broad match**

In `worker/scoring.ts`, fix the bidirectional `includes` check at line 137. Replace:
```ts
if (loc.includes(prefLower) || prefLower.includes(loc)) return true;
```
With a minimum-length guard:
```ts
if (loc.includes(prefLower)) return true;
if (prefLower.includes(loc) && loc.length >= 3) return true;
```

Apply the same fix at line 162 in `scoreLocationMatch`.

- [ ] **Step 3: Batch DB writes in poller**

In `worker/poller.ts`, replace the sequential close/reopen loops (lines 131-148) with batched statements:

```ts
if (fetched.length > 0) {
  const closeStmts = [...existingIds]
    .filter(extId => !fetchedExtIds.has(extId))
    .map(extId =>
      db.prepare("UPDATE jobs SET closed_at = ? WHERE company_id = ? AND external_id = ? AND closed_at IS NULL")
        .bind(now, company.id, extId)
    );
  const reopenStmts = [...existingIds]
    .filter(extId => fetchedExtIds.has(extId))
    .map(extId =>
      db.prepare("UPDATE jobs SET closed_at = NULL WHERE company_id = ? AND external_id = ? AND closed_at IS NOT NULL")
        .bind(company.id, extId)
    );
  const allStmts = [...closeStmts, ...reopenStmts];
  if (allStmts.length > 0) await db.batch(allStmts);
}
```

Replace the sequential insert loop (lines 160-188) with batched inserts:

```ts
const newMeta: NewJobMeta[] = [];
const insertStmts = newJobs.map(job => {
  const breakdown = scoreJob(job, prefs);
  const id = crypto.randomUUID();
  newMeta.push({ company: company.name, title: job.title, jobId: id, score: breakdown.score });
  return db.prepare(
    `INSERT INTO jobs (id, company_id, external_id, title, url, location, department, posted_at, first_seen_at, score, title_score, yoe_score, location_score, department_score, recency_score, dismissed, description, salary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(id, company.id, job.externalId, job.title, job.url, job.location, job.department ?? null, job.postedAt ?? null, now, breakdown.score, breakdown.title_score, breakdown.yoe_score, breakdown.location_score, breakdown.department_score, breakdown.recency_score, job.description ?? null, job.salary ?? null);
});
if (insertStmts.length > 0) await db.batch(insertStmts);
```

- [ ] **Step 4: Clean up 410 Gone push subscriptions**

In `worker/poller.ts`, after the push send loop (around line 300), add cleanup:

```ts
for (let i = 0; i < sendResults.length; i++) {
  const r = sendResults[i];
  if (r.status === "fulfilled") {
    if (r.value.ok) {
      notificationsSent++;
    } else if (r.value.status === 410 || r.value.status === 404) {
      await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
        .bind(subscriptions[i].endpoint).run();
    }
  }
}
```

- [ ] **Step 5: Fix manual poll to load prefs from DB**

In `worker/index.ts`, replace the hardcoded prefs object (line 52) with a DB read. Import `loadPreferences` or inline:

```ts
app.post("/api/poll", async (c) => {
  const limit = Number(c.req.query("limit") ?? "0");
  const db = c.env.DB;

  const q = limit > 0
    ? db.prepare("SELECT * FROM companies WHERE enabled = 1 AND ats_type != 'custom' LIMIT ?").bind(limit)
    : db.prepare("SELECT * FROM companies WHERE enabled = 1 AND ats_type != 'custom'");

  const companies = (await q.all<import("./types").CompanyRow>()).results ?? [];

  // Load actual preferences from DB
  const prefRows = (await db.prepare("SELECT key, value FROM preferences").all<import("./types").PreferenceRow>()).results ?? [];
  const prefMap: Record<string, unknown> = {};
  for (const row of prefRows) {
    try { prefMap[row.key] = JSON.parse(row.value); } catch { prefMap[row.key] = row.value; }
  }
  const prefs = {
    locations: (prefMap["locations"] as string[]) ?? [],
    min_yoe: (prefMap["min_yoe"] as number) ?? 0,
    max_yoe: (prefMap["max_yoe"] as number) ?? 3,
    role_keywords: (prefMap["role_keywords"] as string[]) ?? [],
    negative_keywords: (prefMap["negative_keywords"] as string[]) ?? [],
  };

  let totalNew = 0;
  const log: string[] = [];
  for (const company of companies) {
    try {
      const newJobs = await pollCompany(company, db, prefs);
      totalNew += newJobs.length;
      log.push(`${company.name}: ${newJobs.length} new`);
    } catch (e: any) {
      log.push(`${company.name}: ERROR ${e.message}`);
    }
  }

  return c.json({ companiesPolled: companies.length, newJobsFound: totalNew, log });
});
```

- [ ] **Step 6: Cap push test delay to 10 seconds**

In `worker/routes/push.ts`, replace lines 48-59:
```ts
const delay = Math.min(Number(c.req.query("delay") ?? "0"), 10);
```

- [ ] **Step 7: Validate preference keys**

In `worker/routes/preferences.ts`, add an allowlist at the top and validate in the PUT handler:

```ts
const ALLOWED_KEYS = new Set([
  "locations", "min_yoe", "max_yoe", "role_keywords",
  "negative_keywords", "notify_threshold", "notification_threshold",
]);

// In PUT handler, filter entries:
const entries = Object.entries(body).filter(([key]) => ALLOWED_KEYS.has(key));
if (entries.length === 0) return c.json({ error: "No valid preference keys" }, 400);
const stmts = entries.map(([key, value]) =>
  c.env.DB.prepare("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)")
    .bind(key, JSON.stringify(value))
);
```

- [ ] **Step 8: Remove global `saved` column from jobs PATCH**

In `worker/routes/jobs.ts`, remove the `saved` clause from the PATCH handler. Remove lines 115-117 (the `saved` setClauses/bindings block). Keep only the `saved_jobs` table sync (lines 133-144).

- [ ] **Step 9: Extract shared salary formatter**

Create `worker/adapters/salary.ts`:
```ts
export function formatGreenhouseSalary(ranges: { min_cents: number; max_cents: number; currency_type: string; title: string }[]): string | null {
  if (!ranges?.length) return null;
  const r = ranges[0];
  const min = Math.round(r.min_cents / 100).toLocaleString();
  const max = Math.round(r.max_cents / 100).toLocaleString();
  let salary = `$${min} – $${max}`;
  if (r.title) salary += ` (${r.title})`;
  return salary;
}

export function formatLeverSalary(range: { min: number; max: number; currency: string; interval: string } | undefined): string | null {
  if (!range) return null;
  const { min, max, currency, interval } = range;
  return `${currency === "USD" ? "$" : currency}${min.toLocaleString()} – ${currency === "USD" ? "$" : ""}${max.toLocaleString()}/${interval}`;
}
```

Update `greenhouse.ts` and `lever.ts` to import and use these functions instead of inline formatting.

- [ ] **Step 10: Fix push test assertions**

In `tests/push.test.ts`, fix lines 111 and 124:
```ts
// Line 111: change
expect(result).toBe(true);
// to
expect(result.ok).toBe(true);

// Line 124: change
expect(result).toBe(false);
// to
expect(result.ok).toBe(false);
```

- [ ] **Step 11: Fix db:migrate scripts**

In `package.json`, replace the migrate scripts:
```json
"db:migrate": "for f in migrations/*.sql; do wrangler d1 execute pinkslip --local --file=$f; done",
"db:migrate:remote": "for f in migrations/*.sql; do wrangler d1 execute pinkslip --remote --file=$f; done"
```

- [ ] **Step 12: Add UNIQUE constraint migration and fix duplicate migration**

Create `migrations/0012_unique_push_endpoint.sql`:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint);
```

Delete `migrations/0009_rescore_stale_jobs.sql` — it's a duplicate of the purge logic already in `0006_score_breakdown.sql`. Rename 0009's actual content (the re-cap scores update) — actually 0009 has different content than 0006. Keep both files but fix 0006's name. Actually, looking at the files: 0006 has a purge statement, 0009 has score re-capping. They are NOT duplicates. Keep both.

- [ ] **Step 13: Add `console.error` to empty catch blocks**

In `worker/routes/jobs.ts` line 95, replace `catch {}` with `catch (e) { console.error("Description backfill failed:", e); }`.

- [ ] **Step 14: Run tests**

Run: `cd /Users/alip/dev/pinkslip && bun test`
Expected: All tests pass.

- [ ] **Step 15: Commit**

```bash
git add worker/ tests/ package.json migrations/
git commit -m "fix: backend scoring, poller batching, prefs validation, and test assertions"
```

---

### Task 2: Frontend — Bug Fixes & Types

**Files:**
- Modify: `frontend/src/App.svelte`
- Modify: `frontend/src/pages/Feed.svelte`
- Modify: `frontend/src/pages/Tracker.svelte`
- Modify: `frontend/src/pages/Companies.svelte`
- Modify: `frontend/src/pages/JobDetail.svelte`
- Modify: `frontend/src/pages/Profile.svelte`
- Modify: `frontend/src/pages/Settings.svelte`
- Modify: `frontend/src/components/ScoreBadge.svelte`
- Modify: `frontend/src/components/JobCard.svelte`
- Modify: `frontend/src/lib/utils.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/theme.ts`

- [ ] **Step 1: Replace `cn()` with shared utilities in `utils.ts`**

Rewrite `frontend/src/lib/utils.ts`:
```ts
export function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function companyMark(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
```

- [ ] **Step 2: Type the API client**

In `frontend/src/lib/api.ts`, import types from the worker and replace `any` with proper types. Add interfaces at the top:

```ts
export interface Job {
  id: string;
  company_id: string;
  external_id: string;
  title: string;
  url: string;
  location: string;
  department: string | null;
  posted_at: string | null;
  first_seen_at: string;
  score: number;
  title_score: number;
  yoe_score: number;
  location_score: number;
  department_score: number;
  recency_score: number;
  dismissed: number;
  description: string | null;
  salary: string | null;
  closed_at: string | null;
  company_name: string;
  company_domain: string;
  ats_type?: string;
  ats_slug?: string;
  saved?: boolean;
}

export interface Company {
  id: string;
  name: string;
  ats_type: string;
  ats_slug: string;
  website: string;
  enabled: boolean;
  last_poll_status: string | null;
  last_poll_error: string | null;
  last_polled_at: string | null;
}

export interface Application {
  id: string;
  user_id: string | null;
  job_id: string | null;
  company_name: string;
  title: string;
  stage: "Applied" | "Screen" | "Interview" | "Offer" | "Rejected" | "Ghosted";
  next: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  name: string;
  created_at: string;
}
```

Then replace all `any` return types with proper types (e.g., `request<{ jobs: Job[] }>`, `request<Company>`, `request<Application>`, etc.).

- [ ] **Step 3: Replace `$effect` with `onMount` on all pages**

On each page file, add `import { onMount } from "svelte";` and replace the `$effect(() => { ... })` that does initial data loading with `onMount(() => { ... })`.

Files to change:
- `App.svelte`: the `$effect` that calls `api.me.get()` (line 36)
- `Feed.svelte`: the `$effect` that calls `api.jobs.list()` (line 54)
- `Tracker.svelte`: the `$effect` that calls `api.applications.list()` (line 57)
- `Companies.svelte`: the `$effect` that calls `api.companies.list()` (line 37)
- `JobDetail.svelte`: the `$effect` that calls `api.jobs.get()` (line 30) — this one reads `jobId` which is reactive, so use `$effect` with a guard: only re-fetch when `jobId` changes. This is the ONE place `$effect` is correct.
- `Profile.svelte`: the `$effect` that calls `api.preferences.get()` (line 30)
- `Settings.svelte`: the `$effect` that calls `api.preferences.get()` (line 20)

For `JobDetail.svelte`, keep `$effect` but ensure it doesn't write to tracked state synchronously. The current `.then()` pattern is safe, so keep it as-is but add a comment.

- [ ] **Step 4: Fix ScoreBadge to use OKLCH theme colors**

Rewrite `frontend/src/components/ScoreBadge.svelte`:
```svelte
<script lang="ts">
  let { score }: { score: number } = $props();

  let color = $derived(
    score >= 70 ? "good" :
    score >= 40 ? "warn" :
    "muted"
  );
</script>

<span
  class="inline-flex items-center px-2 py-0.5 font-mono text-xs font-semibold rounded-md"
  style="background: color-mix(in oklch, var(--color-{color === 'muted' ? 'ink-3' : color}) 15%, transparent); color: var(--color-{color === 'muted' ? 'ink-3' : color}); border: 1px solid color-mix(in oklch, var(--color-{color === 'muted' ? 'ink-3' : color}) 30%, transparent);"
>
  {score}
</span>
```

- [ ] **Step 5: Make JobCard keyboard accessible and use shared utils**

In `frontend/src/components/JobCard.svelte`:
- Remove the local `timeAgo` function, import from `../lib/utils`
- Remove the `svelte-ignore` comments
- Change the outer `<div>` to an `<a>` or add `role="button" tabindex="0"` and `onkeydown` handler:

```svelte
<div
  class="card-base"
  role="button"
  tabindex="0"
  style="width: 100%; text-align: left; {dismissing ? 'opacity: 0.4; transition: opacity 0.2s;' : ''}"
  onclick={() => navigate(`/jobs/${job.id}`)}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/jobs/${job.id}`); } }}
>
```

- [ ] **Step 6: Fix theme-color values**

In `frontend/src/lib/theme.ts`, align the meta theme-color values with the actual CSS custom properties. The dark background is `oklch(0.15 0.01 340)` ≈ `#271a21`. The light background is `oklch(0.98 0.005 340)` ≈ `#fbf9fa`:

```ts
if (meta) meta.setAttribute("content", isDark ? "#271a21" : "#fbf9fa");
```

In `frontend/index.html`, change line 6:
```html
<meta name="theme-color" content="#271a21" />
```

In `frontend/public/manifest.json`, update:
```json
"background_color": "#271a21",
"theme_color": "#271a21",
```

- [ ] **Step 7: Remove unused imports**

- `JobDetail.svelte`: remove `FileText` import (line 12)
- `Events.svelte`: remove `CalendarDots` import (line 2)
- `Tracker.svelte`: replace local `timeAgo` and `companyMark` with imports from `../lib/utils`
- `CompanyRow.svelte`: replace local `companyMark` with import from `../lib/utils`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/
git commit -m "fix: replace \$effect with onMount, type API client, fix ScoreBadge colors"
```

---

### Task 3: Frontend — Design Fixes

**Files:**
- Modify: `frontend/src/app.css`
- Modify: `frontend/index.html`
- Modify: `frontend/public/manifest.json`
- Modify: `frontend/src/pages/Feed.svelte`
- Modify: `frontend/src/components/FilterChips.svelte`

- [ ] **Step 1: Add max-width container and improve card feedback**

In `frontend/src/app.css`, add after the `.page` rule (around line 398):

```css
.app-container {
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}
```

Update `.card-base:active` (line 144):
```css
.card-base:active { transform: scale(0.97); }
```

- [ ] **Step 2: Deduplicate light theme CSS**

Replace the duplicated light theme block (lines 55-72 `[data-mode="light"]` section) with a mixin approach. Replace both the `@media` block and the `[data-mode]` block with:

```css
@media (prefers-color-scheme: light) {
  :root:not([data-mode="dark"]) {
    @apply --light-colors;
  }
}
[data-mode="light"] {
  @apply --light-colors;
}
```

Actually, Tailwind CSS v4 doesn't support `@apply` with custom properties in this way. Instead, use a CSS custom mixin. The simplest approach: just keep one block with the selector `:root:is([data-mode="light"]), :root:not([data-mode="dark"])` scoped under the media query. Since Tailwind v4 handles this differently, keep both blocks but extract into a shared selector:

```css
@media (prefers-color-scheme: light) { :root:not([data-mode="dark"]) { /* light vars */ } }
[data-mode="light"] { /* same light vars */ }
```

This is the current pattern. The duplication is unavoidable in CSS without a preprocessor. Leave as-is — the 36 lines of duplication is acceptable for pure CSS.

- [ ] **Step 3: Add scroll fade indicator for filter chips**

In `frontend/src/components/FilterChips.svelte`, add a wrapper with CSS mask:

```svelte
<div style="position: relative;">
  <div class="flex gap-2 overflow-x-auto no-scrollbar" style="-webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent); mask-image: linear-gradient(to right, black calc(100% - 24px), transparent);">
    {#each filters as filter}
      <button
        class="chip {selected === filter ? 'chip-active' : ''}"
        onclick={() => onSelect(filter)}
      >
        {filter}
      </button>
    {/each}
  </div>
</div>
```

- [ ] **Step 4: Add Feed page title and improve sort toggle**

In `frontend/src/pages/Feed.svelte`, add a page title before the stat row:

```svelte
<div class="page">
  <div style="padding: 0 22px 10px;">
    <p class="h-eyebrow" style="margin-bottom: 6px;">Feed</p>
    <h1 class="h-display" style="font-size: 30px; margin-bottom: 14px;">
      New roles
    </h1>
    <div class="stat-row">
```

Make the sort toggle more prominent — increase font size to 12px, add more padding:
```svelte
<button
  style="padding: 6px 14px; font-size: 12px; font-weight: 600; ..."
```

- [ ] **Step 5: Give score more visual weight on cards**

In `frontend/src/components/JobCard.svelte`, wrap the score in a styled pill:
```svelte
<span
  style="font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: {scoreColor}; letter-spacing: -0.02em; background: color-mix(in oklch, {scoreColor} 12%, transparent); padding: 2px 8px; border-radius: 8px;"
>
  {job.score ?? 0}
</span>
```

- [ ] **Step 6: Move Google Fonts to link tags**

In `frontend/index.html`, add before the closing `</head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" />
```

In `frontend/src/app.css`, remove the `@import url(...)` line (line 1).

- [ ] **Step 7: Add `manifest.json` fields**

```json
{
  "id": "/",
  "scope": "/",
  "name": "pinkslip",
  ...
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "fix: add container max-width, feed title, score pills, font loading"
```

---

### Task 4: Frontend — Feature Restructuring

**Files:**
- Modify: `frontend/src/App.svelte`
- Modify: `frontend/src/components/TabBar.svelte`
- Modify: `frontend/src/pages/Profile.svelte`
- Modify: `frontend/src/components/Onboarding.svelte`
- Delete: `frontend/src/pages/Events.svelte`

- [ ] **Step 1: Update App.svelte routing**

Remove the Events import. Add Settings import. Update the route table:

```ts
import Settings from "./pages/Settings.svelte";
// Remove: import Events from "./pages/Events.svelte";

const routes: Record<string, any> = {
  "/": Feed,
  "/tracker": Tracker,
  "/profile": Profile,
  "/profile/companies": Companies,
  "/settings": Settings,
};
```

Wrap the main content in a container div:
```svelte
<div class="app-container min-h-screen pb-28">
```

- [ ] **Step 2: Update TabBar to 3 tabs with accessibility**

```svelte
<script lang="ts">
  import { currentRoute, navigate } from "../router";
  import House from "phosphor-svelte/lib/House";
  import Notepad from "phosphor-svelte/lib/Notepad";
  import UserCircle from "phosphor-svelte/lib/UserCircle";

  let route = $derived($currentRoute);

  const tabs = [
    { label: "Feed", path: "/", icon: House },
    { label: "Tracker", path: "/tracker", icon: Notepad },
    { label: "Profile", path: "/profile", icon: UserCircle },
  ] as const;

  function isActive(path: string): boolean {
    if (path === "/") return route === "/" || route === "";
    return route.startsWith(path);
  }
</script>

<nav class="fixed bottom-0 left-0 right-0 z-40" aria-label="Main navigation" style="background: color-mix(in oklch, var(--color-bg) 94%, transparent); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-top: 1px solid var(--color-line); box-shadow: 0 -1px 3px rgba(0,0,0,0.06);">
  <div class="app-container grid grid-cols-3" style="padding: 8px 12px calc(env(safe-area-inset-bottom, 0px) + 12px);">
    {#each tabs as tab}
      {@const active = isActive(tab.path)}
      <button
        class="flex flex-col items-center gap-1 py-1.5 transition-colors"
        style="color: {active ? 'var(--color-ink)' : 'var(--color-ink-3)'}; font-family: var(--font-sans); font-size: 10.5px; font-weight: 500;"
        onclick={() => navigate(tab.path)}
        aria-current={active ? "page" : undefined}
      >
        <tab.icon size={22} weight={active ? "fill" : "regular"} />
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>
</nav>
```

- [ ] **Step 3: Simplify Profile page**

Strip out: skills section, resume completion bar, stats grid, and notification controls. Keep: hero card (avatar + name), account settings list. Add a link to Settings.

The simplified Profile.svelte should have:
- Hero card with avatar and name
- Account section with rows: "Job preferences" → `/settings`, "Companies" → `/profile/companies`, "Notifications" → `/settings`
- All rows navigate to real pages (no wrench icons)

- [ ] **Step 4: Simplify Onboarding to name entry only**

Replace the 4-step onboarding with a single-step name entry:

```svelte
<div style="position: fixed; inset: 0; z-index: 60; background: var(--color-bg); display: flex; align-items: center; justify-content: center;">
  <div style="width: 100%; max-width: 360px; padding: 32px;">
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
      <svg width="32" height="38" viewBox="0 0 22 26" fill="none" style="transform: rotate(-8deg); flex-shrink: 0;">
        <rect x="1" y="1" width="20" height="24" rx="3" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="0.5"/>
        <rect x="5" y="6" width="12" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
        <rect x="5" y="10" width="9" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
        <rect x="5" y="14" width="11" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
      </svg>
      <span class="h-display" style="font-size: 30px; line-height: 1;">
        <span style="color: var(--color-accent);">pink</span>slip
      </span>
    </div>
    <h2 class="h-display" style="font-size: 26px; margin-bottom: 8px;">Beat the crowd</h2>
    <p style="font-size: 14.5px; color: var(--color-ink-2); line-height: 1.55; margin-bottom: 32px;">
      Get alerted the moment roles drop &mdash; before everyone else applies.
    </p>
    <label for="onboarding-name" style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; display: block;">
      Your name
    </label>
    <input
      id="onboarding-name"
      class="input-field"
      type="text"
      placeholder="e.g. Alex"
      bind:value={name}
      onkeydown={(e) => e.key === "Enter" && handleNameSubmit()}
    />
    <button
      class="btn-primary btn-accent"
      style="width: 100%; margin-top: 16px;"
      disabled={!name.trim() || saving}
      onclick={handleNameSubmit}
    >
      {saving ? "..." : "Get started"}
    </button>
  </div>
</div>
```

- [ ] **Step 5: Delete Events.svelte**

```bash
rm frontend/src/pages/Events.svelte
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/ -A
git commit -m "feat: simplify nav to 3 tabs, streamline profile and onboarding"
```

---

### Task 5: Frontend — Accessibility

**Files:**
- Modify: `frontend/src/pages/JobDetail.svelte`
- Modify: `frontend/src/pages/Companies.svelte`
- Modify: `frontend/src/components/FilterChips.svelte`
- Modify: `frontend/src/components/CompanyRow.svelte`
- Modify: `frontend/src/App.svelte`

- [ ] **Step 1: Add focus trap and Escape key to modals**

Create a reusable pattern. In `JobDetail.svelte`, for the block confirm modal:
- Add `role="dialog"` and `aria-modal="true"` to the modal content div
- Add `aria-labelledby` pointing to the heading
- Add an `onkeydown` handler on the backdrop for Escape:

```svelte
<div
  style="position: fixed; inset: 0; z-index: 70; ..."
  onclick={() => { showBlockConfirm = false; }}
  onkeydown={(e) => { if (e.key === 'Escape') showBlockConfirm = false; }}
  role="presentation"
>
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="block-title"
    style="..."
    onclick={(e) => e.stopPropagation()}
  >
    <div id="block-title" style="font-size: 17px; font-weight: 600;">Block this job?</div>
```

Apply the same pattern to the edit and delete modals in `Companies.svelte`.

- [ ] **Step 2: Add `aria-pressed` to FilterChips**

```svelte
<button
  class="chip {selected === filter ? 'chip-active' : ''}"
  onclick={() => onSelect(filter)}
  aria-pressed={selected === filter}
>
```

- [ ] **Step 3: Add `aria-label` to CompanyRow checkbox**

```svelte
<input
  type="checkbox"
  checked={company.enabled}
  onchange={(e) => onToggle(company.id, (e.target as HTMLInputElement).checked)}
  aria-label="Enable {company.name}"
/>
```

- [ ] **Step 4: Add `aria-hidden` to decorative SVG in App.svelte**

```svelte
<svg width="22" height="26" viewBox="0 0 22 26" fill="none" aria-hidden="true" style="...">
```

- [ ] **Step 5: Remove "Tailor resume" disabled button from JobDetail**

Delete the disabled "Tailor resume" button (lines 348-355 in JobDetail.svelte).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "fix: add modal focus trapping, aria attributes, remove dead UI"
```

---

### Task 6: Service Worker & PWA

**Files:**
- Modify: `frontend/public/sw.js`

- [ ] **Step 1: Add app-shell caching to service worker**

Rewrite `frontend/public/sw.js` to add install/activate/fetch handlers while keeping the existing push handlers:

```js
const CACHE_NAME = "pinkslip-v1";
const APP_SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API requests: network-only
  if (url.pathname.startsWith("/api/")) return;

  // App shell: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

// --- Push notification handlers (existing) ---
self.addEventListener("push", (event) => {
  // ... keep existing push handler unchanged ...
});

self.addEventListener("notificationclick", (event) => {
  // ... keep existing notificationclick handler unchanged ...
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/public/sw.js
git commit -m "feat: add app-shell caching to service worker for offline support"
```

---

### Task 7: Cleanup & Package Updates

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Remove unused dependencies**

```bash
cd frontend && bun remove bits-ui clsx tailwind-merge @types/bun
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd frontend && bun run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/bun.lock
git commit -m "chore: remove unused frontend dependencies"
```
