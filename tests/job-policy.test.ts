import { describe, expect, test } from "bun:test";
import {
  isEvergreenPosting,
  isEvergreenTitle,
  isFreshPostedAt,
  keepsPastWindow,
  MAX_POSTED_AGE_DAYS,
  namesUpcomingCohort,
} from "../shared/job-policy";

describe("evergreen postings", () => {
  const now = new Date("2026-07-31T12:00:00.000Z").getTime();
  const aged = "2026-04-01T12:00:00.000Z";
  const recent = "2026-07-28T12:00:00.000Z";

  test("recognises standing-pipeline titles regardless of age", () => {
    expect(isEvergreenTitle("General Interest — Software Engineer")).toBe(true);
    expect(isEvergreenTitle("Talent Community")).toBe(true);
    expect(isEvergreenTitle("Expression of Interest, Research")).toBe(true);
    expect(isEvergreenTitle("Backend Engineer")).toBe(false);
  });

  test("treats an aged posting the board still lists as evergreen", () => {
    expect(isEvergreenPosting("Backend Engineer", aged, true, now)).toBe(true);
  });

  test("does not treat an aged posting the board dropped as evergreen", () => {
    // Removed from the board means filled or withdrawn. That must close rather
    // than become a permanent feed entry.
    expect(isEvergreenPosting("Backend Engineer", aged, false, now)).toBe(false);
  });

  test("leaves ordinary fresh postings alone", () => {
    expect(isEvergreenPosting("Backend Engineer", recent, true, now)).toBe(false);
  });
});

describe("job freshness policy", () => {
  const now = new Date("2026-07-31T12:00:00.000Z").getTime();

  test("keeps day 29 and rejects day 30", () => {
    expect(MAX_POSTED_AGE_DAYS).toBe(29);
    expect(isFreshPostedAt("2026-07-02T12:00:01.000Z", now)).toBe(true);
    expect(isFreshPostedAt("2026-07-01T12:00:00.000Z", now)).toBe(false);
  });

  test("keeps undated jobs but rejects malformed dates", () => {
    expect(isFreshPostedAt(null, now)).toBe(true);
    expect(isFreshPostedAt("not-a-date", now)).toBe(false);
  });
});

describe("namesUpcomingCohort", () => {
  const NOV_2026 = Date.UTC(2026, 10, 8);
  const MAR_2027 = Date.UTC(2027, 2, 1);
  const AUG_2027 = Date.UTC(2027, 7, 1);

  test("recognizes early-career programs for a cohort that hasn't started", () => {
    for (const title of [
      "2027 Intern - Software Engineer",
      "Software Development Engineer Intern - Summer 2027 (USA)",
      "Cybersecurity Software Engineer - New Grad (2027)",
      "2027 University Graduate - Machine Learning Engineer",
      "Software Development Engineer I, Annapurna Labs, Early Career - 2027",
      "Software Engineer - Entry Level 2027",
      "Software Engineer, Applied Emerging Talent (2027)",
    ]) expect(namesUpcomingCohort(title, NOV_2026)).toBe(true);
  });

  test("needs both an early-career word and an upcoming year", () => {
    expect(namesUpcomingCohort("Software Engineer Intern", NOV_2026)).toBe(false);
    expect(namesUpcomingCohort("Solutions Architect, AWSI - 2027", NOV_2026)).toBe(false);
    expect(namesUpcomingCohort("Expression of Interest: 2027 Trading Sneak Peek Weeks", NOV_2026)).toBe(false);
    expect(namesUpcomingCohort("Software Engineer Intern, Summer 2026", NOV_2026)).toBe(false);
  });

  test("lets this year's cohort count only until June", () => {
    expect(namesUpcomingCohort("Software Engineer Intern, Summer 2027", MAR_2027)).toBe(true);
    expect(namesUpcomingCohort("Software Engineer Intern, Summer 2027", AUG_2027)).toBe(false);
  });
});

describe("keepsPastWindow", () => {
  const now = new Date("2026-12-01T12:00:00.000Z").getTime();
  const from = "2026-11-10T00:00:00.000Z";
  const old = { title: "Software Engineer", postedAt: "2026-08-01T00:00:00.000Z" };
  const fresh = { title: "Software Engineer", postedAt: "2026-11-25T00:00:00.000Z" };

  test("is the posting rule alone while switched off", () => {
    expect(keepsPastWindow(old, { evergreen: false, postedAt: "2026-09-01T00:00:00.000Z" }, null, now)).toBe(true);
    expect(keepsPastWindow(fresh, { evergreen: false, postedAt: fresh.postedAt }, null, now)).toBe(false);
  });

  test("keeps a job already hidden before the switch hidden", () => {
    // Stored 30+ days before the switch and not kept: hidden by then.
    expect(keepsPastWindow(old, { evergreen: false, postedAt: "2026-09-01T00:00:00.000Z" }, from, now)).toBe(false);
  });

  test("keeps a job that was already being kept", () => {
    expect(keepsPastWindow(old, { evergreen: true, postedAt: "2026-09-01T00:00:00.000Z" }, from, now)).toBe(true);
  });

  test("keeps a job that was still in the window at the switch", () => {
    // Greenhouse's last edit made it look recent; its real date is old.
    expect(keepsPastWindow(old, { evergreen: false, postedAt: "2026-11-05T00:00:00.000Z" }, from, now)).toBe(true);
    // Its stored date already moved to the real one, and it ages out after the switch.
    expect(keepsPastWindow(
      { title: "Software Engineer", postedAt: "2026-10-20T00:00:00.000Z" },
      { evergreen: false, postedAt: "2026-10-20T00:00:00.000Z" },
      from,
      now
    )).toBe(true);
    expect(keepsPastWindow(old, { evergreen: false, postedAt: null }, from, now)).toBe(true);
  });

  test("never keeps a job that is still fresh, and always keeps a standing pipeline", () => {
    expect(keepsPastWindow(fresh, { evergreen: true, postedAt: fresh.postedAt }, from, now)).toBe(false);
    expect(keepsPastWindow(
      { title: "General Application", postedAt: "2026-08-01T00:00:00.000Z" },
      { evergreen: false, postedAt: "2026-08-01T00:00:00.000Z" },
      from,
      now
    )).toBe(true);
  });
});
