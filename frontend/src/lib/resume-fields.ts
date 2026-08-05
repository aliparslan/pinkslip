import type { DegreeType } from "../../../shared/resume-profile";

export const DEGREE_OPTIONS: ReadonlyArray<{ value: DegreeType; label: string }> = [
  { value: "high_school", label: "High school diploma" },
  { value: "associate", label: "Associate degree" },
  { value: "bachelor", label: "Bachelor's degree" },
  { value: "master", label: "Master's degree" },
  { value: "doctorate", label: "Doctorate / PhD" },
  { value: "professional", label: "Professional degree" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
];

export const US_STATES: ReadonlyArray<{ value: string; label: string }> = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([value, label]) => ({ value, label }));

const STATE_CODES = new Set(US_STATES.map((state) => state.value));

export function splitUsLocation(location: string): { city: string; state: string } {
  const normalized = location.trim().replace(/,?\s+(?:United States|USA|US)$/i, "");
  const match = normalized.match(/^(.*?)(?:,\s*|\s+)([A-Z]{2})$/);
  if (match && STATE_CODES.has(match[2])) {
    return { city: match[1].trim(), state: match[2] };
  }
  return { city: normalized, state: "" };
}

export function joinUsLocation(city: string, state: string): string {
  return [city.trim(), state.trim()].filter(Boolean).join(", ");
}

const DEGREE_LABELS = Object.fromEntries(
  DEGREE_OPTIONS.map((option) => [option.value, option.label])
) as Record<DegreeType, string>;

export function inferDegreeType(value: string): DegreeType | "" {
  const degree = value.trim().toLowerCase();
  if (!degree) return "";
  if (/\b(ph\.?d\.?|doctor(?:ate|al)?|dphil)\b/.test(degree)) return "doctorate";
  if (/\b(j\.?d\.?|m\.?d\.?|professional degree)\b/.test(degree)) return "professional";
  if (/\b(m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|m\.?eng\.?|master'?s?)\b/.test(degree)) return "master";
  if (/\b(b\.?s\.?|b\.?a\.?|b\.?b\.?a\.?|b\.?eng\.?|bachelor'?s?)\b/.test(degree)) return "bachelor";
  if (/\b(a\.?s\.?|a\.?a\.?|associate'?s?)\b/.test(degree)) return "associate";
  if (/\b(high school|ged|diploma)\b/.test(degree)) return "high_school";
  if (/\b(certificate|certification|bootcamp)\b/.test(degree)) return "certificate";
  return "other";
}

export function inferFieldOfStudy(value: string, degreeType: DegreeType | ""): string {
  const trimmed = value.trim();
  if (!trimmed || !degreeType || degreeType === "other") return trimmed;
  const prefixes: Partial<Record<DegreeType, RegExp>> = {
    doctorate: /^(?:ph\.?\s*d\.?|dphil|doctor(?:ate|al)?(?:\s+degree)?)(?:\s+(?:of|in)\s+|[\s,:-]+)*/i,
    professional: /^(?:j\.?\s*d\.?|m\.?\s*d\.?|professional\s+degree)(?:\s+(?:of|in)\s+|[\s,:-]+)*/i,
    master: /^(?:master'?s?(?:\s+degree)?(?:\s+of\s+(?:science|arts|engineering|business administration))?(?:\s+degree)?|m\.?\s*(?:s|a|b\.?\s*a|eng)\.?)(?:\s+(?:of|in)\s+|[\s,:-]+)*/i,
    bachelor: /^(?:bachelor'?s?(?:\s+degree)?(?:\s+of\s+(?:science|arts|engineering|business administration))?(?:\s+degree)?|b\.?\s*(?:s|a|b\.?\s*a|eng)\.?)(?:\s+(?:of|in)\s+|[\s,:-]+)*/i,
    associate: /^(?:associate'?s?(?:\s+degree)?(?:\s+of\s+(?:science|arts))?|a\.?\s*(?:s|a)\.?)(?:\s+(?:of|in)\s+|[\s,:-]+)*/i,
    high_school: /^(?:high\s+school(?:\s+diploma)?|ged|diploma)(?:[\s,:-]+)*/i,
    certificate: /^(?:certificate|certification|bootcamp)(?:\s+(?:of|in)\s+|[\s,:-]+)*/i,
  };
  return trimmed.replace(prefixes[degreeType] ?? /^$/, "").trim();
}

export function formatDegree(degreeType: DegreeType | "", fieldOfStudy: string): string {
  const label = degreeType && degreeType !== "other" ? DEGREE_LABELS[degreeType] : "";
  return [label, fieldOfStudy.trim()].filter(Boolean).join(", ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthInputValue(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return trimmed;
  const named = trimmed.match(/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})$/i);
  if (!named) return "";
  const month = MONTHS.findIndex((candidate) => named[1].toLowerCase().startsWith(candidate.toLowerCase()));
  return month < 0 ? "" : `${named[2]}-${String(month + 1).padStart(2, "0")}`;
}

export function formatResumeDate(value: string): string {
  const normalized = monthInputValue(value);
  if (!normalized) return value.trim();
  const [year, month] = normalized.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}
