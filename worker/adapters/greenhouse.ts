import type { ATSAdapter, JobListing, JobContent } from "./types";
import { extractSalaryFromHtml, formatGreenhouseSalary } from "./salary";
import { fetchWithTimeout } from "../http";

interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  departments: { name: string }[];
  absolute_url: string;
  updated_at: string;
  content: string;
  pay_input_ranges?: { min_cents: number; max_cents: number; currency_type: string; title: string }[];
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

// Greenhouse returns `content` as entity-encoded HTML (e.g. "&lt;p&gt;…"), so it
// must be decoded once or it renders as literal "<p>" text. The worker has no DOM,
// so decode the common entities by hand. `&amp;` is decoded last so a literal
// ampersand encoded as "&amp;amp;" survives as "&amp;".
function decodeGreenhouseContent(content: string | null): string | null {
  if (!content || !/&(?:lt|gt|quot|apos|nbsp|#\d|#x[0-9a-f]);/i.test(content)) {
    return content;
  }
  return content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#0*160;/g, " ")
    .replace(/&#(\d{1,7});/g, (_, code) => {
      const point = Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, code) => {
      const point = parseInt(code, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/&amp;/g, "&");
}

export class GreenhouseAdapter implements ATSAdapter {
  readonly name = "greenhouse";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`Greenhouse API ${response.status}`);
      }

      const data: GreenhouseResponse = await response.json();

      return data.jobs.map((job) => {
        const salary = formatGreenhouseSalary(job.pay_input_ranges?.[0]) ?? extractSalaryFromHtml(job.content);
        return {
          externalId: String(job.id),
          title: job.title,
          url: job.absolute_url,
          location: job.location.name,
          department: job.departments[0]?.name ?? null,
          postedAt: job.updated_at,
          description: decodeGreenhouseContent(job.content) || null,
          salary,
        };
      });
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async fetchJobContent(slug: string, externalId: string): Promise<JobContent> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${externalId}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { description: null, salary: null };
    const job: GreenhouseJob = await res.json();
    return {
      description: decodeGreenhouseContent(job.content) || null,
      salary: formatGreenhouseSalary(job.pay_input_ranges?.[0]) ?? extractSalaryFromHtml(job.content),
    };
  }
}
