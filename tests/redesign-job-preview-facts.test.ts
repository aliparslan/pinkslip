import { describe, expect, test } from "bun:test";
import { parseJobDescription } from "../packages/core/src/job-description";
import { createEmptyResumeProfile } from "../shared/resume-profile";
import { roleLines, yearsGap } from "../apps/native/src/features/redesign/job-preview-facts";

const DESCRIPTION = `<p>Stripe builds the economic infrastructure of the internet.</p>
<p><strong>What you'll do</strong></p>
<ul><li>Build and ship the APIs businesses use to move money.</li><li>Pair with engineers across payments and risk.</li></ul>
<p><strong>Who you are</strong></p>
<ul><li>You write Go or Java and have 2+ years of experience building backend systems at scale, ideally in payments or another regulated industry</li></ul>`;

const withJobs = (...starts: string[]) => ({
  ...createEmptyResumeProfile(),
  experience: starts.map((startDate, index) => ({ id: `x${index}`, company: "Acme", title: "Engineer", location: "", startDate, endDate: "Present", bullets: [] })),
});

describe("the long-press preview's role lines", () => {
  const blocks = parseJobDescription(DESCRIPTION);
  const now = new Date("2026-11-04T00:00:00Z");

  test("take a line from what you'd do and from what it asks, cut to a glance", () => {
    const lines = roleLines(blocks, null, 2);
    expect(lines.does).toBe("Build and ship the APIs businesses use to move money.");
    expect(lines.asks).toBe("You write Go or Java and have 2+ years of experience building backend systems at scale, ideally in payments…");
  });

  test("say the years gap only when the job asks for more than the resume shows", () => {
    // May 2024 to now is two and a half years: enough for 2+.
    expect(yearsGap(2, withJobs("Aug 2025", "May 2024"), now)).toBeNull();
    expect(yearsGap(3, withJobs("Aug 2025", "May 2024"), now)).toBe("you have about 2");
    expect(yearsGap(2, withJobs("Aug 2025"), now)).toBe("you have about 1");
    expect(yearsGap(1, withJobs("Aug 2026"), now)).toBe("you have under 1");
    expect(yearsGap(null, withJobs("Aug 2025"), now)).toBeNull();
    expect(yearsGap(2, createEmptyResumeProfile(), now)).toBeNull();
    expect(roleLines([], "you have about 1", 2)).toEqual({ does: null, asks: "Asks for 2+ years · you have about 1" });
  });

  test("leave a description without those sections to the ticket", () => {
    expect(roleLines(parseJobDescription("<p>We are hiring.</p>"), null, null)).toEqual({ does: null, asks: null });
  });
});
