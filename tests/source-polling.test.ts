import { describe, expect, it } from "bun:test";
import {
  claimDueSources,
  dispatchDueSources,
  dispatchLimitPerTick,
  handleSourcePollBatch,
  pollQueuedSource,
  SOURCE_DISPATCH_CRON_SCHEDULE,
  SOURCE_POLL_CLAIM_TTL_MS,
  type SourcePollDependencies,
  type SourcePollMessage,
} from "@worker/source-polling";
import { queuedPollingTiers } from "@worker/poll-schedule";
import { QUARANTINE_AFTER_FAILURES, type NewJobMeta } from "@worker/poller";
import { scheduledCycle } from "@worker/index";
import type { Env } from "@worker/types";
import { sqliteD1 } from "./sqlite-d1";

const NOW = new Date("2026-10-04T12:00:00.000Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();

const queuePollingMigration = await Bun.file(
  new URL("../migrations/0081_queue_source_polling.sql", import.meta.url)
).text();

function pollingDb() {
  const harness = sqliteD1();
  harness.sqlite.run(`
    CREATE TABLE companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ats_type TEXT NOT NULL,
      source_type TEXT,
      ats_slug TEXT NOT NULL,
      website TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      added_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      last_poll_status TEXT,
      last_poll_error TEXT,
      last_polled_at TEXT,
      poll_failure_count INTEGER NOT NULL DEFAULT 0,
      quarantined_at TEXT,
      poll_tier INTEGER NOT NULL DEFAULT 1
    )
  `);
  harness.sqlite.exec(queuePollingMigration);
  return harness;
}

function addCompany(
  sqlite: ReturnType<typeof sqliteD1>["sqlite"],
  id: string,
  values: {
    tier?: number;
    lastPolledAt?: string | null;
    claimedAt?: string | null;
    quarantinedAt?: string | null;
    enabled?: number;
    sourceType?: string;
    failures?: number;
  } = {}
) {
  sqlite.query(
    `INSERT INTO companies (
       id, name, ats_type, source_type, ats_slug, enabled, last_polled_at,
       poll_claimed_at, quarantined_at, poll_tier, poll_failure_count
     ) VALUES (?, ?, 'greenhouse', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    `Company ${id}`,
    values.sourceType ?? "greenhouse",
    id,
    values.enabled ?? 1,
    values.lastPolledAt ?? null,
    values.claimedAt ?? null,
    values.quarantinedAt ?? null,
    values.tier ?? 1,
    values.failures ?? 0
  );
}

function fakeQueue() {
  const sent: SourcePollMessage[] = [];
  let failNext = false;
  return {
    sent,
    failOnce() {
      failNext = true;
    },
    queue: {
      async sendBatch(messages: Iterable<MessageSendRequest<SourcePollMessage>>) {
        if (failNext) {
          failNext = false;
          throw new Error("queue unavailable");
        }
        for (const message of messages) sent.push(message.body);
      },
    } as unknown as Queue<SourcePollMessage>,
  };
}

describe("queuedPollingTiers", () => {
  it("parses tier lists and ignores unknown values", () => {
    expect([...queuedPollingTiers(undefined)]).toEqual([]);
    expect([...queuedPollingTiers("")]).toEqual([]);
    expect([...queuedPollingTiers("2")]).toEqual([2]);
    expect([...queuedPollingTiers(" 1, 2 ,3,x")]).toEqual([1, 2]);
  });
});

describe("scheduledCycle", () => {
  it("routes the every-minute cron to the source dispatcher", () => {
    expect(scheduledCycle(SOURCE_DISPATCH_CRON_SCHEDULE)).toBe("dispatch");
  });
});

describe("claimDueSources", () => {
  it("claims tier 1 sources once their 15-minute cadence has elapsed", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "never", { lastPolledAt: null });
    addCompany(sqlite, "due", { lastPolledAt: minutesAgo(15) });
    // One dispatcher tick early, so cadence never drifts past 15 minutes.
    addCompany(sqlite, "next-tick", { lastPolledAt: minutesAgo(14.5) });
    addCompany(sqlite, "fresh", { lastPolledAt: minutesAgo(5) });
    addCompany(sqlite, "tier-two", { tier: 2, lastPolledAt: minutesAgo(30) });
    addCompany(sqlite, "disabled", { enabled: 0 });
    addCompany(sqlite, "custom", { sourceType: "custom" });

    const claimed = await claimDueSources(db, 1, NOW);

    expect(claimed.map((row) => row.id).sort()).toEqual(["due", "never", "next-tick"]);
    expect(claimed.every((row) => row.poll_claimed_at === NOW.toISOString())).toBe(true);
  });

  it("polls tier 2 hourly", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "recent", { tier: 2, lastPolledAt: minutesAgo(30) });
    addCompany(sqlite, "hour", { tier: 2, lastPolledAt: minutesAgo(60) });

    const claimed = await claimDueSources(db, 2, NOW);

    expect(claimed.map((row) => row.id)).toEqual(["hour"]);
  });

  it("never hands the same source to two overlapping ticks", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "a", { lastPolledAt: minutesAgo(20) });

    expect(await claimDueSources(db, 1, NOW)).toHaveLength(1);
    expect(await claimDueSources(db, 1, new Date(NOW.getTime() + 60_000))).toHaveLength(0);
  });

  it("reclaims a source whose poll died without reporting back", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "lost", {
      lastPolledAt: minutesAgo(60),
      claimedAt: new Date(NOW.getTime() - SOURCE_POLL_CLAIM_TTL_MS - 1000).toISOString(),
    });
    addCompany(sqlite, "running", {
      lastPolledAt: minutesAgo(60),
      claimedAt: minutesAgo(5),
    });

    const claimed = await claimDueSources(db, 1, NOW);

    expect(claimed.map((row) => row.id)).toEqual(["lost"]);
  });

  it("keeps quarantined sources on the daily retry backoff", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "quarantined-recent", {
      lastPolledAt: minutesAgo(60),
      quarantinedAt: minutesAgo(600),
    });
    addCompany(sqlite, "quarantined-day", {
      lastPolledAt: minutesAgo(25 * 60),
      quarantinedAt: minutesAgo(48 * 60),
    });

    const claimed = await claimDueSources(db, 1, NOW);

    expect(claimed.map((row) => row.id)).toEqual(["quarantined-day"]);
  });

  it("spreads a cold start across ticks, oldest first", async () => {
    const { sqlite, db } = pollingDb();
    for (let index = 0; index < 5; index += 1) {
      addCompany(sqlite, `c${index}`, { lastPolledAt: minutesAgo(100 - index) });
    }

    const claimed = await claimDueSources(db, 1, NOW, 2);

    expect(claimed.map((row) => row.id)).toEqual(["c0", "c1"]);
  });
});

describe("dispatchLimitPerTick", () => {
  it("keeps twice the steady-state rate, with a floor for small tiers", () => {
    // 316 tier-1 sources every 15 minutes need ~21 polls a minute.
    expect(dispatchLimitPerTick(1, 316)).toBe(43);
    // ~800 hourly long-tail sources need ~14 a minute.
    expect(dispatchLimitPerTick(2, 799)).toBe(27);
    expect(dispatchLimitPerTick(1, 12)).toBe(10);
  });
});

describe("dispatchDueSources", () => {
  it("sends only queued tiers to their own queues", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "big", { tier: 1, lastPolledAt: minutesAgo(20) });
    addCompany(sqlite, "yc", { tier: 2, lastPolledAt: minutesAgo(90) });
    const priority = fakeQueue();
    const tail = fakeQueue();

    const result = await dispatchDueSources({
      DB: db,
      QUEUE_POLLING_TIERS: "2",
      SOURCE_POLL_PRIORITY_QUEUE: priority.queue,
      SOURCE_POLL_QUEUE: tail.queue,
    } as Env, NOW);

    expect(result).toEqual([{ tier: 2, dispatched: 1 }]);
    expect(priority.sent).toEqual([]);
    expect(tail.sent).toEqual([
      { companyId: "yc", tier: 2, claimedAt: NOW.toISOString() },
    ]);
  });

  it("does nothing while every tier stays on the cron cycle", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "big", { lastPolledAt: null });

    expect(await dispatchDueSources({ DB: db, QUEUE_POLLING_TIERS: "" } as Env, NOW)).toEqual([]);
    expect(sqlite.query("SELECT poll_claimed_at FROM companies").get()).toEqual({
      poll_claimed_at: null,
    });
  });

  it("releases claims when the queue rejects the batch", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "big", { lastPolledAt: minutesAgo(20) });
    const priority = fakeQueue();
    priority.failOnce();
    const env = {
      DB: db,
      QUEUE_POLLING_TIERS: "1",
      SOURCE_POLL_PRIORITY_QUEUE: priority.queue,
    } as Env;

    await expect(dispatchDueSources(env, NOW)).rejects.toThrow("queue unavailable");
    expect(sqlite.query("SELECT poll_claimed_at FROM companies").get()).toEqual({
      poll_claimed_at: null,
    });

    await dispatchDueSources(env, new Date(NOW.getTime() + 60_000));
    expect(priority.sent.map((message) => message.companyId)).toEqual(["big"]);
  });

  it("fails loudly when a queued tier has no binding", async () => {
    const { db } = pollingDb();
    await expect(
      dispatchDueSources({ DB: db, QUEUE_POLLING_TIERS: "1" } as Env, NOW)
    ).rejects.toThrow("queue binding is missing");
  });
});

describe("pollQueuedSource", () => {
  const job = (id: string): NewJobMeta => ({
    company: "Company a",
    title: "Software Engineer",
    jobId: id,
    listing: {
      externalId: id,
      title: "Software Engineer",
      url: `https://example.com/${id}`,
      location: "Remote",
      department: null,
      postedAt: null,
      description: null,
      salary: null,
    },
  });

  function dependencies(
    poll: SourcePollDependencies["poll"],
    calls: { notified: number[]; quarantineAlerts: string[] } = { notified: [], quarantineAlerts: [] }
  ): SourcePollDependencies {
    return {
      poll,
      loadCustomTitles: async () => [],
      decisionRecorder: async () => async () => undefined,
      notifyAdmins: async (_db, _env, sources) => {
        calls.quarantineAlerts.push(...sources.map((source) => source.name));
        return 1;
      },
      onNewJobs: async (_env, count) => {
        calls.notified.push(count);
      },
    };
  }

  const clock = () => {
    let tick = 0;
    return () => new Date(NOW.getTime() + 1000 * tick++);
  };

  it("records a successful poll, releases the claim, and triggers notifications", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "a", {
      lastPolledAt: minutesAgo(15),
      claimedAt: NOW.toISOString(),
      failures: 1,
    });
    const calls = { notified: [] as number[], quarantineAlerts: [] as string[] };

    let receivedRecorder = false;
    const result = await pollQueuedSource(
      { DB: db, QUEUE_POLLING_TIERS: "1" } as Env,
      { companyId: "a", tier: 1, claimedAt: NOW.toISOString() },
      dependencies(async (_company, _db, _titles, options) => {
        receivedRecorder = typeof options?.recordDecisions === "function";
        return [job("j1"), job("j2")];
      }, calls),
      clock()
    );
    expect(receivedRecorder).toBe(true);

    expect(result).toEqual({ status: "polled", newJobs: 2, error: null });
    expect(calls.notified).toEqual([2]);
    expect(sqlite.query(
      "SELECT last_poll_status, last_polled_at, poll_failure_count, poll_claimed_at FROM companies"
    ).get()).toEqual({
      last_poll_status: "ok",
      last_polled_at: NOW.toISOString(),
      poll_failure_count: 0,
      poll_claimed_at: null,
    });
    expect(sqlite.query(
      "SELECT company_id, poll_tier, mode, status, previous_polled_at, started_at, new_jobs FROM source_polls"
    ).get()).toEqual({
      company_id: "a",
      poll_tier: 1,
      mode: "queue",
      status: "ok",
      previous_polled_at: minutesAgo(15),
      started_at: NOW.toISOString(),
      new_jobs: 2,
    });
  });

  it("records adapter failures through quarantine instead of retrying the message", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "a", {
      claimedAt: NOW.toISOString(),
      failures: QUARANTINE_AFTER_FAILURES - 1,
    });
    const calls = { notified: [] as number[], quarantineAlerts: [] as string[] };

    const result = await pollQueuedSource(
      { DB: db, QUEUE_POLLING_TIERS: "1" } as Env,
      { companyId: "a", tier: 1, claimedAt: NOW.toISOString() },
      dependencies(async () => {
        throw new Error("HTTP 503");
      }, calls),
      clock()
    );

    expect(result).toEqual({ status: "polled", newJobs: 0, error: "HTTP 503" });
    expect(calls.quarantineAlerts).toEqual(["Company a"]);
    expect(calls.notified).toEqual([]);
    expect(sqlite.query(
      "SELECT last_poll_status, quarantined_at, poll_claimed_at FROM companies"
    ).get()).toEqual({
      last_poll_status: "error",
      quarantined_at: NOW.toISOString(),
      poll_claimed_at: null,
    });
    expect(sqlite.query("SELECT status, error FROM source_polls").get()).toEqual({
      status: "error",
      error: "HTTP 503",
    });
  });

  it("ignores a redelivered or superseded message", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "a", { claimedAt: minutesAgo(1) });
    let polled = false;

    const result = await pollQueuedSource(
      { DB: db, QUEUE_POLLING_TIERS: "1" } as Env,
      { companyId: "a", tier: 1, claimedAt: minutesAgo(30) },
      dependencies(async () => {
        polled = true;
        return [];
      }),
      clock()
    );

    expect(result).toEqual({ status: "skipped", reason: "stale_claim" });
    expect(polled).toBe(false);
  });

  it("releases the claim without polling once the tier moves back to cron", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "a", { claimedAt: NOW.toISOString() });

    const result = await pollQueuedSource(
      { DB: db, QUEUE_POLLING_TIERS: "2" } as Env,
      { companyId: "a", tier: 1, claimedAt: NOW.toISOString() },
      dependencies(async () => {
        throw new Error("should not poll");
      }),
      clock()
    );

    expect(result).toEqual({ status: "skipped", reason: "not_queued" });
    expect(sqlite.query("SELECT poll_claimed_at FROM companies").get()).toEqual({
      poll_claimed_at: null,
    });
  });
});

