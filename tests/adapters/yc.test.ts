import { beforeEach, describe, expect, it, mock } from "bun:test";
import { normalizeYcSource, YcAdapter } from "@worker/adapters/yc";

function htmlEntities(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function response(
  data: unknown,
  structured?: Record<string, unknown>,
  ok = true,
  status = 200
) {
  const jsonLd = structured
    ? `<script type="application/ld+json">${JSON.stringify(structured)}</script>`
    : "";
  const html = `${jsonLd}<div data-page="${htmlEntities(JSON.stringify(data))}"></div>`;
  return { ok, status, text: async () => html };
}

const JOB = {
  id: 92826,
  title: "Site Reliability Engineer",
  url: "/companies/acme/jobs/abc-site-reliability-engineer",
  location: "New York, NY, US / Remote (US)",
  prettyRole: "Engineering",
  roleSpecificType: "Backend",
  salaryRange: "$150K - $200K",
  createdAt: "2 months",
};

describe("YcAdapter", () => {
  beforeEach(() => mock.restore());

  it("normalizes company slugs and URLs", () => {
    expect(normalizeYcSource("acme")).toBe("acme");
    expect(normalizeYcSource("https://www.ycombinator.com/companies/acme/jobs"))
      .toBe("acme");
  });

  it("maps the company jobs payload", async () => {
    const fetchMock = mock()
      .mockResolvedValue(response({ props: { jobPostings: [JOB] } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const jobs = await new YcAdapter().fetchJobs("acme");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.ycombinator.com/companies/acme/jobs",
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(jobs).toEqual([{
      externalId: "92826",
      title: "Site Reliability Engineer",
      url: "https://www.ycombinator.com/companies/acme/jobs/abc-site-reliability-engineer",
      location: "New York, NY, US / Remote (US)",
      department: "Engineering",
      postedAt: null,
      description: null,
      salary: "$150K - $200K",
    }]);
  });

  it("retrieves the structured detail description", async () => {
    globalThis.fetch = mock().mockResolvedValue(response({
      props: {
        job: {
          ...JOB,
          description: "Build reliable systems. Compensation $150,000 - $200,000.",
        },
      },
    }, {
      "@type": "JobPosting",
      description: "<p>Build reliable systems.</p><p>Compensation $150,000 - $200,000.</p>",
      datePosted: "2026-04-06T21:13:05Z",
    })) as unknown as typeof fetch;

    const content = await new YcAdapter().fetchJobContent(
      "acme",
      "92826",
      "https://www.ycombinator.com/companies/acme/jobs/abc-site-reliability-engineer"
    );

    expect(content.description).toBe(
      "<p>Build reliable systems.</p><p>Compensation $150,000 - $200,000.</p>"
    );
    expect(content.salary).toBe("$150K - $200K");
    expect(content.location).toBe("New York, NY, US / Remote (US)");
    expect(content.postedAt).toBe("2026-04-06T21:13:05Z");
  });
});
