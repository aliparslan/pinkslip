import { describe, expect, it } from "bun:test";
import { cardFacts, cardTitle } from "../apps/webapp/src/features/job-detail/card-facts";
import { publicHead } from "../apps/webapp/src/features/navigation/seo";

describe("A job's link card", () => {
  it("puts the pay and the place on one line", () => {
    expect(cardFacts({ salary: "$150,000 - $180,000", location: "New York, NY" })).toBe("$150–180K · New York");
    expect(cardFacts({ salary: null, location: "Remote" })).toBe("Remote");
    expect(cardFacts({ salary: null, location: "" })).toBe("");
  });

  it("keeps a title whole, or cuts it at a word", () => {
    expect(cardTitle("Software Engineer, New Grad")).toBe("Software Engineer, New Grad");
    expect(cardTitle("  Software   Engineer  ")).toBe("Software Engineer");
    const long = cardTitle("Software Engineer II (Platform & Infrastructure) – Data Pipelines, Remote");
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(59);
    expect(long).not.toMatch(/[\s,–-]…$/);
  });

  it("points a job page's preview at its card, with Pinkslip's own line", () => {
    const head = publicHead({
      title: "Software Engineer at Ramp · Pinkslip", shareTitle: "Software Engineer at Ramp", description: "Our mission is…",
      shareDescription: "Ramp · $150–180K · New York", path: "/jobs/abc",
      image: { url: "https://pinkslip.work/og/jobs/abc.png", alt: "Software Engineer at Ramp" },
    });
    const meta = Object.fromEntries(head.meta.flatMap((tag) => "property" in tag ? [[tag.property, tag.content]] : "name" in tag ? [[tag.name, tag.content]] : []));
    expect(meta["og:image"]).toBe("https://pinkslip.work/og/jobs/abc.png");
    expect(meta["twitter:image"]).toBe("https://pinkslip.work/og/jobs/abc.png");
    expect(meta["og:description"]).toBe("Ramp · $150–180K · New York");
    // Search keeps the posting's own summary.
    expect(meta.description).toBe("Our mission is…");
  });
});
