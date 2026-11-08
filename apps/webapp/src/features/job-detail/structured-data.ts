import type { PublicJob } from "@pinkslip/domain/public-jobs";
import { jobLocationParts } from "@pinkslip/core/job-format";
import { MAX_POSTED_AGE_DAYS } from "@pinkslip/domain/job-policy";

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function host(domain: string): string | undefined {
  return domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "") || undefined;
}

function website(domain: string): string | undefined {
  const name = host(domain);
  return name ? `https://${name}` : undefined;
}

/** A place as Google reads it: "Hybrid - San Francisco, CA" is the city
 * "San Francisco" in the region "CA". A trailing country code counts
 * ("Toronto, ON, CA"); otherwise the catalog's places are American. */
export function postalAddress(place: string): Record<string, string> {
  const bare = place.replace(/^(?:hybrid|on-?site|in[- ]office|office)\s*[-–—:]\s*/i, "").trim();
  const parts = bare.split(/\s*,\s*/).filter(Boolean);
  const country = parts.length >= 3 && /^[A-Z]{2}$/.test(parts.at(-1)!) ? parts.pop()! : "US";
  const region = parts.length >= 2 ? parts.pop()! : undefined;
  return {
    "@type": "PostalAddress",
    addressLocality: parts.join(", ") || bare,
    ...(region ? { addressRegion: region } : {}),
    addressCountry: country,
  };
}

/** The first pay band as numbers ("$150,000 - $180,000", "$150K–180K",
 * "$45/hr"), or null when the posting's pay isn't in dollars or can't be
 * read. Google wants the range and whether it's by the hour or the year. */
export function baseSalary(salary: string | null): Record<string, unknown> | null {
  const band = salary?.split(/\s*(?:\||;|·|•|\n)\s*/).find((part) => /\$\s*\d/.test(part));
  if (!band) return null;
  const values = [...band.matchAll(/\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k)?|(?<=[-–—]\s*)(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k)?/gi)]
    .map((match) => {
      const number = Number((match[1] ?? match[3] ?? "").replace(/,/g, ""));
      return match[2] || match[4] ? number * 1000 : number;
    })
    .filter((number) => Number.isFinite(number) && number > 0);
  if (values.length === 0) return null;
  // "$150–180K": the K belongs to both.
  if (values.length >= 2 && values[0]! < 1000 && values[1]! >= 1000) values[0] = values[0]! * 1000;
  const hourly = /\/\s*h(?:ou)?r|per hour|hourly/i.test(band) || values[0]! < 500;
  const [min, max] = [Math.min(...values.slice(0, 2)), Math.max(...values.slice(0, 2))];
  return {
    "@type": "MonetaryAmount",
    currency: "USD",
    value: {
      "@type": "QuantitativeValue",
      ...(min === max ? { value: min } : { minValue: min, maxValue: max }),
      unitText: hourly ? "HOUR" : "YEAR",
    },
  };
}

/** Internships and co-ops are INTERN; contracts and part-time say so in the
 * title; everything else in the catalog is a full-time role. */
export function employmentType(title: string): string {
  if (/\bintern(?:ship)?s?\b|\bco-?op\b/i.test(title)) return "INTERN";
  if (/\bcontract(?:or)?\b/i.test(title)) return "CONTRACTOR";
  if (/\bpart[- ]time\b/i.test(title)) return "PART_TIME";
  return "FULL_TIME";
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

  const pay = baseSalary(job.salary);
  const logoHost = host(job.company_domain);

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: posted,
    ...(validThrough ? { validThrough } : {}),
    employmentType: employmentType(job.title),
    identifier: { "@type": "PropertyValue", name: job.company_name, value: job.id },
    hiringOrganization: {
      "@type": "Organization",
      name: job.company_name,
      ...(website(job.company_domain) ? { sameAs: website(job.company_domain) } : {}),
      ...(logoHost ? { logo: `https://pinkslip.work/api/v2/logo?domain=${encodeURIComponent(logoHost)}` } : {}),
    },
    ...(pay ? { baseSalary: pay } : {}),
    ...(onsite.length > 0 ? {
      jobLocation: onsite.map((place) => ({ "@type": "Place", address: postalAddress(place) })),
    } : {}),
    ...(remote ? {
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: { "@type": "Country", name: "United States" },
    } : {}),
    directApply: false,
    url: `https://pinkslip.work/jobs/${encodeURIComponent(job.id)}`,
  };
}
