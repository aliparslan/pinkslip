# JobRadar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal job alerting PWA that polls ~150 company career sites every 15 minutes and sends iOS push notifications for high-scoring matches.

**Architecture:** Single Cloudflare Worker (Hono) handles API routes and cron-based polling. ATS adapters fetch from Greenhouse/Lever/Ashby APIs, diff against D1, score new jobs, and send Web Push notifications. Svelte SPA served as CF Static Assets.

**Tech Stack:** Svelte 5, Vite, DaisyUI 4, Tailwind CSS 3, Hono, Cloudflare Workers, D1, Cron Triggers, Web Push (VAPID), vitest

---

## File Structure

```
job-search/
├── package.json
├── tsconfig.json
├── wrangler.toml
├── vitest.config.ts
├── worker/
│   ├── index.ts                    # Hono app + scheduled export
│   ├── types.ts                    # Env bindings, shared types
│   ├── routes/
│   │   ├── jobs.ts
│   │   ├── companies.ts
│   │   ├── preferences.ts
│   │   ├── push.ts
│   │   └── stats.ts
│   ├── adapters/
│   │   ├── types.ts                # JobListing, ATSAdapter
│   │   ├── greenhouse.ts
│   │   ├── lever.ts
│   │   └── ashby.ts
│   ├── scoring.ts
│   ├── poller.ts
│   └── push.ts                     # Web Push sending via WebCrypto
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.css
│   │   ├── App.svelte
│   │   ├── router.ts
│   │   ├── lib/
│   │   │   ├── api.ts              # Fetch wrapper for /api/*
│   │   │   └── push.ts             # Push subscription registration
│   │   ├── pages/
│   │   │   ├── Feed.svelte
│   │   │   ├── JobDetail.svelte
│   │   │   ├── Companies.svelte
│   │   │   └── Settings.svelte
│   │   └── components/
│   │       ├── JobCard.svelte
│   │       ├── ScoreBadge.svelte
│   │       ├── FilterChips.svelte
│   │       ├── CompanyRow.svelte
│   │       └── TabBar.svelte
│   └── public/
│       ├── manifest.json
│       ├── sw.js
│       └── icons/
│           ├── icon-192.png
│           └── icon-512.png
├── migrations/
│   └── 0001_initial.sql
├── seed/
│   └── companies.json
├── scripts/
│   ├── generate-vapid-keys.ts
│   └── seed-db.ts
└── tests/
    ├── adapters/
    │   ├── greenhouse.test.ts
    │   ├── lever.test.ts
    │   └── ashby.test.ts
    ├── scoring.test.ts
    ├── poller.test.ts
    └── push.test.ts
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.toml`, `vitest.config.ts`, `worker/types.ts`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/alip/dev/job-search
npm init -y
```

- [ ] **Step 2: Install worker dependencies**

```bash
npm install hono
npm install -D wrangler typescript @cloudflare/workers-types vitest @types/node
```

- [ ] **Step 3: Create tsconfig.json**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/2023-07-01"],
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@worker/*": ["./worker/*"],
      "@tests/*": ["./tests/*"]
    }
  },
  "include": ["worker/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["node_modules", "dist", "frontend"]
}
```

- [ ] **Step 4: Create wrangler.toml**

Create `wrangler.toml`:

```toml
name = "jobradar"
main = "worker/index.ts"
compatibility_date = "2024-12-01"

[assets]
directory = "./frontend/dist"

[[d1_databases]]
binding = "DB"
database_name = "jobradar"
database_id = "placeholder-will-be-replaced-after-db-create"

[triggers]
crons = ["*/15 * * * *"]

[vars]
VAPID_SUBJECT = "mailto:aliparslan@outlook.com"
```

- [ ] **Step 5: Create vitest.config.ts**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@worker": path.resolve(__dirname, "worker"),
      "@tests": path.resolve(__dirname, "tests"),
    },
  },
});
```

- [ ] **Step 6: Create worker/types.ts**

Create `worker/types.ts`:

```ts
export interface Env {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

export interface CompanyRow {
  id: string;
  name: string;
  ats_type: "greenhouse" | "lever" | "ashby" | "custom";
  ats_slug: string;
  website: string;
  enabled: number;
  added_at: string;
}

export interface JobRow {
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
  dismissed: number;
}

export interface PreferenceRow {
  key: string;
  value: string;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}
```

- [ ] **Step 7: Add scripts to package.json**

Update `package.json` scripts:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "npm run build:frontend && wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "build:frontend": "cd frontend && npm run build",
    "db:migrate": "wrangler d1 execute jobradar --local --file=migrations/0001_initial.sql",
    "db:migrate:remote": "wrangler d1 execute jobradar --remote --file=migrations/0001_initial.sql"
  }
}
```

- [ ] **Step 8: Commit scaffolding**

```bash
git add package.json package-lock.json tsconfig.json wrangler.toml vitest.config.ts worker/types.ts
git commit -m "feat: project scaffolding with Hono, D1, vitest"
```

---

## Task 2: D1 Schema

**Files:**
- Create: `migrations/0001_initial.sql`

- [ ] **Step 1: Create the migration file**

Create `migrations/0001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ats_type TEXT NOT NULL CHECK (ats_type IN ('greenhouse', 'lever', 'ashby', 'custom')),
  ats_slug TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  department TEXT,
  posted_at TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  score INTEGER NOT NULL DEFAULT 0,
  dismissed INTEGER NOT NULL DEFAULT 0,
  UNIQUE(company_id, external_id)
);

CREATE INDEX idx_jobs_score ON jobs(score DESC);
CREATE INDEX idx_jobs_first_seen ON jobs(first_seen_at DESC);
CREATE INDEX idx_jobs_company ON jobs(company_id);

CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO preferences (key, value) VALUES
  ('locations', '["Remote", "NYC", "SF", "Dallas"]'),
  ('min_yoe', '0'),
  ('max_yoe', '2'),
  ('role_keywords', '["software engineer", "fullstack", "backend", "frontend", "forward deployed engineer"]'),
  ('negative_keywords', '["staff", "principal", "director", "intern", "manager", "senior staff", "vp", "head of"]'),
  ('notify_threshold', '50');

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Test migration locally**

```bash
npx wrangler d1 execute jobradar --local --file=migrations/0001_initial.sql
```

Expected: no errors, tables created.

- [ ] **Step 3: Verify tables**

```bash
npx wrangler d1 execute jobradar --local --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected: `companies`, `jobs`, `preferences`, `push_subscriptions`

- [ ] **Step 4: Commit**

```bash
git add migrations/0001_initial.sql
git commit -m "feat: D1 schema with companies, jobs, preferences, push_subscriptions"
```

---

## Task 3: ATS Adapter Types

**Files:**
- Create: `worker/adapters/types.ts`

- [ ] **Step 1: Define adapter interfaces**

Create `worker/adapters/types.ts`:

```ts
export interface JobListing {
  externalId: string;
  title: string;
  url: string;
  location: string;
  department: string | null;
  postedAt: string | null;
}

export interface ATSAdapter {
  name: string;
  fetchJobs(slug: string): Promise<JobListing[]>;
}
```

- [ ] **Step 2: Commit**

```bash
git add worker/adapters/types.ts
git commit -m "feat: ATS adapter interface types"
```

---

## Task 4: Greenhouse Adapter

**Files:**
- Create: `worker/adapters/greenhouse.ts`, `tests/adapters/greenhouse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapters/greenhouse.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GreenhouseAdapter } from "@worker/adapters/greenhouse";

const MOCK_RESPONSE = {
  jobs: [
    {
      id: 4567890,
      title: "Software Engineer, Backend",
      location: { name: "San Francisco, CA" },
      departments: [{ name: "Engineering" }],
      absolute_url: "https://boards.greenhouse.io/anthropic/jobs/4567890",
      updated_at: "2026-05-01T12:00:00Z",
    },
    {
      id: 4567891,
      title: "Product Manager",
      location: { name: "Remote" },
      departments: [{ name: "Product" }],
      absolute_url: "https://boards.greenhouse.io/anthropic/jobs/4567891",
      updated_at: "2026-04-30T08:00:00Z",
    },
  ],
};

describe("GreenhouseAdapter", () => {
  let adapter: GreenhouseAdapter;

  beforeEach(() => {
    adapter = new GreenhouseAdapter();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSE),
      })
    );
  });

  it("fetches and parses jobs from greenhouse API", async () => {
    const jobs = await adapter.fetchJobs("anthropic");

    expect(fetch).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true"
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      externalId: "4567890",
      title: "Software Engineer, Backend",
      url: "https://boards.greenhouse.io/anthropic/jobs/4567890",
      location: "San Francisco, CA",
      department: "Engineering",
      postedAt: "2026-05-01T12:00:00Z",
    });
  });

  it("returns empty array on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );

    const jobs = await adapter.fetchJobs("nonexistent");
    expect(jobs).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error"))
    );

    const jobs = await adapter.fetchJobs("anthropic");
    expect(jobs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/adapters/greenhouse.test.ts
```

Expected: FAIL — cannot find module `@worker/adapters/greenhouse`

- [ ] **Step 3: Implement Greenhouse adapter**

Create `worker/adapters/greenhouse.ts`:

```ts
import type { ATSAdapter, JobListing } from "./types";

interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  departments: { name: string }[];
  absolute_url: string;
  updated_at: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

export class GreenhouseAdapter implements ATSAdapter {
  name = "greenhouse";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
      );
      if (!res.ok) return [];

      const data: GreenhouseResponse = await res.json();
      return data.jobs.map((job) => ({
        externalId: String(job.id),
        title: job.title,
        url: job.absolute_url,
        location: job.location?.name ?? "",
        department: job.departments?.[0]?.name ?? null,
        postedAt: job.updated_at ?? null,
      }));
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/adapters/greenhouse.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add worker/adapters/greenhouse.ts tests/adapters/greenhouse.test.ts
git commit -m "feat: Greenhouse ATS adapter with tests"
```

---

## Task 5: Lever Adapter

**Files:**
- Create: `worker/adapters/lever.ts`, `tests/adapters/lever.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapters/lever.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeverAdapter } from "@worker/adapters/lever";

const MOCK_RESPONSE = [
  {
    id: "abc-123-def",
    text: "Software Engineer, Growth",
    categories: {
      location: "New York, NY",
      department: "Engineering",
      team: "Growth",
    },
    hostedUrl: "https://jobs.lever.co/robinhood/abc-123-def",
    createdAt: 1746100800000,
  },
  {
    id: "ghi-456-jkl",
    text: "Data Scientist",
    categories: {
      location: "Remote",
      department: "Data",
    },
    hostedUrl: "https://jobs.lever.co/robinhood/ghi-456-jkl",
    createdAt: 1746014400000,
  },
];

describe("LeverAdapter", () => {
  let adapter: LeverAdapter;

  beforeEach(() => {
    adapter = new LeverAdapter();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSE),
      })
    );
  });

  it("fetches and parses jobs from lever API", async () => {
    const jobs = await adapter.fetchJobs("robinhood");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.lever.co/v0/postings/robinhood?mode=json"
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      externalId: "abc-123-def",
      title: "Software Engineer, Growth",
      url: "https://jobs.lever.co/robinhood/abc-123-def",
      location: "New York, NY",
      department: "Engineering",
      postedAt: "2026-05-01T12:00:00.000Z",
    });
  });

  it("returns empty array on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    const jobs = await adapter.fetchJobs("nonexistent");
    expect(jobs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/adapters/lever.test.ts
```

Expected: FAIL — cannot find module `@worker/adapters/lever`

- [ ] **Step 3: Implement Lever adapter**

Create `worker/adapters/lever.ts`:

```ts
import type { ATSAdapter, JobListing } from "./types";

interface LeverPosting {
  id: string;
  text: string;
  categories: {
    location?: string;
    department?: string;
    team?: string;
  };
  hostedUrl: string;
  createdAt: number;
}

export class LeverAdapter implements ATSAdapter {
  name = "lever";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      const res = await fetch(
        `https://api.lever.co/v0/postings/${slug}?mode=json`
      );
      if (!res.ok) return [];

      const data: LeverPosting[] = await res.json();
      return data.map((post) => ({
        externalId: post.id,
        title: post.text,
        url: post.hostedUrl,
        location: post.categories?.location ?? "",
        department: post.categories?.department ?? null,
        postedAt: post.createdAt
          ? new Date(post.createdAt).toISOString()
          : null,
      }));
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/adapters/lever.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add worker/adapters/lever.ts tests/adapters/lever.test.ts
git commit -m "feat: Lever ATS adapter with tests"
```

---

## Task 6: Ashby Adapter

**Files:**
- Create: `worker/adapters/ashby.ts`, `tests/adapters/ashby.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/adapters/ashby.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AshbyAdapter } from "@worker/adapters/ashby";

