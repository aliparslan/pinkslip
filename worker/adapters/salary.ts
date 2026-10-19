import { readRangeTitle, type PayRange } from "../../shared/pay-ranges";

interface GreenhousePayRange {
  min_cents: number;
  max_cents: number;
  currency_type: string;
  title: string;
}

interface LeverSalaryRange {
  min: number;
  max: number;
  currency: string;
  interval: string;
}

const SALARY_PATTERNS = [
  /(?:(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)\s*)?(?:\$|£|€|¥)\s*[\d,]+(?:\.\d{2})?(?:\s*[kK])?\s*(?:-|–|—|to)\s*(?:(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)\s*)?(?:\$|£|€|¥)\s*[\d,]+(?:\.\d{2})?(?:\s*[kK])?/gi,
  /\$[\d,]+(?:\.\d{2})?(?:\s*[kK])?\s*(?:\/\s*(?:yr|year|annually|annual|hr|hour|hourly))/gi,
  /\b[\d,]+(?:\.\d{2})?\s*(?:-|–|—|to)\s*[\d,]+(?:\.\d{2})?\s*(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)(?:\s+(?:annually|annual|yearly|hourly))?/gi,
];

function parseSalaryMagnitude(token: string): number {
  const normalized = token.trim();
  const hasThousandsSuffix = /[kK]\b/.test(normalized);
  const numeric = Number.parseFloat(normalized.replace(/,/g, "").replace(/[kK]\b/, ""));
  if (!Number.isFinite(numeric)) return Number.NaN;
  return hasThousandsSuffix ? numeric * 1000 : numeric;
}

function normalizeHtmlText(html: string): string {
  return html
    // Greenhouse sends its markup escaped once ("&lt;span&gt;"); unescape it
    // so the tags strip out instead of splitting a range in two.
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&mdash;|&#821[12];/gi, " – ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatGreenhouseSalary(range: GreenhousePayRange | undefined): string | null {
  if (!range) return null;
  const min = Math.round(range.min_cents / 100).toLocaleString();
  const max = Math.round(range.max_cents / 100).toLocaleString();
  const prefix = range.currency_type === "USD" ? "$" : `${range.currency_type} `;
  return `${prefix}${min} – ${prefix}${max}`;
}

/** Every range Greenhouse lists, each with the zone or places its title
 * names (pay by place, owner 2026-10-19). Null when it lists none. */
export function greenhousePayRanges(ranges: GreenhousePayRange[] | undefined): PayRange[] | null {
  if (!ranges?.length) return null;
  return ranges
    .filter((range) => Number.isFinite(range.min_cents) && Number.isFinite(range.max_cents) && range.max_cents > 0)
    .map((range) => ({
      ...readRangeTitle(range.title),
      min: Math.round(range.min_cents / 100),
      max: Math.round(range.max_cents / 100),
      currency: range.currency_type || "USD",
      period: /\b(?:hour|hourly|hr)\b/i.test(range.title ?? "") ? "hour" as const : "year" as const,
    }));
}

export function formatLeverSalary(range: LeverSalaryRange | undefined): string | null {
  if (!range) return null;
  const { min, max, currency, interval } = range;
  const prefix = currency === "USD" ? "$" : `${currency} `;
  return `${prefix}${min.toLocaleString()} – ${prefix}${max.toLocaleString()}/${interval}`;
}

export function extractSalaryFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;

  const text = normalizeHtmlText(html);
  if (!text) return null;

  const matches: string[] = [];
  for (const pattern of SALARY_PATTERNS) {
    const found = text.match(pattern);
    if (!found) continue;

    for (const match of found) {
      const cleaned = match.replace(/\s+/g, " ").trim();
      const numbers = cleaned.match(/[\d,]+(?:\.\d{2})?(?:\s*[kK])?/g) ?? [];
      const maxValue = Math.max(...numbers.map(parseSalaryMagnitude));
      if (Number.isFinite(maxValue) && maxValue >= 1000) {
        matches.push(cleaned);
      }
    }
  }

  const unique = [...new Set(matches)];
  if (unique.length === 0) return null;
  return unique.slice(0, 2).join(" · ");
}
