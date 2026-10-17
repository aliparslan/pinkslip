import { DEFAULT_TIME_ZONE, localParts, validTimeZone, zonedTime } from "../local-time";

/** Business days after the previous email: the first follow-up after three,
 * the second about a week after that. */
export const FOLLOW_UP_BUSINESS_DAYS = [3, 5] as const;
export const FOLLOW_UP_LOCAL_HOUR = 9;
export const DEFAULT_OUTREACH_TIME_ZONE = DEFAULT_TIME_ZONE;
export { validTimeZone };

/** "2,5" → [2, 5]. Lets a tester see follow-ups come due in minutes instead of days. */
export function testFollowUpMinutes(value: string | undefined): [number, number] | null {
  if (!value?.trim()) return null;
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part) || part <= 0)) return null;
  return [parts[0], parts[1]];
}

/** The instant a follow-up comes due: `businessDays` weekdays after the local
 * date the previous email went out, at 9am in the sender's time zone. */
export function addBusinessDaysAt(
  from: Date,
  businessDays: number,
  timeZone: string,
  hour = FOLLOW_UP_LOCAL_HOUR,
): Date {
  const local = localParts(from, timeZone);
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  let remaining = businessDays;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return zonedTime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, timeZone);
}

export function followUpDueAt(
  previousSentAt: Date,
  step: 1 | 2,
  timeZone: string,
  testMinutes: [number, number] | null = null,
): Date {
  if (testMinutes) return new Date(previousSentAt.getTime() + testMinutes[step - 1] * 60_000);
  return addBusinessDaysAt(previousSentAt, FOLLOW_UP_BUSINESS_DAYS[step - 1], timeZone);
}
