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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&mdash;/gi, " – ")
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
  let salary = `${prefix}${min} – ${prefix}${max}`;
  if (range.title) salary += ` (${range.title})`;
  return salary;
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
