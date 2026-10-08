/* Display formatting for job fields, shared by the web and iOS apps. Pure
   string work only: no DOM, so it runs in a Worker or under React Native. */

export function normalizeText(value: string): string {
  return value.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

const LOCATION_ABBREVIATIONS: Record<string, string> = {
  California: "CA",
  Colorado: "CO",
  "District of Columbia": "DC",
  Georgia: "GA",
  Illinois: "IL",
  Massachusetts: "MA",
  "New York": "NY",
  Texas: "TX",
  Washington: "WA",
};

function normalizeLocationPart(value: string): string {
  let part = normalizeText(value)
    .replace(/\s*\((?:US|USA|United States)\)\s*$/i, "")
    .replace(/\s+-\s+(?:US|USA|United States)\s*$/i, "")
    .replace(/,?\s+(?:US|USA|United States(?: of America)?)\s*$/i, "")
    .trim();

  if (/^(?:remote|remote anywhere|anywhere remote)$/i.test(part)) return "Remote";
  if (/^remote[- ]friendly\s*\(travel[- ]required\)$/i.test(part)) {
    return "Remote-friendly (travel)";
  }
  if (/^remote[- ]friendly$/i.test(part)) return "Remote-friendly";
  part = part.replace(/^New York City(?=,|$)/i, "New York");

  for (const [state, abbreviation] of Object.entries(LOCATION_ABBREVIATIONS)) {
    part = part.replace(new RegExp(`,\\s*${state}$`, "i"), `, ${abbreviation}`);
  }

  return part;
}

// ATS feeds often send a long list (sometimes with country names repeated).
// Keep the first meaningful place visible and summarize the rest for feed rows;
// the full source location remains available on the job detail screen.
export function formatJobLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const parts = location
    .split(/\s*(?:;|\||\s\/\s)\s*/)
    .map(normalizeLocationPart)
    .filter(Boolean);
  const unique = [...new Set(parts.map((part) => part.toLowerCase()))]
    .map((key) => parts.find((part) => part.toLowerCase() === key) as string);

  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];

  const remoteIndex = unique.findIndex((part) => part === "Remote");
  if (remoteIndex >= 0) {
    return `Remote +${unique.length - 1}`;
  }
  if (unique.length === 2 && `${unique[0]} + ${unique[1]}`.length <= 34) {
    return `${unique[0]} + ${unique[1]}`;
  }
  return `${unique[0]} +${unique.length - 1}`;
}

/* ATS feeds disagree on range punctuation ("$114,000 - $184,000",
   "$114,000—$184,000", "120K to 150K"); normalize every range to a bare
   en dash so adjacent feed rows always match. */
export function normalizeSalaryText(salary: string | null | undefined): string | null {
  if (!salary) return null;
  const cleaned = salary
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  // Compensation feeds also emit non-salary benefits such as "Offers Equity"
  // and "Offers Commission" in the salary slot. Display only an actual
  // numeric amount/range; descriptive compensation belongs in the listing.
  const currency = "(?:(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)\\s*)?(?:[$£€¥]\\s*)?";
  const amount = "\\d[\\d,]*(?:\\.\\d+)?\\s*[kK]?";
  const period = "(?:\\s*(?:/|per\\s+)(?:yr|year|annually|annual|hr|hour|hourly))?";
  const range = new RegExp(`${currency}${amount}\\s*(?:-|–|—|to)\\s*${currency}${amount}${period}`, "i");
  const single = new RegExp(`(?:(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)\\s*)?(?:[$£€¥]\\s*)${amount}${period}`, "i");
  const numeric = cleaned.match(range)?.[0] ?? cleaned.match(single)?.[0] ?? null;
  if (!numeric) return null;

  const values = numeric.match(/\d[\d,]*(?:\.\d+)?\s*[kK]?/g) ?? [];
  const plausible = values.some((token) => {
    const inThousands = /[kK]\b/.test(token);
    const value = Number.parseFloat(token.replace(/,/g, "").replace(/[kK]\b/, ""));
    return Number.isFinite(value) && (inThousands || value >= 1_000);
  });
  if (!plausible && !/[$£€¥]|\b(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)\b/i.test(numeric)) return null;

  return numeric
    .replace(/(\d[\d,.]*(?:\s?[kK])?)(?:\s+to\s+|\s*[-–—]\s*)([$£€¥]?\s?\d)/g, "$1–$2")
    .replace(/([$£€¥])\s+(\d)/g, "$1$2")
    .trim();
}

export function formatCompactSalaryText(salary: string | null | undefined): string | null {
  const normalized = normalizeSalaryText(salary);
  if (!normalized) return null;

  // When an ATS supplies multiple geographic bands, keep the primary band in
  // the row; the full source value remains visible on the detail page.
  const primaryBand = normalized.split(/\s+[·•|]\s+/)[0] ?? normalized;
  return primaryBand.replace(/([$£€¥])?(\d{1,3}(?:,\d{3})+)(?:\.\d+)?/g, (_match: string, currency: string | undefined, amount: string) => {
    const thousands = Math.round(Number(amount.replace(/,/g, "")) / 1000);
    return `${currency ?? ""}${thousands}K`;
  });
}

/* Cities a reader knows without a state. Rows drop the state for these to
   save width; everything else keeps "City, ST". */
const WELL_KNOWN_CITIES = new Set([
  "New York",
  "Brooklyn",
  "San Francisco",
  "Palo Alto",
  "Mountain View",
  "Menlo Park",
  "Sunnyvale",
  "San Jose",
  "Los Angeles",
  "Seattle",
  "Chicago",
  "Boston",
  "Austin",
  "Denver",
  "Atlanta",
]);

/** A feed row's location: formatJobLocation, then "New York" rather than
 * "New York, NY" for cities everyone knows. */
export function formatRowLocation(location: string | null | undefined): string | null {
  const formatted = formatJobLocation(location);
  if (!formatted) return null;
  return formatted.replace(/([A-Z][A-Za-z .'-]*?), ([A-Z]{2})\b/g, (match, city: string) =>
    WELL_KNOWN_CITIES.has(city) ? city : match,
  );
}

/** A feed row's pay: the compact range with the unit written once,
 * "$160–190K" rather than "$160K–$190K". */
export function formatRowSalary(salary: string | null | undefined): string | null {
  const compact = formatCompactSalaryText(salary);
  if (!compact) return null;
  return compact.replace(/^([$£€¥]?)(\d+(?:\.\d+)?)K–\1(\d+(?:\.\d+)?)K/, "$1$2–$3K");
}
