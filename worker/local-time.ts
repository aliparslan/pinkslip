// Times in a person's own time zone: follow-ups at 9am, the daily new-jobs
// alert at the time they picked, and later the date reminders. The zone comes
// from the phone (users.time_zone); people who haven't sent one yet are
// treated as US Eastern, where most of Pinkslip's audience is.

export const DEFAULT_TIME_ZONE = "America/New_York";

/** The zone if Intl knows it, else the default. */
export function validTimeZone(value: unknown, fallback = DEFAULT_TIME_ZONE): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return fallback;
  }
}

/** True only for a zone name Intl accepts (no fallback). */
export function isTimeZone(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 64
    && validTimeZone(value, "") === value;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/** "2026-10-16" in the zone. */
export function localDate(instant: Date, timeZone: string): string {
  const { year, month, day } = localParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function offsetMs(instant: Date, timeZone: string): number {
  const local = localParts(instant, timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant a local wall-clock time happens in the zone. */
export function zonedTime(year: number, month: number, day: number, hour: number, timeZone: string, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), timeZone);
  // Re-check once so a DST change between the guess and the answer still lands on the hour.
  return new Date(guess - offsetMs(new Date(first), timeZone));
}
