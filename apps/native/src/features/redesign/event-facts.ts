import type { CompanyEvent } from "@pinkslip/core/api";
import { nextRowFacts } from "./application-facts";

/**
 * An event as the redesign shows it (Paper "Approved", E1 to E3): a row with
 * the date tile, the day and time, the event as the headline and one facts
 * line; a page with its own ticket. Times are the phone's own.
 */
export interface EventView {
  id: string;
  company: string;
  domain: string;
  name: string;
  month: string;
  day: string;
  /** Line one: "Today", "Tomorrow", "Wednesday", or "Wednesday, Oct 22". */
  when: string;
  time: string;
  /** Line three: where, then how long, when sign-ups close, or "In person". */
  facts: string;
  /** The ticket's cells. */
  date: string;
  hours: string;
  where: string;
  signupsClose: string | null;
  forWhom: string | null;
  /** The ticket's stub: who hosts it and where it lives. */
  stub: string;
  about: string;
  points: string[];
  url: string;
}

const clock = (date: Date) => date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const monthDay = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "45 min", "1 hr", "1 hr 30 min"; null without an end, or past a day. */
export function eventLength(event: Pick<CompanyEvent, "starts_at" | "ends_at">): string | null {
  if (!event.ends_at) return null;
  const minutes = Math.round((Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 60_000);
  if (!(minutes > 0) || minutes >= 24 * 60) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** "5:00–5:45 PM", or "11:30 AM–12:30 PM" across noon; just the start without an end. */
export function eventHours(event: Pick<CompanyEvent, "starts_at" | "ends_at">): string {
  const start = new Date(event.starts_at);
  const startClock = clock(start);
  if (!event.ends_at || eventLength(event) === null) return startClock;
  const endClock = clock(new Date(event.ends_at));
  const half = (value: string) => value.slice(-2);
  return half(startClock) === half(endClock) ? `${startClock.slice(0, -3)}–${endClock}` : `${startClock}–${endClock}`;
}

export function eventWhere(event: Pick<CompanyEvent, "location" | "online">): string {
  return event.location.trim() || (event.online ? "Online" : "");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function eventStarted(event: Pick<CompanyEvent, "starts_at">, now = new Date()): boolean {
  return Date.parse(event.starts_at) <= now.getTime();
}

export function toEventView(event: CompanyEvent, now = new Date()): EventView {
  const start = new Date(event.starts_at);
  const facts = nextRowFacts(event.starts_at, now);
  const where = eventWhere(event);
  const length = eventLength(event);
  const signup = event.signup_closes_at && Date.parse(event.signup_closes_at) > now.getTime() ? new Date(event.signup_closes_at) : null;
  const second = length ?? (signup ? `Sign-up closes ${monthDay(signup)}` : event.online ? null : "In person");
  const host = event.host.trim();
  return {
    id: event.id,
    company: event.company_name,
    domain: event.company_domain,
    name: event.title,
    month: facts.month,
    day: facts.day,
    when: facts.when,
    time: clock(start),
    facts: [where, second === where ? null : second].filter(Boolean).join(" · "),
    date: start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    hours: eventHours(event),
    where: where || "To be announced",
    signupsClose: event.signup_closes_at ? monthDay(new Date(event.signup_closes_at)) : null,
    forWhom: event.audience.trim() || null,
    stub: [host ? (/^hosted by\b/i.test(host) ? host : `Hosted by ${host}`) : null, hostOf(event.url) ? `via ${hostOf(event.url)}` : null]
      .filter(Boolean).join(" · "),
    about: event.about,
    points: event.points,
    url: event.url,
  };
}
