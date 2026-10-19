/**
 * Pay by place (owner, 2026-10-19; docs/pay-by-place-2026-10-19.md): a
 * posting can list a pay range per zone or place. Each is kept with the
 * places it covers, beside the job's one `salary` string, which stays as it
 * is for builds already on phones.
 */
export interface PayRange {
  /** The zone or place as the posting names it ("Zone 1", "France"). */
  label: string | null;
  /** The places it covers, when the posting names them. */
  places: string[];
  min: number;
  max: number;
  currency: string;
  period: "year" | "hour";
}

// The words around a range's name that aren't the name.
const FILLER = /\b(?:annual(?:ized)?|base|salary|pay|range|compensation|ote|hourly|wage|rate|target)\b|:/gi;
const ZONE_ONLY = /^(?:[A-Z]{2,3}\s+)?(?:zone|tier|level|band|region|geo|location)\s*[\w-]*$/i;

/** What a range's title says it covers: "Zone 1 (Menlo Park, CA; New York,
 * NY)" names its places; "France Annual Pay Range" is a place; "Zone 2 Pay
 * Range" and "US Zone 3" are zones with no places; "Annual Salary:" is
 * nothing. */
export function readRangeTitle(title: string | null | undefined): { label: string | null; places: string[] } {
  const text = (title ?? "").replace(/\s+/g, " ").trim();
  const listed = /^(.*?)\s*\(([^)]*)\)/.exec(text);
  if (listed) {
    const places = listed[2]!.split(/\s*[;|]\s*/).map((place) => place.trim()).filter(Boolean);
    const label = listed[1]!.replace(FILLER, "").replace(/\s+/g, " ").trim();
    return { label: label || null, places };
  }
  const name = text.replace(FILLER, "").replace(/\s+/g, " ").replace(/[-–—,]+$/, "").trim();
  if (!name) return { label: null, places: [] };
  if (ZONE_ONLY.test(name)) return { label: name, places: [] };
  return { label: name, places: [name] };
}

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

/** "$166K–$195K"; by the hour "$45–$60/hr"; other currencies by code, "CAD 120K–150K". */
export function formatPayRange(range: Pick<PayRange, "min" | "max" | "currency" | "period">): string {
  const symbol = SYMBOLS[range.currency];
  const amount = (value: number) => (range.period === "hour"
    ? String(Math.round(value))
    : `${Math.round(value / 1000)}K`);
  const [low, high] = [amount(range.min), amount(range.max)];
  const both = low === high ? low : null;
  if (symbol) return both ? `${symbol}${both}${range.period === "hour" ? "/hr" : ""}`
    : `${symbol}${low}–${symbol}${high}${range.period === "hour" ? "/hr" : ""}`;
  return `${range.currency} ${both ?? `${low}–${high}`}${range.period === "hour" ? "/hr" : ""}`;
}

/** A place's city, for matching: "New York City, NY" and "New York, NY" are both "new york". */
function cityKey(place: string): string {
  return place.split(",")[0]!.toLowerCase().replace(/\bcity\b/g, "").replace(/\s+/g, " ").trim();
}

/** The range a place falls under, by city or by a country it's in. */
export function rangeForPlace(place: string, ranges: readonly PayRange[]): PayRange | null {
  const key = cityKey(place);
  const lower = place.toLowerCase();
  return ranges.find((range) => range.places.some((covered) =>
    cityKey(covered) === key || (!covered.includes(",") && lower.includes(covered.toLowerCase())))) ?? null;
}

/** Whether any range names its places, so places can be grouped under their pay. */
export const rangesNamePlaces = (ranges: readonly PayRange[]) => ranges.some((range) => range.places.length > 0);

/** The whole spread, "$108K–$176K", when the ranges share a currency and period. */
export function paySpread(ranges: readonly PayRange[]): string | null {
  const [first] = ranges;
  if (!first || ranges.some((range) => range.currency !== first.currency || range.period !== first.period)) return null;
  return formatPayRange({ ...first, min: Math.min(...ranges.map((range) => range.min)), max: Math.max(...ranges.map((range) => range.max)) });
}