const MOCK_RESPONSE = {
  data: {
    jobBoard: {
      jobPostings: [
        {
          id: "ashby-001",
          title: "Fullstack Engineer",
          locationName: "San Francisco, CA",
          departmentName: "Engineering",
          publishedDate: "2026-05-01T00:00:00.000Z",
          externalLink: "https://jobs.ashbyhq.com/cursor/ashby-001",
        },
        {
          id: "ashby-002",
          title: "ML Engineer",
          locationName: "Remote (US)",
          departmentName: "AI Research",
          publishedDate: "2026-04-29T00:00:00.000Z",
          externalLink: "https://jobs.ashbyhq.com/cursor/ashby-002",
        },
      ],
    },
  },
};

describe("AshbyAdapter", () => {
  let adapter: AshbyAdapter;

  beforeEach(() => {
    adapter = new AshbyAdapter();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSE),
      })
    );
  });

  it("fetches and parses jobs via Ashby GraphQL API", async () => {
    const jobs = await adapter.fetchJobs("cursor");

    expect(fetch).toHaveBeenCalledWith(
      "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      externalId: "ashby-001",
      title: "Fullstack Engineer",
      url: "https://jobs.ashbyhq.com/cursor/ashby-001",
      location: "San Francisco, CA",
      department: "Engineering",
      postedAt: "2026-05-01T00:00:00.000Z",
    });
  });

  it("returns empty array on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    const jobs = await adapter.fetchJobs("nonexistent");
    expect(jobs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/adapters/ashby.test.ts
```

Expected: FAIL — cannot find module `@worker/adapters/ashby`

- [ ] **Step 3: Implement Ashby adapter**

Create `worker/adapters/ashby.ts`:

```ts
import type { ATSAdapter, JobListing } from "./types";

interface AshbyJobPosting {
  id: string;
  title: string;
  locationName: string;
  departmentName: string | null;
  publishedDate: string | null;
  externalLink: string;
}

interface AshbyResponse {
  data: {
    jobBoard: {
      jobPostings: AshbyJobPosting[];
    };
  };
}

const QUERY = `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
  jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
    jobPostings {
      id
      title
      locationName
      departmentName
      publishedDate
      externalLink
    }
  }
}`;

export class AshbyAdapter implements ATSAdapter {
  name = "ashby";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      const res = await fetch(
        "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationName: "ApiJobBoardWithTeams",
            variables: { organizationHostedJobsPageName: slug },
            query: QUERY,
          }),
        }
      );
      if (!res.ok) return [];

      const data: AshbyResponse = await res.json();
      return data.data.jobBoard.jobPostings.map((post) => ({
        externalId: post.id,
        title: post.title,
        url: post.externalLink,
        location: post.locationName ?? "",
        department: post.departmentName ?? null,
        postedAt: post.publishedDate ?? null,
      }));
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/adapters/ashby.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add worker/adapters/ashby.ts tests/adapters/ashby.test.ts
git commit -m "feat: Ashby ATS adapter with tests"
```

---

## Task 7: Scoring Engine

**Files:**
- Create: `worker/scoring.ts`, `tests/scoring.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/scoring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreJob } from "@worker/scoring";
import type { JobListing } from "@worker/adapters/types";

const DEFAULT_PREFS = {
  locations: ["Remote", "NYC", "SF", "Dallas"],
  min_yoe: 0,
  max_yoe: 2,
  role_keywords: [
    "software engineer",
    "fullstack",
    "backend",
    "frontend",
    "forward deployed engineer",
  ],
  negative_keywords: [
    "staff",
    "principal",
    "director",
    "intern",
    "manager",
    "senior staff",
    "vp",
    "head of",
  ],
};

