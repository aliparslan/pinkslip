import type { DetectedStage } from "../../shared/email-tracking";
import { localParts, zonedTime } from "../local-time";
import { words } from "./rules";

/*
 * Dates from emails (Decisions: Email tracking #3): an interview's time or an
 * assessment's deadline, only when the email states it clearly. A calendar
 * invite's start wins; otherwise exactly one date in the text, near words that
 * say what it is. A time without a time zone keeps only the day. Anything
 * unclear sets nothing, and Today's "Add the interview date" covers it.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

/** Zone names and abbreviations as emails write them. A summer "EST" still means Eastern. */
const ZONES: Array<[RegExp, string]> = [
  [/^(pt|pst|pdt|pacific( standard| daylight)?( time)?)$/, "America/Los_Angeles"],
  [/^(mt|mst|mdt|mountain( standard| daylight)?( time)?)$/, "America/Denver"],
  [/^(ct|cst|cdt|central( standard| daylight)?( time)?)$/, "America/Chicago"],
  [/^(et|est|edt|eastern( standard| daylight)?( time)?)$/, "America/New_York"],
  [/^(utc|gmt|z)$/, "UTC"],
];

function zoneFor(label: string | undefined): string | null {
  if (!label) return null;
  const clean = label.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  for (const [pattern, zone] of ZONES) if (pattern.test(clean)) return zone;
  // "America/Los_Angeles" written out, as some schedulers do.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: label.trim() });
    return label.includes("/") ? label.trim() : null;
  } catch {
    return null;
  }
}

