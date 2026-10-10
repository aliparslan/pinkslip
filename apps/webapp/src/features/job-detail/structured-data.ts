import type { PublicJob } from "@pinkslip/domain/public-jobs";
import { jobLocationParts } from "@pinkslip/core/job-format";
import { MAX_POSTED_AGE_DAYS } from "@pinkslip/domain/job-policy";

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function website(domain: string): string | undefined {
  const host = domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return host ? `https://${host}` : undefined;
}

/**
 * Google's `JobPosting` for a public job page. Only open, public jobs get
 * one: the public catalog drops closed and stale jobs, and those pages 404.
 * `validThrough` is the day the catalog would retire the listing for age;
 * evergreen listings stay until their source removes them, so have none.
 */
export function jobPostingJsonLd(job: PublicJob): Record<string, unknown> | null {
  const posted = iso(job.posted_at) ?? iso(job.first_seen_at);
  if (!job.description?.trim() || !posted) return null;
  const places = jobLocationParts(job.location);
  const remote = places.some((place) => /\bremote\b/i.test(place));
  const onsite = places.filter((place) => !/\bremote\b/i.test(place));
  const validThrough = !job.evergreen && job.posted_at
    ? new Date(Date.parse(posted) + (MAX_POSTED_AGE_DAYS + 1) * DAY_MS).toISOString()
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: posted,
    ...(validThrough ? { validThrough } : {}),
    identifier: { "@type": "PropertyValue", name: job.company_name, value: job.id },
    hiringOrganization: {
      "@type": "Organization",
      name: job.company_name,
      ...(website(job.company_domain) ? { sameAs: website(job.company_domain) } : {}),
    },
    ...(onsite.length > 0 ? {
      jobLocation: onsite.map((place) => ({
        "@type": "Place",
        address: { "@type": "PostalAddress", addressLocality: place, addressCountry: "US" },
      })),
    } : {}),
    ...(remote ? {
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: { "@type": "Country", name: "United States" },
    } : {}),
    directApply: false,
    url: `https://pinkslip.work/jobs/${encodeURIComponent(job.id)}`,
  };
}