function makeJob(overrides: Partial<JobListing> = {}): JobListing {
  return {
    externalId: "1",
    title: "Software Engineer",
    url: "https://example.com/job/1",
    location: "Remote",
    department: "Engineering",
    postedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("scoreJob", () => {
  it("gives high score to ideal job", () => {
    const job = makeJob({
      title: "Software Engineer, Backend",
      location: "Remote",
      department: "Engineering",
    });
    const score = scoreJob(job, DEFAULT_PREFS);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("gives low score to senior role", () => {
    const job = makeJob({
      title: "Senior Staff Engineer, ML Infrastructure",
      location: "London",
      department: "Engineering",
    });
    const score = scoreJob(job, DEFAULT_PREFS);
    expect(score).toBeLessThan(30);
  });

  it("scores forward deployed engineer highly", () => {
    const job = makeJob({
      title: "Forward Deployed Engineer",
      location: "NYC",
      department: "Engineering",
    });
    const score = scoreJob(job, DEFAULT_PREFS);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("gives zero title score for non-eng roles", () => {
    const job = makeJob({
      title: "Sales Development Representative",
      location: "Remote",
      department: "Sales",
    });
    const score = scoreJob(job, DEFAULT_PREFS);
    expect(score).toBeLessThan(30);
  });

  it("gives partial location score for unspecified location", () => {
    const job = makeJob({ location: "" });
    const score = scoreJob(job, DEFAULT_PREFS);
    const jobWithRemote = makeJob({ location: "Remote" });
    const remoteScore = scoreJob(jobWithRemote, DEFAULT_PREFS);
    expect(score).toBeLessThan(remoteScore);
    expect(score).toBeGreaterThan(0);
  });

  it("gives zero location score for non-preferred city", () => {
    const job = makeJob({ location: "London, UK" });
    const jobRemote = makeJob({ location: "Remote" });
    const londonScore = scoreJob(job, DEFAULT_PREFS);
    const remoteScore = scoreJob(jobRemote, DEFAULT_PREFS);
    expect(londonScore).toBeLessThan(remoteScore);
  });

  it("handles intern negative keyword", () => {
    const job = makeJob({
      title: "Software Engineering Intern",
      location: "Remote",
    });
    const score = scoreJob(job, DEFAULT_PREFS);
    expect(score).toBeLessThan(30);
  });

  it("gives recency bonus for today's postings", () => {
    const today = makeJob({ postedAt: new Date().toISOString() });
    const old = makeJob({
      postedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    });
    expect(scoreJob(today, DEFAULT_PREFS)).toBeGreaterThan(
      scoreJob(old, DEFAULT_PREFS)
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/scoring.test.ts
```

Expected: FAIL — cannot find module `@worker/scoring`

- [ ] **Step 3: Implement scoring engine**

Create `worker/scoring.ts`:

```ts
import type { JobListing } from "./adapters/types";

export interface ScoringPrefs {
  locations: string[];
  min_yoe: number;
  max_yoe: number;
  role_keywords: string[];
  negative_keywords: string[];
}

export function scoreJob(job: JobListing, prefs: ScoringPrefs): number {
  return (
    scoreTitleMatch(job.title, prefs) +
    scoreYOEFit(job.title, prefs) +
    scoreLocation(job.location, prefs) +
    scoreDepartment(job.department) +
    scoreRecency(job.postedAt)
  );
}

function scoreTitleMatch(title: string, prefs: ScoringPrefs): number {
  const lower = title.toLowerCase();

  for (const neg of prefs.negative_keywords) {
    if (lower.includes(neg.toLowerCase())) return 0;
  }

  for (const kw of prefs.role_keywords) {
    if (lower.includes(kw.toLowerCase())) return 30;
  }

  const engTerms = ["engineer", "developer", "dev", "swe", "sde"];
  for (const term of engTerms) {
    if (lower.includes(term)) return 20;
  }

  return 0;
}

function scoreYOEFit(title: string, prefs: ScoringPrefs): number {
  const lower = title.toLowerCase();
  const yoeMatch = lower.match(/(\d+)\+?\s*(?:years?|yoe)/);

  if (!yoeMatch) {
    if (
      lower.includes("senior") ||
      lower.includes("sr.") ||
      lower.includes("sr ")
    ) {
      return 5;
    }
    if (lower.includes("junior") || lower.includes("jr") || lower.includes("new grad")) {
      return 25;
    }
    return 15;
  }

  const years = parseInt(yoeMatch[1], 10);
  if (years <= prefs.max_yoe + 1) return 25;
  if (years <= prefs.max_yoe + 3) return 10;
  return 0;
}

function scoreLocation(location: string, prefs: ScoringPrefs): number {
  if (!location || location.trim() === "") return 10;

  const lower = location.toLowerCase();

  if (lower.includes("remote")) return 20;

  for (const pref of prefs.locations) {
    if (pref.toLowerCase() === "remote") continue;
    if (lower.includes(pref.toLowerCase())) return 20;
  }

  if (lower.includes("multiple") || lower.includes("various")) return 10;

  return 0;
}

function scoreDepartment(department: string | null): number {
  if (!department) return 5;
  const lower = department.toLowerCase();
  if (
    lower.includes("engineer") ||
    lower.includes("product") ||
    lower.includes("tech") ||
    lower.includes("development") ||
    lower.includes("platform") ||
    lower.includes("infrastructure")
  ) {
    return 10;
  }
  return 0;
}

function scoreRecency(postedAt: string | null): number {
  if (!postedAt) return 3;

  const posted = new Date(postedAt).getTime();
  const now = Date.now();
  const daysAgo = (now - posted) / 86400000;

  if (daysAgo < 1) return 10;
  if (daysAgo < 2) return 7;
  if (daysAgo < 7) return 3;
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/scoring.test.ts
```

Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add worker/scoring.ts tests/scoring.test.ts
git commit -m "feat: rule-based scoring engine with tests"
```

---

## Task 8: Web Push Module

**Files:**
- Create: `worker/push.ts`, `tests/push.test.ts`, `scripts/generate-vapid-keys.ts`

- [ ] **Step 1: Install web-push for key generation only**

```bash
npm install -D web-push
```

- [ ] **Step 2: Create VAPID key generation script**

Create `scripts/generate-vapid-keys.ts`:

```ts
import webpush from "web-push";

const vapidKeys = webpush.generateVAPIDKeys();

console.log("Add these as Cloudflare Worker secrets:\n");
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log("\nRun:");
console.log(
  `echo "${vapidKeys.publicKey}" | npx wrangler secret put VAPID_PUBLIC_KEY`
);
console.log(
  `echo "${vapidKeys.privateKey}" | npx wrangler secret put VAPID_PRIVATE_KEY`
);
```

- [ ] **Step 3: Write the failing test for push sending**

Create `tests/push.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendPushNotification, buildNotificationPayload } from "@worker/push";

describe("buildNotificationPayload", () => {
  it("builds single job notification", () => {
    const payload = buildNotificationPayload([
      { company: "Anthropic", title: "Software Engineer", jobId: "abc-123" },
    ]);

    expect(payload).toEqual({
      title: "Anthropic",
      body: "Software Engineer",
      data: { url: "/jobs/abc-123" },
    });
  });

  it("builds batched notification for 5+ jobs", () => {
    const jobs = Array.from({ length: 6 }, (_, i) => ({
      company: `Company ${i}`,
      title: `Job ${i}`,
      jobId: `id-${i}`,
    }));

    const payload = buildNotificationPayload(jobs);

    expect(payload.title).toBe("6 new jobs");
    expect(payload.body).toContain("Company 0");
    expect(payload.data.url).toBe("/");
  });

  it("builds multi-job notification for 2-4 jobs", () => {
    const jobs = [
      { company: "Anthropic", title: "SWE", jobId: "1" },
      { company: "Stripe", title: "FDE", jobId: "2" },
    ];

    const payload = buildNotificationPayload(jobs);

    expect(payload.title).toBe("2 new jobs");
    expect(payload.body).toContain("Anthropic");
    expect(payload.body).toContain("Stripe");
  });
});

describe("sendPushNotification", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 201 })
    );
  });

  it("sends fetch request to push endpoint", async () => {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "BNcRdreALRFXTkOOUHK1Ec...",
      auth: "tBHItJI5svbpC7CQ...",
    };

    await sendPushNotification(
      subscription,
      { title: "Test", body: "Hello", data: { url: "/" } },
      {
        publicKey: "test-public-key",
        privateKey: "test-private-key",
        subject: "mailto:test@example.com",
      }
    );

    expect(fetch).toHaveBeenCalledWith(
      subscription.endpoint,
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Object),
      })
    );
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/push.test.ts
```

Expected: FAIL — cannot find module `@worker/push`

- [ ] **Step 5: Implement push module**

Create `worker/push.ts`:

```ts
interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface NotificationPayload {
  title: string;
  body: string;
  data: { url: string };
}

interface NotificationJob {
  company: string;
  title: string;
  jobId: string;
}

interface VAPIDConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function buildNotificationPayload(
  jobs: NotificationJob[]
): NotificationPayload {
  if (jobs.length === 1) {
    return {
      title: jobs[0].company,
      body: jobs[0].title,
      data: { url: `/jobs/${jobs[0].jobId}` },
    };
  }

  const companies = [...new Set(jobs.map((j) => j.company))];
  const companyList = companies.slice(0, 4).join(", ");

  return {
    title: `${jobs.length} new jobs`,
    body: companyList + (companies.length > 4 ? " and more" : ""),
    data: { url: "/" },
  };
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: NotificationPayload,
  vapid: VAPIDConfig
): Promise<boolean> {
  try {
    const jwt = await createVAPIDJWT(subscription.endpoint, vapid);
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
      },
      body: payloadBytes,
    });

    return res.ok || res.status === 201;
  } catch {
    return false;
  }
}

async function createVAPIDJWT(
  endpoint: string,
  vapid: VAPIDConfig
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 86400,
    sub: vapid.subject,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const unsigned = `${headerB64}.${payloadB64}`;

  const keyData = base64urlDecode(vapid.privateKey);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );

  return `${unsigned}.${base64urlEncode(new Uint8Array(signature))}`;
}

function base64urlEncode(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(input: string): ArrayBuffer {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/push.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add worker/push.ts tests/push.test.ts scripts/generate-vapid-keys.ts
git commit -m "feat: Web Push module with VAPID JWT and notification payload builder"
```

---

## Task 9: Poller (Cron Handler)

**Files:**
- Create: `worker/poller.ts`, `tests/poller.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/poller.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { diffJobs, pollCompany } from "@worker/poller";
import type { JobListing } from "@worker/adapters/types";

describe("diffJobs", () => {
  it("identifies new jobs not in existing set", () => {
    const fetched: JobListing[] = [
      {
        externalId: "1",
        title: "SWE",
        url: "https://x.com/1",
        location: "Remote",
        department: "Eng",
        postedAt: null,
      },
      {
        externalId: "2",
        title: "PM",
        url: "https://x.com/2",
        location: "NYC",
        department: "Product",
        postedAt: null,
      },
      {
        externalId: "3",
        title: "Designer",
        url: "https://x.com/3",
        location: "SF",
        department: "Design",
        postedAt: null,
      },
    ];
    const existingIds = new Set(["1", "3"]);

    const newJobs = diffJobs(fetched, existingIds);

    expect(newJobs).toHaveLength(1);
    expect(newJobs[0].externalId).toBe("2");
  });

  it("returns all jobs when none exist", () => {
    const fetched: JobListing[] = [
      {
        externalId: "1",
        title: "SWE",
        url: "https://x.com/1",
        location: "Remote",
        department: null,
        postedAt: null,
      },
    ];

    const newJobs = diffJobs(fetched, new Set());
    expect(newJobs).toHaveLength(1);
  });

  it("returns empty when all jobs exist", () => {
    const fetched: JobListing[] = [
      {
        externalId: "1",
        title: "SWE",
        url: "https://x.com/1",
        location: "Remote",
        department: null,
        postedAt: null,
      },
    ];

    const newJobs = diffJobs(fetched, new Set(["1"]));
    expect(newJobs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/poller.test.ts
```

Expected: FAIL — cannot find module `@worker/poller`

- [ ] **Step 3: Implement poller**

Create `worker/poller.ts`:

```ts
import type { JobListing } from "./adapters/types";
import type { ATSAdapter } from "./adapters/types";
import type { Env, CompanyRow } from "./types";
import { GreenhouseAdapter } from "./adapters/greenhouse";
import { LeverAdapter } from "./adapters/lever";
import { AshbyAdapter } from "./adapters/ashby";
import { scoreJob, type ScoringPrefs } from "./scoring";
import {
  sendPushNotification,
  buildNotificationPayload,
} from "./push";

const adapters: Record<string, ATSAdapter> = {
  greenhouse: new GreenhouseAdapter(),
  lever: new LeverAdapter(),
  ashby: new AshbyAdapter(),
};

export function diffJobs(
  fetched: JobListing[],
  existingExternalIds: Set<string>
): JobListing[] {
  return fetched.filter((job) => !existingExternalIds.has(job.externalId));
}

export async function runPollCycle(env: Env): Promise<{
  companiesPolled: number;
  newJobsFound: number;
  notificationsSent: number;
}> {
  const companies = await env.DB.prepare(
    "SELECT * FROM companies WHERE enabled = 1 AND ats_type != 'custom'"
  )
    .all<CompanyRow>();

  const prefs = await loadPreferences(env.DB);

  const results = await Promise.allSettled(
    companies.results.map((company) =>
      pollCompany(company, prefs, env)
    )
  );

  let totalNew = 0;
  const allNewJobs: { company: string; title: string; jobId: string; score?: number }[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      totalNew += result.value.newJobs.length;
      allNewJobs.push(...result.value.newJobs);
    }
  }

  let notificationsSent = 0;
  const notifyThreshold = prefs.notify_threshold ?? 50;
  const qualifyingJobs = allNewJobs.filter(
    (j) => j.score !== undefined && j.score >= notifyThreshold
  );

  if (qualifyingJobs.length > 0) {
    const subscriptions = await env.DB.prepare(
      "SELECT * FROM push_subscriptions"
    ).all();

    const payload = buildNotificationPayload(qualifyingJobs);
    const vapid = {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT,
    };

    for (const sub of subscriptions.results) {
      const sent = await sendPushNotification(
        sub as any,
        payload,
        vapid
      );
      if (sent) notificationsSent++;
    }
  }

  return {
    companiesPolled: companies.results.length,
    newJobsFound: totalNew,
    notificationsSent,
  };
}

export async function pollCompany(
  company: CompanyRow,
  prefs: ScoringPrefs & { notify_threshold?: number },
  env: Env
): Promise<{ newJobs: { company: string; title: string; jobId: string; score?: number }[] }> {
  const adapter = adapters[company.ats_type];
  if (!adapter) return { newJobs: [] };

  const fetched = await adapter.fetchJobs(company.ats_slug);
  if (fetched.length === 0) return { newJobs: [] };

  const existing = await env.DB.prepare(
    "SELECT external_id FROM jobs WHERE company_id = ?"
  )
    .bind(company.id)
    .all<{ external_id: string }>();

  const existingIds = new Set(existing.results.map((r) => r.external_id));
  const newListings = diffJobs(fetched, existingIds);

  const newJobs: { company: string; title: string; jobId: string; score?: number }[] = [];

  for (const listing of newListings) {
    const score = scoreJob(listing, prefs);
    const id = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO jobs (id, company_id, external_id, title, url, location, department, posted_at, score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        company.id,
        listing.externalId,
        listing.title,
        listing.url,
        listing.location,
        listing.department,
        listing.postedAt,
        score
      )
      .run();

    newJobs.push({
      company: company.name,
      title: listing.title,
      jobId: id,
      score,
    });
  }

  return { newJobs };
}

async function loadPreferences(
  db: D1Database
): Promise<ScoringPrefs & { notify_threshold?: number }> {
  const rows = await db.prepare("SELECT key, value FROM preferences").all<{
    key: string;
    value: string;
  }>();

  const prefs: Record<string, any> = {};
  for (const row of rows.results) {
    try {
      prefs[row.key] = JSON.parse(row.value);
    } catch {
      prefs[row.key] = row.value;
    }
  }

  return {
    locations: prefs.locations ?? ["Remote"],
    min_yoe: Number(prefs.min_yoe ?? 0),
    max_yoe: Number(prefs.max_yoe ?? 2),
    role_keywords: prefs.role_keywords ?? ["software engineer"],
    negative_keywords: prefs.negative_keywords ?? ["intern", "director"],
    notify_threshold: Number(prefs.notify_threshold ?? 50),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/poller.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add worker/poller.ts tests/poller.test.ts
git commit -m "feat: polling engine with job diffing, scoring, and push notification dispatch"
```

---

## Task 10: API Routes — Jobs

**Files:**
- Create: `worker/routes/jobs.ts`

- [ ] **Step 1: Create jobs routes**

Create `worker/routes/jobs.ts`:

```ts
import { Hono } from "hono";
import type { Env, JobRow } from "../types";

const jobs = new Hono<{ Bindings: Env }>();

jobs.get("/", async (c) => {
  const score = c.req.query("min_score");
  const company = c.req.query("company_id");
  const dismissed = c.req.query("dismissed");
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const offset = Number(c.req.query("offset") ?? 0);

  let query = "SELECT j.*, c.name as company_name FROM jobs j JOIN companies c ON j.company_id = c.id WHERE 1=1";
  const params: any[] = [];

  if (score) {
    query += " AND j.score >= ?";
    params.push(Number(score));
  }
  if (company) {
    query += " AND j.company_id = ?";
    params.push(company);
  }
  if (dismissed !== "true") {
    query += " AND j.dismissed = 0";
  }

  query += " ORDER BY j.first_seen_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ jobs: result.results, meta: { limit, offset } });
});

jobs.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare(
    "SELECT j.*, c.name as company_name FROM jobs j JOIN companies c ON j.company_id = c.id WHERE j.id = ?"
  )
    .bind(id)
    .first();

  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

jobs.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ dismissed?: boolean }>();

  if (body.dismissed !== undefined) {
    await c.env.DB.prepare("UPDATE jobs SET dismissed = ? WHERE id = ?")
      .bind(body.dismissed ? 1 : 0, id)
      .run();
  }

  const updated = await c.env.DB.prepare("SELECT * FROM jobs WHERE id = ?")
    .bind(id)
    .first();
  return c.json(updated);
});

export default jobs;
```

- [ ] **Step 2: Commit**

```bash
git add worker/routes/jobs.ts
git commit -m "feat: jobs API routes (list, detail, dismiss)"
```

---

## Task 11: API Routes — Companies, Preferences, Push, Stats

**Files:**
- Create: `worker/routes/companies.ts`, `worker/routes/preferences.ts`, `worker/routes/push.ts`, `worker/routes/stats.ts`

- [ ] **Step 1: Create companies routes**

Create `worker/routes/companies.ts`:

```ts
import { Hono } from "hono";
import type { Env } from "../types";

const companies = new Hono<{ Bindings: Env }>();

companies.get("/", async (c) => {
  const atsType = c.req.query("ats_type");
  let query = "SELECT * FROM companies";
  const params: any[] = [];

  if (atsType) {
    query += " WHERE ats_type = ?";
    params.push(atsType);
  }

  query += " ORDER BY name ASC";
  const result = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ companies: result.results });
});

companies.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    ats_type: string;
    ats_slug: string;
    website?: string;
  }>();

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO companies (id, name, ats_type, ats_slug, website) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, body.name, body.ats_type, body.ats_slug, body.website ?? "")
    .run();

  return c.json({ id, ...body }, 201);
});

companies.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    enabled?: boolean;
    ats_slug?: string;
    ats_type?: string;
  }>();

  const updates: string[] = [];
  const params: any[] = [];

  if (body.enabled !== undefined) {
    updates.push("enabled = ?");
    params.push(body.enabled ? 1 : 0);
  }
  if (body.ats_slug) {
    updates.push("ats_slug = ?");
    params.push(body.ats_slug);
  }
  if (body.ats_type) {
    updates.push("ats_type = ?");
    params.push(body.ats_type);
  }

  if (updates.length === 0) return c.json({ error: "No updates" }, 400);

  params.push(id);
  await c.env.DB.prepare(
    `UPDATE companies SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...params)
    .run();

  const updated = await c.env.DB.prepare(
    "SELECT * FROM companies WHERE id = ?"
  )
    .bind(id)
    .first();
  return c.json(updated);
});

companies.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM companies WHERE id = ?").bind(id).run();
  return c.json({ deleted: true });
});

export default companies;
```

- [ ] **Step 2: Create preferences routes**

Create `worker/routes/preferences.ts`:

```ts
import { Hono } from "hono";
import type { Env } from "../types";

const preferences = new Hono<{ Bindings: Env }>();

preferences.get("/", async (c) => {
  const result = await c.env.DB.prepare("SELECT * FROM preferences").all();
  const prefs: Record<string, any> = {};
  for (const row of result.results as any[]) {
    try {
      prefs[row.key] = JSON.parse(row.value);
    } catch {
      prefs[row.key] = row.value;
    }
  }
  return c.json(prefs);
});

preferences.put("/", async (c) => {
  const body = await c.req.json<Record<string, any>>();

  const stmt = c.env.DB.prepare(
    "INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)"
  );

  const batch = Object.entries(body).map(([key, value]) =>
    stmt.bind(key, typeof value === "string" ? value : JSON.stringify(value))
  );

  await c.env.DB.batch(batch);
  return c.json({ updated: true });
});

export default preferences;
```

- [ ] **Step 3: Create push routes**

Create `worker/routes/push.ts`:

```ts
import { Hono } from "hono";
import type { Env } from "../types";

const push = new Hono<{ Bindings: Env }>();

push.post("/subscribe", async (c) => {
  const body = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO push_subscriptions (id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)"
  )
    .bind(id, body.endpoint, body.keys.p256dh, body.keys.auth)
    .run();

  return c.json({ id }, 201);
});

push.delete("/subscribe", async (c) => {
  const body = await c.req.json<{ endpoint: string }>();
  await c.env.DB.prepare(
    "DELETE FROM push_subscriptions WHERE endpoint = ?"
  )
    .bind(body.endpoint)
    .run();

  return c.json({ deleted: true });
});

export default push;
```

- [ ] **Step 4: Create stats route**

Create `worker/routes/stats.ts`:

```ts
import { Hono } from "hono";
import type { Env } from "../types";

const stats = new Hono<{ Bindings: Env }>();

stats.get("/", async (c) => {
  const [totalJobs, newToday, activeCompanies] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as count FROM jobs WHERE dismissed = 0")
      .first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM jobs WHERE first_seen_at >= date('now') AND dismissed = 0"
    ).first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM companies WHERE enabled = 1"
    ).first<{ count: number }>(),
  ]);

  return c.json({
    totalJobs: totalJobs?.count ?? 0,
    newToday: newToday?.count ?? 0,
    activeCompanies: activeCompanies?.count ?? 0,
  });
});

export default stats;
```

- [ ] **Step 5: Commit**

```bash
git add worker/routes/companies.ts worker/routes/preferences.ts worker/routes/push.ts worker/routes/stats.ts
git commit -m "feat: API routes for companies, preferences, push subscriptions, and stats"
```

---

## Task 12: Worker Entry Point

**Files:**
- Create: `worker/index.ts`

- [ ] **Step 1: Create the Hono app with all routes and cron handler**

Create `worker/index.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import jobRoutes from "./routes/jobs";
import companyRoutes from "./routes/companies";
import preferenceRoutes from "./routes/preferences";
import pushRoutes from "./routes/push";
import statRoutes from "./routes/stats";
import { runPollCycle } from "./poller";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

app.route("/api/jobs", jobRoutes);
app.route("/api/companies", companyRoutes);
app.route("/api/preferences", preferenceRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/stats", statRoutes);

app.get("/api/health", (c) => c.json({ ok: true }));

export default {
  fetch: app.fetch,
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      runPollCycle(env).then((result) => {
        console.log(
          `Poll complete: ${result.companiesPolled} companies, ${result.newJobsFound} new jobs, ${result.notificationsSent} notifications`
        );
      })
    );
  },
};
```

- [ ] **Step 2: Verify worker builds**

```bash
npx wrangler deploy --dry-run
```

Expected: Build succeeds without errors.

- [ ] **Step 3: Commit**

```bash
git add worker/index.ts
git commit -m "feat: worker entry point with Hono routes and cron handler"
```

---

## Task 13: Frontend Scaffolding

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/index.html`, `frontend/src/main.ts`, `frontend/src/app.css`, `frontend/src/App.svelte`

- [ ] **Step 1: Initialize frontend package**

```bash
mkdir -p frontend/src frontend/public/icons
cd frontend
npm init -y
npm install svelte
npm install -D @sveltejs/vite-plugin-svelte vite tailwindcss@3 postcss autoprefixer daisyui@4 typescript svelte-check
cd ..
```

- [ ] **Step 2: Create vite.config.ts**

Create `frontend/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
```

- [ ] **Step 3: Create Tailwind + DaisyUI config**

Create `frontend/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{svelte,js,ts}"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["dark"],
  },
};
```

Create `frontend/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create index.html**

Create `frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1d232a" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" type="image/png" href="/icons/icon-192.png" />
    <title>JobRadar</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create app.css**

Create `frontend/src/app.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Create main.ts and App.svelte**

Create `frontend/src/main.ts`:

```ts
import App from "./App.svelte";
import "./app.css";
import { mount } from "svelte";

const app = mount(App, { target: document.getElementById("app")! });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}