export interface FoundDate {
  /** "YYYY-MM-DD" when only the day is known, otherwise an ISO instant. */
  value: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayString(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function validDay(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The start of the first event in a calendar invite (.ics). */
export function calendarStart(ics: string): FoundDate | null {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const event = unfolded.split(/BEGIN:VEVENT/i)[1];
  if (!event) return null;
  const line = event.match(/^DTSTART([^:\r\n]*):(\d{8})(?:T(\d{6})(Z)?)?/im);
  if (!line) return null;
  const [, params = "", date, time, utc] = line;
  const year = Number(date!.slice(0, 4));
  const month = Number(date!.slice(4, 6));
  const day = Number(date!.slice(6, 8));
  if (!validDay(year, month, day)) return null;
  if (!time) return { value: dayString(year, month, day) };
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2, 4));
  if (utc) return { value: new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString() };
  const zone = zoneFor(params.match(/TZID=([^;:]+)/i)?.[1]?.replace(/^"|"$/g, ""));
  return zone
    ? { value: zonedTime(year, month, day, hour, zone, minute).toISOString() }
    : { value: dayString(year, month, day) };
}

interface TextDate {
  year: number | null;
  month: number;
  day: number;
  hour: number | null;
  minute: number;
  zone: string | null;
  index: number;
}

const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const TIME = String.raw`(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)`;
// "11:00 AM - 12:00 PM": the end of a range, skipped.
const UNTIL = String.raw`(?:\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)?`;
const ZONE = String.raw`(?:\(?\s*((?:pacific|mountain|central|eastern)(?: standard| daylight)?(?: time)?|[pmce][sd]?t|utc|gmt)\s*\)?)?`;
// "Tuesday, October 21, 2026 at 2:00 PM PT", "Oct 21 at 2pm ET", "October 21st".
const NAMED = new RegExp(
  String.raw`\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(${MONTH_NAMES})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?:,?\s+(?:at|from|@)?\s*${TIME}${UNTIL}\s*${ZONE})?`,
  "gi"
);
// "2:00pm - 2:30pm (Pacific Time), Wednesday, October 21, 2026", as Calendly writes it.
const TIME_FIRST = new RegExp(
  String.raw`\b${TIME}${UNTIL}\s*${ZONE},?\s+(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(${MONTH_NAMES})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?`,
  "gi"
);
// "10/21/2026 at 2:00 PM ET", "10/21 2pm".
const NUMERIC = new RegExp(
  String.raw`\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?(?:,?\s+(?:at|from|@)?\s*${TIME}${UNTIL}\s*${ZONE})?`,
  "gi"
);

function to24(hour: number, meridiem: string): number {
  const pm = meridiem.toLowerCase().startsWith("p");
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

function textDates(text: string): TextDate[] {
  const found: TextDate[] = [];
  for (const match of text.matchAll(NAMED)) {
    const [, monthName, day, year, hour, minute, meridiem, zone] = match;
    found.push({
      year: year ? Number(year) : null,
      month: MONTHS[monthName!.toLowerCase()]!,
      day: Number(day),
      hour: hour && meridiem ? to24(Number(hour), meridiem) : null,
      minute: minute ? Number(minute) : 0,
      zone: zoneFor(zone),
      index: match.index ?? 0,
    });
  }
  for (const match of text.matchAll(TIME_FIRST)) {
    const [, hour, minute, meridiem, zone, monthName, day, year] = match;
    found.push({
      year: year ? Number(year) : null,
      month: MONTHS[monthName!.toLowerCase()]!,
      day: Number(day),
      hour: to24(Number(hour), meridiem!),
      minute: minute ? Number(minute) : 0,
      zone: zoneFor(zone),
      index: match.index ?? 0,
    });
  }
  // A time-first match also leaves its date for NAMED to find without the time;
  // both read the same day, and detectEmailDate keeps the timed one.
  for (const match of text.matchAll(NUMERIC)) {
    const [, month, day, year, hour, minute, meridiem, zone] = match;
    if (Number(month) > 12 || Number(day) > 31) continue;
    found.push({
      year: year ? (year.length === 2 ? 2000 + Number(year) : Number(year)) : null,
      month: Number(month),
      day: Number(day),
      hour: hour && meridiem ? to24(Number(hour), meridiem) : null,
      minute: minute ? Number(minute) : 0,
      zone: zoneFor(zone),
      index: match.index ?? 0,
    });
  }
  return found;
}

/** A date without a year is its next occurrence after the email was sent. */
function resolveYear(date: TextDate, sent: Date, zone: string): number {
  if (date.year) return date.year;
  const local = localParts(sent, zone);
  const candidate = local.year;
  const sentDay = Date.UTC(local.year, local.month - 1, local.day);
  return Date.UTC(candidate, date.month - 1, date.day) < sentDay - 7 * 86_400_000 ? candidate + 1 : candidate;
}

/** Words that, in the same sentence, say a date is the interview or the deadline. */
const CONTEXT: Partial<Record<DetectedStage, RegExp>> = {
  interview: /\b(interview|call|screen|meeting|conversation|chat|onsite|scheduled|confirmed|invite|session)\b/,
  assessment: /\b(by|before|due|deadline|complete|expires?|submit|until|no later than)\b/,
};

/** "within 7 days", "in the next 5 days": the deadline counted from when it was sent. */
const WITHIN_DAYS = /\b(?:within|in the next|you have|you ll have)\s+(\d{1,2}|one|two|three|four|five|six|seven|ten|fourteen)\s+(?:calendar\s+|business\s+)?days\b/;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fourteen: 14 };

/**
 * The date an interview or assessment email states, or null when it doesn't
 * state exactly one clearly. `zone` is the person's, for dates written
 * without a time and for counting days.
 */
export function detectEmailDate(
  email: { subject: string; text: string; date: string | null; calendar?: string[] },
  stage: DetectedStage,
  zone: string
): FoundDate | null {
  if (stage !== "interview" && stage !== "assessment") return null;
  if (stage === "interview") {
    for (const ics of email.calendar ?? []) {
      const start = calendarStart(ics);
      if (start) return start;
    }
  }
  const sent = email.date && !Number.isNaN(Date.parse(email.date)) ? new Date(email.date) : new Date();
  const text = `${email.subject}\n${email.text.slice(0, 20_000)}`;
  const context = CONTEXT[stage]!;
  // Quoted history carries other dates ("On Mon, Oct 13 … wrote:"): stop there.
  const quoted = text.search(/^\s*(on .{5,80} wrote:|-{3,}\s*original message|from:.*\n\s*sent:)/im);
  const sentences = (quoted > 0 ? text.slice(0, quoted) : text).split(/(?<=[.!?])\s+|\n+/).filter((sentence) => sentence.trim() !== "");
  const candidates = new Map<string, FoundDate>();
  for (let index = 0; index < sentences.length; index += 1) {
    // What a date is often sits a line or two away ("Event Type: … Call", then
    // "Event Date/Time: …"), so the words around it count.
    const around = sentences.slice(Math.max(0, index - 2), index + 3).join(" ");
    if (!context.test(words(around))) continue;
    const sentence = sentences[index]!;
    // A date on its own line with the time on the next, as Greenhouse writes it.
    const next = sentences[index + 1] ?? "";
    const joined = new RegExp(`^\\s*${TIME}`, "i").test(next) ? `${sentence} at ${next}` : sentence;
    for (const date of textDates(joined)) {
      const year = resolveYear(date, sent, zone);
      if (!validDay(year, date.month, date.day)) continue;
      const value = date.hour !== null && date.zone
        ? zonedTime(year, date.month, date.day, date.hour, date.zone, date.minute).toISOString()
        : dayString(year, date.month, date.day);
      candidates.set(value, { value });
    }
  }
  // Several dates ("pick one of these times") isn't a stated time.
  if (candidates.size === 1) return [...candidates.values()][0]!;
  if (candidates.size > 1) {
    // The same day at a time and without one is still one date.
    const values = [...candidates.keys()];
    const timed = values.filter((value) => value.includes("T"));
    const days = new Set(values.map((value) => value.includes("T") ? localDay(value, zone) : value));
    if (timed.length === 1 && days.size === 1) return { value: timed[0]! };
    return null;
  }
  if (stage === "assessment") {
    const within = words(text).match(WITHIN_DAYS);
    if (within) {
      const count = NUMBER_WORDS[within[1]!] ?? Number(within[1]);
      const local = localParts(new Date(sent.getTime() + count * 86_400_000), zone);
      return { value: dayString(local.year, local.month, local.day) };
    }
  }
  return null;
}

function localDay(instant: string, zone: string): string {
  const local = localParts(new Date(instant), zone);
  return dayString(local.year, local.month, local.day);
}
