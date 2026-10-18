import { describe, expect, it } from "bun:test";
import { detectEmailDate } from "@worker/email/dates";
import { detectStage, shouldOpen } from "@worker/email/rules";
import { JOB_EMAILS } from "./fixtures/job-emails";

const ZONE = "America/New_York";

/** What the rules make of one email: opened, the step, the date. */
function read(fixture: (typeof JOB_EMAILS)[number]) {
  const opened = shouldOpen({ from: fixture.email.from, subject: fixture.email.subject }, []);
  const stage = opened ? detectStage(fixture.email) : null;
  const date = stage ? detectEmailDate(fixture.email, stage, ZONE)?.value ?? null : null;
  return { opened, stage, date };
}

describe("detection on real-shaped job emails", () => {
  const results = JOB_EMAILS.map((fixture) => ({ fixture, ...read(fixture) }));

  it("opens hiring mail and leaves job alerts and newsletters from elsewhere unread", () => {
    expect(results.filter((result) => result.opened !== result.fixture.open).map((result) => result.fixture.id)).toEqual([]);
  });

  it("reads the step each email reports, and none from mail that reports none", () => {
    expect(results.filter((result) => result.stage !== result.fixture.stage)
      .map((result) => `${result.fixture.id}: expected ${result.fixture.stage}, read ${result.stage}`)).toEqual([]);
  });

  it("takes the interview time or deadline only when an email states one", () => {
    expect(results.filter((result) => result.stage === result.fixture.stage && (result.date ?? undefined) !== result.fixture.date)
      .map((result) => `${result.fixture.id}: expected ${result.fixture.date}, read ${result.date}`)).toEqual([]);
  });

  if (process.env.MEASURE) {
    it("prints the measurement", () => {
      const byStage = new Map<string, { right: number; total: number }>();
      for (const result of results) {
        const key = result.fixture.stage ?? "none";
        const entry = byStage.get(key) ?? { right: 0, total: 0 };
        entry.total += 1;
        if (result.stage === result.fixture.stage) entry.right += 1;
        byStage.set(key, entry);
      }
      console.log([...byStage].map(([stage, { right, total }]) => `${stage}: ${right}/${total}`).join("\n"));
      for (const result of results) {
        if (result.stage !== result.fixture.stage || (result.date ?? undefined) !== result.fixture.date) {
          console.log(`${result.fixture.id}: stage ${result.stage} (want ${result.fixture.stage}), date ${result.date} (want ${result.fixture.date ?? "none"})`);
        }
      }
    });
  }
});