export default app;
```

Create `frontend/src/App.svelte`:

```svelte
<script lang="ts">
  import { currentRoute } from "./router";
  import Feed from "./pages/Feed.svelte";
  import JobDetail from "./pages/JobDetail.svelte";
  import Companies from "./pages/Companies.svelte";
  import Settings from "./pages/Settings.svelte";
  import TabBar from "./components/TabBar.svelte";

  const routes: Record<string, any> = {
    "/": Feed,
    "/companies": Companies,
    "/settings": Settings,
  };

  let route = $derived($currentRoute);
  let isDetailPage = $derived(route.startsWith("/jobs/"));
  let CurrentPage = $derived(
    isDetailPage ? JobDetail : (routes[route] ?? Feed)
  );
  let jobId = $derived(isDetailPage ? route.split("/jobs/")[1] : null);
</script>

<div class="min-h-screen bg-base-100 pb-16">
  {#if isDetailPage}
    <CurrentPage {jobId} />
  {:else}
    <CurrentPage />
  {/if}
  <TabBar />
</div>
```

- [ ] **Step 7: Create router**

Create `frontend/src/router.ts`:

```ts
import { writable, derived } from "svelte/store";

const hash = writable(window.location.hash.slice(1) || "/");

window.addEventListener("hashchange", () => {
  hash.set(window.location.hash.slice(1) || "/");
});

export const currentRoute = derived(hash, ($hash) => $hash || "/");

export function navigate(path: string) {
  window.location.hash = path;
}
```

- [ ] **Step 8: Create svelte.config.js**

Create `frontend/svelte.config.js`:

```js
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
};
```

- [ ] **Step 9: Add frontend build script to root package.json and add tsconfig**

Create `frontend/tsconfig.json`:

```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"]
}
```

Install the tsconfig base:

```bash
cd frontend && npm install -D @tsconfig/svelte && cd ..
```

Add to `frontend/package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "svelte-check --tsconfig ./tsconfig.json"
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat: frontend scaffolding with Svelte 5, Vite, DaisyUI"
```

---

## Task 14: API Client + Shared Components

**Files:**
- Create: `frontend/src/lib/api.ts`, `frontend/src/components/TabBar.svelte`, `frontend/src/components/ScoreBadge.svelte`, `frontend/src/components/JobCard.svelte`, `frontend/src/components/FilterChips.svelte`, `frontend/src/components/CompanyRow.svelte`

- [ ] **Step 1: Create API client**

Create `frontend/src/lib/api.ts`:

```ts
const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  jobs: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ jobs: any[]; meta: any }>(`/jobs${qs}`);
    },
    get: (id: string) => request<any>(`/jobs/${id}`),
    dismiss: (id: string) =>
      request<any>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dismissed: true }),
      }),
    undismiss: (id: string) =>
      request<any>(`/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dismissed: false }),
      }),
  },
  companies: {
    list: (atsType?: string) => {
      const qs = atsType ? `?ats_type=${atsType}` : "";
      return request<{ companies: any[] }>(`/companies${qs}`);
    },
    toggle: (id: string, enabled: boolean) =>
      request<any>(`/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    delete: (id: string) =>
      request<any>(`/companies/${id}`, { method: "DELETE" }),
    create: (data: { name: string; ats_type: string; ats_slug: string }) =>
      request<any>("/companies", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  preferences: {
    get: () => request<Record<string, any>>("/preferences"),
    update: (prefs: Record<string, any>) =>
      request<any>("/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      }),
  },
  push: {
    subscribe: (subscription: PushSubscription) =>
      request<any>("/push/subscribe", {
        method: "POST",
        body: JSON.stringify(subscription.toJSON()),
      }),
    unsubscribe: (endpoint: string) =>
      request<any>("/push/subscribe", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      }),
  },
  stats: {
    get: () =>
      request<{ totalJobs: number; newToday: number; activeCompanies: number }>(
        "/stats"
      ),
  },
};
```

- [ ] **Step 2: Create TabBar component**

Create `frontend/src/components/TabBar.svelte`:

```svelte
<script lang="ts">
  import { currentRoute, navigate } from "../router";

  const tabs = [
    { path: "/", label: "Jobs", icon: "📋" },
    { path: "/companies", label: "Companies", icon: "🏢" },
    { path: "/settings", label: "Settings", icon: "⚙️" },
  ];

  let route = $derived($currentRoute);
</script>

<div class="btm-nav btm-nav-sm bg-base-200">
  {#each tabs as tab}
    <button
      class={route === tab.path || (tab.path === "/" && route.startsWith("/jobs/")) ? "active" : ""}
      onclick={() => navigate(tab.path)}
    >
      <span class="text-lg">{tab.icon}</span>
      <span class="btm-nav-label text-xs">{tab.label}</span>
    </button>
  {/each}
</div>
```

- [ ] **Step 3: Create ScoreBadge component**

Create `frontend/src/components/ScoreBadge.svelte`:

```svelte
<script lang="ts">
  let { score }: { score: number } = $props();

  let colorClass = $derived(
    score >= 70 ? "badge-success" : score >= 40 ? "badge-warning" : "badge-ghost"
  );
</script>

<span class="badge {colorClass} badge-sm font-bold">{score}</span>
```

- [ ] **Step 4: Create JobCard component**

Create `frontend/src/components/JobCard.svelte`:

```svelte
<script lang="ts">
  import ScoreBadge from "./ScoreBadge.svelte";
  import { navigate } from "../router";

  let { job }: { job: any } = $props();

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
</script>

<button
  class="card bg-base-200 shadow-sm w-full text-left"
  onclick={() => navigate(`/jobs/${job.id}`)}
>
  <div class="card-body p-4 flex-row items-center gap-3">
    <div class="flex-1 min-w-0">
      <h3 class="font-semibold text-sm truncate">{job.title}</h3>
      <p class="text-xs text-base-content/50">
        {job.company_name} · {job.location || "Unknown"} · {timeAgo(job.first_seen_at)}
      </p>
    </div>
    <ScoreBadge score={job.score} />
  </div>
</button>
```

- [ ] **Step 5: Create FilterChips component**

Create `frontend/src/components/FilterChips.svelte`:

```svelte
<script lang="ts">
  let { filters, selected, onSelect }: {
    filters: string[];
    selected: string;
    onSelect: (filter: string) => void;
  } = $props();
</script>

<div class="flex gap-2 overflow-x-auto pb-2">
  {#each filters as filter}
    <button
      class="btn btn-xs {selected === filter ? 'btn-primary' : 'btn-ghost'}"
      onclick={() => onSelect(filter)}
    >
      {filter}
    </button>
  {/each}
</div>
```

- [ ] **Step 6: Create CompanyRow component**

Create `frontend/src/components/CompanyRow.svelte`:

```svelte
<script lang="ts">
  let { company, onToggle }: {
    company: any;
    onToggle: (id: string, enabled: boolean) => void;
  } = $props();
</script>

<div class="flex items-center justify-between py-2 px-1">
  <div class="flex-1">
    <span class={company.enabled ? "" : "text-base-content/30"}>
      {company.name}
    </span>
    <span class="badge badge-ghost badge-xs ml-2">{company.ats_type}</span>
  </div>
  <input
    type="checkbox"
    class="toggle toggle-sm toggle-success"
    checked={!!company.enabled}
    onchange={() => onToggle(company.id, !company.enabled)}
  />
</div>
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/
git commit -m "feat: API client and shared UI components"
```

---

## Task 15: Pages — Feed, JobDetail, Companies, Settings

**Files:**
- Create: `frontend/src/pages/Feed.svelte`, `frontend/src/pages/JobDetail.svelte`, `frontend/src/pages/Companies.svelte`, `frontend/src/pages/Settings.svelte`

- [ ] **Step 1: Create Feed page**

Create `frontend/src/pages/Feed.svelte`:

```svelte
<script lang="ts">
  import { api } from "../lib/api";
  import JobCard from "../components/JobCard.svelte";
  import FilterChips from "../components/FilterChips.svelte";

  let jobs = $state<any[]>([]);
  let loading = $state(true);
  let selectedFilter = $state("All");
  let stats = $state({ totalJobs: 0, newToday: 0, activeCompanies: 0 });

  const filters = ["All", "Remote", "NYC", "SF", "Dallas"];

  async function loadJobs() {
    loading = true;
    try {
      const params: Record<string, string> = {};
      if (selectedFilter !== "All") {
        // Client-side filter — load all then filter
      }
      const data = await api.jobs.list(params);
      jobs = data.jobs;
      const s = await api.stats.get();
      stats = s;
    } finally {
      loading = false;
    }
  }

  let filteredJobs = $derived(
    selectedFilter === "All"
      ? jobs
      : jobs.filter((j) =>
          j.location?.toLowerCase().includes(selectedFilter.toLowerCase())
        )
  );

  function selectFilter(f: string) {
    selectedFilter = f;
  }

  $effect(() => {
    loadJobs();
  });
</script>

<div class="p-4">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-xl font-bold">JobRadar</h1>
    <div class="badge badge-primary badge-outline">{stats.newToday} new today</div>
  </div>

  <FilterChips filters={filters} selected={selectedFilter} onSelect={selectFilter} />

  <div class="mt-4 space-y-2">
    {#if loading}
      <div class="flex justify-center py-8">
        <span class="loading loading-spinner loading-md"></span>
      </div>
    {:else if filteredJobs.length === 0}
      <div class="text-center py-8 text-base-content/50">
        No jobs found
      </div>
    {:else}
      {#each filteredJobs as job (job.id)}
        <JobCard {job} />
      {/each}
    {/if}
  </div>
</div>
```

- [ ] **Step 2: Create JobDetail page**

Create `frontend/src/pages/JobDetail.svelte`:

```svelte
<script lang="ts">
  import { api } from "../lib/api";
  import { navigate } from "../router";
  import ScoreBadge from "../components/ScoreBadge.svelte";

  let { jobId }: { jobId: string | null } = $props();
  let job = $state<any>(null);
  let loading = $state(true);

  const scoreFactors = [
    { label: "Title", max: 35 },
    { label: "YOE", max: 25 },
    { label: "Location", max: 20 },
    { label: "Department", max: 10 },
    { label: "Recency", max: 10 },
  ];

  async function load() {
    if (!jobId) return;
    loading = true;
    try {
      job = await api.jobs.get(jobId);
    } finally {
      loading = false;
    }
  }

  async function dismiss() {
    if (!jobId) return;
    await api.jobs.dismiss(jobId);
    navigate("/");
  }

  $effect(() => {
    load();
  });
</script>

<div class="p-4">
  <button class="btn btn-ghost btn-sm mb-4" onclick={() => navigate("/")}>
    ← Back
  </button>

  {#if loading}
    <div class="flex justify-center py-8">
      <span class="loading loading-spinner loading-md"></span>
    </div>
  {:else if job}
    <div class="mb-4">
      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-lg font-bold">{job.title}</h1>
          <p class="text-sm text-base-content/50">
            {job.company_name} · {job.location || "Unknown"}
          </p>
          {#if job.posted_at}
            <p class="text-xs text-base-content/40 mt-1">
              Posted {new Date(job.posted_at).toLocaleDateString()}
            </p>
          {/if}
        </div>
        <ScoreBadge score={job.score} />
      </div>
    </div>

    <div class="card bg-base-200 mb-4">
      <div class="card-body p-4">
        <h3 class="text-sm font-semibold mb-2">Score Breakdown</h3>
        <div class="grid grid-cols-2 gap-2">
          {#each scoreFactors as factor}
            <div class="flex justify-between text-sm">
              <span class="text-base-content/60">{factor.label}</span>
              <span class="font-medium">/{factor.max}</span>
            </div>
          {/each}
          <div class="col-span-2 divider my-0"></div>
          <div class="flex justify-between text-sm font-bold col-span-2">
            <span>Total</span>
            <span class="text-success">{job.score}/100</span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <a
        href={job.url}
        target="_blank"
        rel="noopener"
        class="btn btn-primary flex-1"
      >
        Apply on {job.company_name} →
      </a>
      <button class="btn btn-ghost" onclick={dismiss}>
        Dismiss
      </button>
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Create Companies page**

Create `frontend/src/pages/Companies.svelte`:

```svelte
<script lang="ts">
  import { api } from "../lib/api";
  import CompanyRow from "../components/CompanyRow.svelte";
  import FilterChips from "../components/FilterChips.svelte";

  let companies = $state<any[]>([]);
  let loading = $state(true);
  let selectedFilter = $state("All");

  const filters = ["All", "greenhouse", "lever", "ashby", "custom"];

  async function loadCompanies() {
    loading = true;
    try {
      const data = await api.companies.list();
      companies = data.companies;
    } finally {
      loading = false;
    }
  }

  let filtered = $derived(
    selectedFilter === "All"
      ? companies
      : companies.filter((c) => c.ats_type === selectedFilter)
  );

  let enabledCount = $derived(companies.filter((c) => c.enabled).length);

  async function handleToggle(id: string, enabled: boolean) {
    await api.companies.toggle(id, enabled);
    companies = companies.map((c) =>
      c.id === id ? { ...c, enabled: enabled ? 1 : 0 } : c
    );
  }

  $effect(() => {
    loadCompanies();
  });
</script>

<div class="p-4">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-xl font-bold">Companies</h1>
    <div class="badge badge-outline">{enabledCount} active</div>
  </div>

  <FilterChips
    filters={filters}
    selected={selectedFilter}
    onSelect={(f) => (selectedFilter = f)}
  />

  <div class="mt-4 divide-y divide-base-300">
    {#if loading}
      <div class="flex justify-center py-8">
        <span class="loading loading-spinner loading-md"></span>
      </div>
    {:else}
      {#each filtered as company (company.id)}
        <CompanyRow {company} onToggle={handleToggle} />
      {/each}
    {/if}
  </div>
</div>
```

- [ ] **Step 4: Create Settings page**

Create `frontend/src/pages/Settings.svelte`:

```svelte
<script lang="ts">
  import { api } from "../lib/api";
  import { registerPush } from "../lib/push";

  let prefs = $state<Record<string, any>>({});
  let loading = $state(true);
  let saving = $state(false);
  let pushEnabled = $state(false);

  let locationsStr = $state("");
  let keywordsStr = $state("");
  let minYoe = $state(0);
  let maxYoe = $state(2);
  let threshold = $state(50);

  async function load() {
    loading = true;
    try {
      prefs = await api.preferences.get();
      locationsStr = (prefs.locations ?? []).join(", ");
      keywordsStr = (prefs.role_keywords ?? []).join(", ");
      minYoe = Number(prefs.min_yoe ?? 0);
      maxYoe = Number(prefs.max_yoe ?? 2);
      threshold = Number(prefs.notify_threshold ?? 50);
    } finally {
      loading = false;
    }

    if ("Notification" in window) {
      pushEnabled = Notification.permission === "granted";
    }
  }

  async function save() {
    saving = true;
    try {
      await api.preferences.update({
        locations: locationsStr.split(",").map((s) => s.trim()).filter(Boolean),
        role_keywords: keywordsStr.split(",").map((s) => s.trim()).filter(Boolean),
        min_yoe: String(minYoe),
        max_yoe: String(maxYoe),
        notify_threshold: String(threshold),
      });
    } finally {
      saving = false;
    }
  }

  async function enablePush() {
    const success = await registerPush();
    pushEnabled = success;
  }

  $effect(() => {
    load();
  });
</script>

<div class="p-4">
  <h1 class="text-xl font-bold mb-4">Settings</h1>

  {#if loading}
    <div class="flex justify-center py-8">
      <span class="loading loading-spinner loading-md"></span>
    </div>
  {:else}
    <div class="space-y-4">
      <div class="form-control">
        <label class="label" for="locations">
          <span class="label-text">Locations (comma-separated)</span>
        </label>
        <input
          id="locations"
          type="text"
          class="input input-bordered w-full"
          bind:value={locationsStr}
        />
      </div>

      <div class="form-control">
        <label class="label" for="keywords">
          <span class="label-text">Role keywords (comma-separated)</span>
        </label>
        <input
          id="keywords"
          type="text"
          class="input input-bordered w-full"
          bind:value={keywordsStr}
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="form-control">
          <label class="label" for="min-yoe">
            <span class="label-text">Min YOE</span>
          </label>
          <input
            id="min-yoe"
            type="number"
            class="input input-bordered w-full"
            bind:value={minYoe}
            min="0"
            max="20"
          />
        </div>
        <div class="form-control">
          <label class="label" for="max-yoe">
            <span class="label-text">Max YOE</span>
          </label>
          <input
            id="max-yoe"
            type="number"
            class="input input-bordered w-full"
            bind:value={maxYoe}
            min="0"
            max="20"
          />
        </div>
      </div>

      <div class="form-control">
        <label class="label" for="threshold">
          <span class="label-text">Notification threshold (score ≥ {threshold})</span>
        </label>
        <input
          id="threshold"
          type="range"
          class="range range-primary"
          bind:value={threshold}
          min="0"
          max="100"
          step="5"
        />
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">Push Notifications</span>
        </label>
        {#if pushEnabled}
          <div class="badge badge-success">Enabled</div>
        {:else}
          <button class="btn btn-sm btn-outline" onclick={enablePush}>
            Enable Push Notifications
          </button>
        {/if}
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">Poll Interval</span>
        </label>
        <span class="text-sm text-base-content/50">Every 15 minutes</span>
      </div>

      <button
        class="btn btn-primary w-full"
        onclick={save}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Preferences"}
      </button>
    </div>
  {/if}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/
git commit -m "feat: Feed, JobDetail, Companies, and Settings pages"
```

---

## Task 16: Service Worker + Push Registration

**Files:**
- Create: `frontend/public/sw.js`, `frontend/src/lib/push.ts`

- [ ] **Step 1: Create push registration helper**

Create `frontend/src/lib/push.ts`:

```ts
import { api } from "./api";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

export async function registerPush(): Promise<boolean> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    await api.push.subscribe(subscription);
    return true;
  } catch (err) {
    console.error("Push registration failed:", err);
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}
```

- [ ] **Step 2: Create service worker**

Create `frontend/public/sw.js`:

```js
self.addEventListener("push", (event) => {
  let data = { title: "JobRadar", body: "New jobs available", data: { url: "/" } };

  try {
    data = event.data.json();
  } catch (e) {
    // Use defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: data.data,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.navigate(self.location.origin + "/#" + url);
            return;
          }
        }
        return clients.openWindow(self.location.origin + "/#" + url);
      })
  );
});
```

- [ ] **Step 3: Commit**

```bash
git add frontend/public/sw.js frontend/src/lib/push.ts
git commit -m "feat: service worker for push notifications and click handling"
```

---

## Task 17: PWA Manifest + Icons

**Files:**
- Create: `frontend/public/manifest.json`, `frontend/public/icons/icon-192.png`, `frontend/public/icons/icon-512.png`

- [ ] **Step 1: Create manifest.json**

Create `frontend/public/manifest.json`:

```json
{
  "name": "JobRadar",
  "short_name": "JobRadar",
  "description": "Personal job alert system for top tech companies",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1d232a",
  "theme_color": "#1d232a",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons**

```bash
# Generate simple placeholder icons using ImageMagick (or replace with real icons later)
# If ImageMagick is available:
convert -size 192x192 xc:#6419e6 -fill white -gravity center -pointsize 72 -annotate 0 "JR" frontend/public/icons/icon-192.png
convert -size 512x512 xc:#6419e6 -fill white -gravity center -pointsize 192 -annotate 0 "JR" frontend/public/icons/icon-512.png
```

If ImageMagick isn't available, create minimal 1x1 PNGs as placeholders and replace with real icons before deploy.

- [ ] **Step 3: Commit**

```bash
git add frontend/public/manifest.json frontend/public/icons/
git commit -m "feat: PWA manifest and placeholder icons"
```

---

## Task 18: Seed Data

**Files:**
- Create: `seed/companies.json`, `scripts/seed-db.ts`

- [ ] **Step 1: Create the company seed data**

Create `seed/companies.json`:

```json
[
  {"name": "Anthropic", "ats_type": "greenhouse", "ats_slug": "anthropic", "website": "https://anthropic.com"},
  {"name": "OpenAI", "ats_type": "greenhouse", "ats_slug": "openai", "website": "https://openai.com"},
  {"name": "DeepMind", "ats_type": "greenhouse", "ats_slug": "deepmind", "website": "https://deepmind.google"},
  {"name": "Cohere", "ats_type": "greenhouse", "ats_slug": "cohere", "website": "https://cohere.com"},
  {"name": "Mistral AI", "ats_type": "greenhouse", "ats_slug": "mistralai", "website": "https://mistral.ai"},
  {"name": "xAI", "ats_type": "greenhouse", "ats_slug": "xai", "website": "https://x.ai"},
  {"name": "Adept", "ats_type": "greenhouse", "ats_slug": "adept", "website": "https://adept.ai"},
  {"name": "Character.ai", "ats_type": "greenhouse", "ats_slug": "character", "website": "https://character.ai"},
  {"name": "Inflection AI", "ats_type": "greenhouse", "ats_slug": "inflectionai", "website": "https://inflection.ai"},
  {"name": "Scale AI", "ats_type": "greenhouse", "ats_slug": "scaleai", "website": "https://scale.com"},
  {"name": "Weights & Biases", "ats_type": "greenhouse", "ats_slug": "wandb", "website": "https://wandb.ai"},
  {"name": "Hugging Face", "ats_type": "greenhouse", "ats_slug": "huggingface", "website": "https://huggingface.co"},
  {"name": "Cursor", "ats_type": "ashby", "ats_slug": "cursor", "website": "https://cursor.com"},
  {"name": "Perplexity", "ats_type": "ashby", "ats_slug": "perplexity", "website": "https://perplexity.ai"},
  {"name": "Replit", "ats_type": "greenhouse", "ats_slug": "replit", "website": "https://replit.com"},
  {"name": "Vercel", "ats_type": "greenhouse", "ats_slug": "vercel", "website": "https://vercel.com"},
  {"name": "Stripe", "ats_type": "greenhouse", "ats_slug": "stripe", "website": "https://stripe.com"},
  {"name": "Airbnb", "ats_type": "greenhouse", "ats_slug": "airbnb", "website": "https://airbnb.com"},
  {"name": "Figma", "ats_type": "greenhouse", "ats_slug": "figma", "website": "https://figma.com"},
  {"name": "Linear", "ats_type": "greenhouse", "ats_slug": "linear", "website": "https://linear.app"},
  {"name": "Notion", "ats_type": "greenhouse", "ats_slug": "notion", "website": "https://notion.so"},
  {"name": "Brex", "ats_type": "greenhouse", "ats_slug": "brex", "website": "https://brex.com"},
  {"name": "Plaid", "ats_type": "greenhouse", "ats_slug": "plaid", "website": "https://plaid.com"},
  {"name": "Ramp", "ats_type": "greenhouse", "ats_slug": "ramp", "website": "https://ramp.com"},
  {"name": "Rippling", "ats_type": "greenhouse", "ats_slug": "rippling", "website": "https://rippling.com"},
  {"name": "Robinhood", "ats_type": "lever", "ats_slug": "robinhood", "website": "https://robinhood.com"},
  {"name": "Coinbase", "ats_type": "greenhouse", "ats_slug": "coinbase", "website": "https://coinbase.com"},
  {"name": "Mercury", "ats_type": "greenhouse", "ats_slug": "mercury", "website": "https://mercury.com"},
  {"name": "Affirm", "ats_type": "greenhouse", "ats_slug": "affirm", "website": "https://affirm.com"},
  {"name": "Supabase", "ats_type": "ashby", "ats_slug": "supabase", "website": "https://supabase.com"},
  {"name": "Railway", "ats_type": "ashby", "ats_slug": "railway", "website": "https://railway.app"},
  {"name": "PlanetScale", "ats_type": "greenhouse", "ats_slug": "planetscale", "website": "https://planetscale.com"},
  {"name": "Snowflake", "ats_type": "greenhouse", "ats_slug": "snowflake", "website": "https://snowflake.com"},
  {"name": "Databricks", "ats_type": "greenhouse", "ats_slug": "databricks", "website": "https://databricks.com"},
  {"name": "Cloudflare", "ats_type": "greenhouse", "ats_slug": "cloudflare", "website": "https://cloudflare.com"},
  {"name": "Datadog", "ats_type": "greenhouse", "ats_slug": "datadog", "website": "https://datadoghq.com"},
  {"name": "HashiCorp", "ats_type": "greenhouse", "ats_slug": "hashicorp", "website": "https://hashicorp.com"},
  {"name": "Retool", "ats_type": "greenhouse", "ats_slug": "retool", "website": "https://retool.com"},
  {"name": "Temporal", "ats_type": "greenhouse", "ats_slug": "temporal", "website": "https://temporal.io"},
  {"name": "Resend", "ats_type": "ashby", "ats_slug": "resend", "website": "https://resend.com"},
  {"name": "Clerk", "ats_type": "ashby", "ats_slug": "clerk", "website": "https://clerk.com"},
  {"name": "Neon", "ats_type": "ashby", "ats_slug": "neon", "website": "https://neon.tech"},
  {"name": "Turso", "ats_type": "ashby", "ats_slug": "turso", "website": "https://turso.tech"},
  {"name": "Convex", "ats_type": "ashby", "ats_slug": "convex", "website": "https://convex.dev"},
  {"name": "Palantir", "ats_type": "greenhouse", "ats_slug": "palantir", "website": "https://palantir.com"},
  {"name": "Bloomberg", "ats_type": "custom", "ats_slug": "bloomberg", "website": "https://bloomberg.com/careers"},
  {"name": "Two Sigma", "ats_type": "greenhouse", "ats_slug": "twosigma", "website": "https://twosigma.com"},
  {"name": "Citadel", "ats_type": "custom", "ats_slug": "citadel", "website": "https://citadel.com/careers"},
  {"name": "Jane Street", "ats_type": "greenhouse", "ats_slug": "janestreet", "website": "https://janestreet.com"},
  {"name": "Hudson River Trading", "ats_type": "greenhouse", "ats_slug": "hudsonrivertrading", "website": "https://hudsonrivertrading.com"},
  {"name": "DE Shaw", "ats_type": "custom", "ats_slug": "deshaw", "website": "https://deshaw.com/careers"},
  {"name": "Google", "ats_type": "custom", "ats_slug": "google", "website": "https://careers.google.com"},
  {"name": "Apple", "ats_type": "custom", "ats_slug": "apple", "website": "https://jobs.apple.com"},
  {"name": "Amazon", "ats_type": "custom", "ats_slug": "amazon", "website": "https://amazon.jobs"},
  {"name": "Meta", "ats_type": "custom", "ats_slug": "meta", "website": "https://metacareers.com"},
  {"name": "Netflix", "ats_type": "custom", "ats_slug": "netflix", "website": "https://jobs.netflix.com"},
  {"name": "Microsoft", "ats_type": "custom", "ats_slug": "microsoft", "website": "https://careers.microsoft.com"},
  {"name": "Spotify", "ats_type": "greenhouse", "ats_slug": "spotify", "website": "https://spotify.com"},
  {"name": "Discord", "ats_type": "greenhouse", "ats_slug": "discord", "website": "https://discord.com"},
  {"name": "Slack", "ats_type": "custom", "ats_slug": "slack", "website": "https://slack.com/careers"},
  {"name": "Twitch", "ats_type": "greenhouse", "ats_slug": "twitch", "website": "https://twitch.tv"},
  {"name": "Reddit", "ats_type": "greenhouse", "ats_slug": "reddit", "website": "https://reddit.com"},
  {"name": "Pinterest", "ats_type": "greenhouse", "ats_slug": "pinterest", "website": "https://pinterest.com"},
  {"name": "Snap", "ats_type": "greenhouse", "ats_slug": "snap", "website": "https://snap.com"},
  {"name": "Uber", "ats_type": "greenhouse", "ats_slug": "uber", "website": "https://uber.com"},
  {"name": "Lyft", "ats_type": "greenhouse", "ats_slug": "lyft", "website": "https://lyft.com"},
  {"name": "DoorDash", "ats_type": "greenhouse", "ats_slug": "doordash", "website": "https://doordash.com"},
  {"name": "Instacart", "ats_type": "greenhouse", "ats_slug": "instacart", "website": "https://instacart.com"},
  {"name": "Block (Square)", "ats_type": "greenhouse", "ats_slug": "block", "website": "https://block.xyz"},
  {"name": "Shopify", "ats_type": "greenhouse", "ats_slug": "shopify", "website": "https://shopify.com"},
  {"name": "Atlassian", "ats_type": "custom", "ats_slug": "atlassian", "website": "https://atlassian.com/company/careers"},
  {"name": "Twilio", "ats_type": "greenhouse", "ats_slug": "twilio", "website": "https://twilio.com"},
  {"name": "Okta", "ats_type": "greenhouse", "ats_slug": "okta", "website": "https://okta.com"},
  {"name": "CrowdStrike", "ats_type": "greenhouse", "ats_slug": "crowdstrike", "website": "https://crowdstrike.com"},
  {"name": "Palo Alto Networks", "ats_type": "greenhouse", "ats_slug": "paloaltonetworks", "website": "https://paloaltonetworks.com"},
  {"name": "Zscaler", "ats_type": "greenhouse", "ats_slug": "zscaler", "website": "https://zscaler.com"},
  {"name": "Wiz", "ats_type": "greenhouse", "ats_slug": "wiz", "website": "https://wiz.io"},
  {"name": "Anduril", "ats_type": "greenhouse", "ats_slug": "anduril", "website": "https://anduril.com"},
  {"name": "SpaceX", "ats_type": "greenhouse", "ats_slug": "spacex", "website": "https://spacex.com"},
  {"name": "Rivian", "ats_type": "greenhouse", "ats_slug": "rivian", "website": "https://rivian.com"},
  {"name": "Waymo", "ats_type": "greenhouse", "ats_slug": "waymo", "website": "https://waymo.com"},
  {"name": "Cruise", "ats_type": "greenhouse", "ats_slug": "cruise", "website": "https://getcruise.com"},
  {"name": "Nuro", "ats_type": "greenhouse", "ats_slug": "nuro", "website": "https://nuro.ai"},
  {"name": "Verkada", "ats_type": "greenhouse", "ats_slug": "verkada", "website": "https://verkada.com"},
  {"name": "Flexport", "ats_type": "greenhouse", "ats_slug": "flexport", "website": "https://flexport.com"},
  {"name": "Airtable", "ats_type": "greenhouse", "ats_slug": "airtable", "website": "https://airtable.com"},
  {"name": "Asana", "ats_type": "greenhouse", "ats_slug": "asana", "website": "https://asana.com"},
  {"name": "Monday.com", "ats_type": "greenhouse", "ats_slug": "mondaycom", "website": "https://monday.com"},
  {"name": "Canva", "ats_type": "greenhouse", "ats_slug": "canva", "website": "https://canva.com"},
  {"name": "Miro", "ats_type": "greenhouse", "ats_slug": "miro", "website": "https://miro.com"},
  {"name": "Loom", "ats_type": "greenhouse", "ats_slug": "loom", "website": "https://loom.com"},
  {"name": "GitLab", "ats_type": "greenhouse", "ats_slug": "gitlab", "website": "https://gitlab.com"},
  {"name": "GitHub", "ats_type": "custom", "ats_slug": "github", "website": "https://github.com/about/careers"},
  {"name": "Sourcegraph", "ats_type": "greenhouse", "ats_slug": "sourcegraph", "website": "https://sourcegraph.com"},
  {"name": "Grafana Labs", "ats_type": "greenhouse", "ats_slug": "grafanalabs", "website": "https://grafana.com"},
  {"name": "Elastic", "ats_type": "greenhouse", "ats_slug": "elastic", "website": "https://elastic.co"},
  {"name": "Confluent", "ats_type": "greenhouse", "ats_slug": "confluent", "website": "https://confluent.io"},
  {"name": "MongoDB", "ats_type": "greenhouse", "ats_slug": "mongodb", "website": "https://mongodb.com"},
  {"name": "Cockroach Labs", "ats_type": "greenhouse", "ats_slug": "cockroachlabs", "website": "https://cockroachlabs.com"},
  {"name": "Fly.io", "ats_type": "lever", "ats_slug": "fly-io", "website": "https://fly.io"},
  {"name": "Deno", "ats_type": "lever", "ats_slug": "deno", "website": "https://deno.com"},
  {"name": "Tailscale", "ats_type": "lever", "ats_slug": "tailscale", "website": "https://tailscale.com"},
  {"name": "1Password", "ats_type": "greenhouse", "ats_slug": "1password", "website": "https://1password.com"},
  {"name": "Zapier", "ats_type": "greenhouse", "ats_slug": "zapier", "website": "https://zapier.com"},
  {"name": "Webflow", "ats_type": "greenhouse", "ats_slug": "webflow", "website": "https://webflow.com"},
  {"name": "Sanity", "ats_type": "ashby", "ats_slug": "sanity", "website": "https://sanity.io"},
  {"name": "PostHog", "ats_type": "ashby", "ats_slug": "posthog", "website": "https://posthog.com"},
  {"name": "Sentry", "ats_type": "greenhouse", "ats_slug": "sentry", "website": "https://sentry.io"},
  {"name": "LaunchDarkly", "ats_type": "greenhouse", "ats_slug": "launchdarkly", "website": "https://launchdarkly.com"},
  {"name": "Segment", "ats_type": "greenhouse", "ats_slug": "segment", "website": "https://segment.com"},
  {"name": "Amplitude", "ats_type": "greenhouse", "ats_slug": "amplitude", "website": "https://amplitude.com"},
  {"name": "Lattice", "ats_type": "greenhouse", "ats_slug": "lattice", "website": "https://lattice.com"},
  {"name": "Gusto", "ats_type": "greenhouse", "ats_slug": "gusto", "website": "https://gusto.com"},
  {"name": "Toast", "ats_type": "greenhouse", "ats_slug": "toast", "website": "https://pos.toasttab.com"},
  {"name": "Chime", "ats_type": "greenhouse", "ats_slug": "chime", "website": "https://chime.com"},
  {"name": "SoFi", "ats_type": "greenhouse", "ats_slug": "sofi", "website": "https://sofi.com"},
  {"name": "Marqeta", "ats_type": "greenhouse", "ats_slug": "marqeta", "website": "https://marqeta.com"},
  {"name": "Faire", "ats_type": "greenhouse", "ats_slug": "faire", "website": "https://faire.com"},
  {"name": "Coda", "ats_type": "greenhouse", "ats_slug": "coda", "website": "https://coda.io"},
  {"name": "Sigma Computing", "ats_type": "greenhouse", "ats_slug": "sigmacomputing", "website": "https://sigmacomputing.com"},
  {"name": "Hex", "ats_type": "ashby", "ats_slug": "hex", "website": "https://hex.tech"},
  {"name": "Dbt Labs", "ats_type": "greenhouse", "ats_slug": "dbtlabs", "website": "https://getdbt.com"},
  {"name": "Fivetran", "ats_type": "greenhouse", "ats_slug": "fivetran", "website": "https://fivetran.com"},
  {"name": "Stytch", "ats_type": "ashby", "ats_slug": "stytch", "website": "https://stytch.com"},
  {"name": "WorkOS", "ats_type": "ashby", "ats_slug": "workos", "website": "https://workos.com"},
  {"name": "Liveblocks", "ats_type": "ashby", "ats_slug": "liveblocks", "website": "https://liveblocks.io"},
  {"name": "Inngest", "ats_type": "ashby", "ats_slug": "inngest", "website": "https://inngest.com"},
  {"name": "Axiom", "ats_type": "ashby", "ats_slug": "axiom", "website": "https://axiom.co"},
  {"name": "Tinybird", "ats_type": "ashby", "ats_slug": "tinybird", "website": "https://tinybird.co"},
  {"name": "Val Town", "ats_type": "ashby", "ats_slug": "valtown", "website": "https://val.town"},
  {"name": "Oxla", "ats_type": "ashby", "ats_slug": "oxla", "website": "https://oxla.com"},
  {"name": "Warp", "ats_type": "greenhouse", "ats_slug": "warp", "website": "https://warp.dev"},
  {"name": "Pieces", "ats_type": "greenhouse", "ats_slug": "pieces", "website": "https://pieces.app"},
  {"name": "Render", "ats_type": "lever", "ats_slug": "render", "website": "https://render.com"},
  {"name": "Doppler", "ats_type": "lever", "ats_slug": "doppler", "website": "https://doppler.com"}
]
```

- [ ] **Step 2: Create seed script**

Create `scripts/seed-db.ts`:

```ts
import companies from "../seed/companies.json";

async function seed() {
  const values = companies
    .map((c) => {
      const id = crypto.randomUUID();
      const enabled = c.ats_type === "custom" ? 0 : 1;
      return `('${id}', '${c.name.replace(/'/g, "''")}', '${c.ats_type}', '${c.ats_slug}', '${c.website}', ${enabled})`;
    })
    .join(",\n  ");

  const sql = `INSERT OR IGNORE INTO companies (id, name, ats_type, ats_slug, website, enabled) VALUES\n  ${values};`;

  console.log(sql);
}

seed();
```

- [ ] **Step 3: Generate and apply seed SQL**

```bash
npx tsx scripts/seed-db.ts > migrations/0002_seed_companies.sql
npx wrangler d1 execute jobradar --local --file=migrations/0002_seed_companies.sql
```

- [ ] **Step 4: Verify seed data**

```bash
npx wrangler d1 execute jobradar --local --command="SELECT COUNT(*) as count FROM companies"
```

Expected: count matches the number of companies in the JSON file.

- [ ] **Step 5: Commit**

```bash
git add seed/companies.json scripts/seed-db.ts migrations/0002_seed_companies.sql
git commit -m "feat: seed data with ~120 curated company entries"
```

---

## Task 19: Deployment

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Create D1 database on Cloudflare**

```bash
npx wrangler d1 create jobradar
```

Copy the `database_id` from the output and update `wrangler.toml`.

- [ ] **Step 2: Generate and set VAPID keys**

```bash
npx tsx scripts/generate-vapid-keys.ts
```

Use the output to set secrets:

```bash
echo "<public-key>" | npx wrangler secret put VAPID_PUBLIC_KEY
echo "<private-key>" | npx wrangler secret put VAPID_PRIVATE_KEY
```

Also create `frontend/.env` with:

```
VITE_VAPID_PUBLIC_KEY=<public-key>
```

- [ ] **Step 3: Run remote migrations**

```bash
npx wrangler d1 execute jobradar --remote --file=migrations/0001_initial.sql
npx wrangler d1 execute jobradar --remote --file=migrations/0002_seed_companies.sql
```

- [ ] **Step 4: Build frontend**

```bash
cd frontend && npm run build && cd ..
```

- [ ] **Step 5: Deploy**

```bash
npx wrangler deploy
```

Expected: Worker deployed with static assets, cron trigger active.

- [ ] **Step 6: Configure Cloudflare Access**

In the Cloudflare dashboard:
1. Go to Zero Trust → Access → Applications
2. Create a self-hosted application for the worker domain
3. Add an Allow policy with email condition: `aliparslan@outlook.com`

- [ ] **Step 7: Verify the deploy**

Open the deployed URL, confirm:
- PWA loads with DaisyUI dark theme
- Companies page shows seeded companies
- Settings page loads preferences
- Add to Home Screen on iOS and enable notifications

- [ ] **Step 8: Commit any deploy config changes**

```bash
git add wrangler.toml frontend/.env
git commit -m "feat: deployment config with D1 binding and VAPID keys"
```
