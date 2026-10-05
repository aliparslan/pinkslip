import { describe, expect, it } from "bun:test";
import {
  drainNotificationBacklog,
  handleNotifyBatch,
  NOTIFY_DRAIN_BUDGET_MS,
  requestNotificationRun,
  type NotifyMessage,
} from "@worker/notification-queue";
import { NOTIFICATION_MATCH_BATCH_SIZE } from "@worker/poller";
import type { Env } from "@worker/types";

const env = {} as Env;

function cycles(processed: number[]) {
  let call = 0;
  return async () => ({
    matchesProcessed: processed[call++] ?? 0,
    notificationsSent: 1,
  });
}

describe("drainNotificationBacklog", () => {
  it("runs once when the backlog fits in one matching batch", async () => {
    const result = await drainNotificationBacklog(env, cycles([12]));
    expect(result).toEqual({ matchesProcessed: 12, notificationsSent: 1 });
  });

  it("keeps draining while each cycle fills its batch", async () => {
    const result = await drainNotificationBacklog(
      env,
      cycles([NOTIFICATION_MATCH_BATCH_SIZE, NOTIFICATION_MATCH_BATCH_SIZE, 7])
    );
    expect(result).toEqual({
      matchesProcessed: NOTIFICATION_MATCH_BATCH_SIZE * 2 + 7,
      notificationsSent: 3,
    });
  });

  it("stops at the time budget and leaves the rest to the next trigger or cron", async () => {
    let clock = 0;
    const result = await drainNotificationBacklog(
      env,
      async () => {
        clock += NOTIFY_DRAIN_BUDGET_MS / 2;
        return { matchesProcessed: NOTIFICATION_MATCH_BATCH_SIZE, notificationsSent: 0 };
      },
      () => clock
    );
    expect(result.matchesProcessed).toBe(NOTIFICATION_MATCH_BATCH_SIZE * 2);
  });
});

describe("handleNotifyBatch", () => {
  it("collapses a burst of triggers into one acknowledged run", async () => {
    let runs = 0;
    let acked = false;
    await handleNotifyBatch(
      {
        messages: [{}, {}, {}],
        ackAll: () => {
          acked = true;
        },
      } as unknown as MessageBatch<NotifyMessage>,
      env,
      async () => {
        runs += 1;
        return { matchesProcessed: 3, notificationsSent: 3 };
      }
    );
    expect(runs).toBe(1);
    expect(acked).toBe(true);
  });

  it("lets a failed run propagate so the queue retries the batch", async () => {
    await expect(handleNotifyBatch(
      { messages: [{}], ackAll: () => undefined } as unknown as MessageBatch<NotifyMessage>,
      env,
      async () => {
        throw new Error("D1 unavailable");
      }
    )).rejects.toThrow("D1 unavailable");
  });
});

describe("requestNotificationRun", () => {
  it("is a no-op without the queue binding", async () => {
    await requestNotificationRun(env, 3);
  });

  it("sends one trigger per poll that found jobs", async () => {
    const sent: NotifyMessage[] = [];
    await requestNotificationRun({
      NOTIFY_QUEUE: { send: async (body: NotifyMessage) => void sent.push(body) },
    } as unknown as Env, 4);
    expect(sent).toHaveLength(1);
    expect(sent[0].newJobs).toBe(4);
  });
});