describe("handleSourcePollBatch", () => {
  it("acknowledges polls and retries only failures to record them", async () => {
    const { sqlite, db } = pollingDb();
    addCompany(sqlite, "ok", { claimedAt: NOW.toISOString() });
    const acked: string[] = [];
    const retried: string[] = [];
    const message = (companyId: string) => ({
      body: { companyId, tier: 1, claimedAt: NOW.toISOString() } as SourcePollMessage,
      ack: () => acked.push(companyId),
      retry: () => retried.push(companyId),
    });
    const brokenDb = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
    } as unknown as D1Database;

    await handleSourcePollBatch(
      { messages: [message("ok")] } as unknown as MessageBatch<SourcePollMessage>,
      { DB: db, QUEUE_POLLING_TIERS: "1" } as Env,
      {
        poll: async () => [],
        loadCustomTitles: async () => [],
        decisionRecorder: async () => async () => undefined,
        notifyAdmins: async () => 0,
        onNewJobs: async () => undefined,
      }
    );
    await handleSourcePollBatch(
      { messages: [message("broken")] } as unknown as MessageBatch<SourcePollMessage>,
      { DB: brokenDb, QUEUE_POLLING_TIERS: "1" } as Env
    );

    expect(acked).toEqual(["ok"]);
    expect(retried).toEqual(["broken"]);
  });
});
