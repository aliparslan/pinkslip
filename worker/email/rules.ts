import type { DetectedStage } from "../../shared/email-tracking";

/*
 * Rules for reading a forwarded email: who it's for, whether to open it, what
 * it says happened and which company it's from. Pure functions only, so every
 * rule is testable with plain strings. See docs/email-tracking.md.
 */

export interface Sender {
  name: string;
  address: string;
}

export interface EmailContent {
  from: Sender;
  subject: string;
  /** The sender's date, when known. */
  date: string | null;
  /** Plain text, with HTML converted when there was no text part. */
  text: string;
  /** Every link target in the email. */
  links: string[];
}

const INBOX_TAG = /^inbox\+([a-z0-9]{6,32})@pinkslip\.work$/i;

/** The user's tag from `inbox+<tag>@pinkslip.work`, or null. */
export function parseInboxTag(recipient: string): string | null {
  return recipient.trim().match(INBOX_TAG)?.[1]?.toLowerCase() ?? null;
}

export function domainOf(address: string): string {
  return address.trim().toLowerCase().split("@")[1]?.replace(/\.$/, "") ?? "";
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Applicant tracking, scheduling and assessment services. Mail from these is
 * always about a job. */
export const HIRING_SERVICE_DOMAINS = [
  // Applicant tracking
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com", "myworkday.com",
  "myworkdayjobs.com", "workday.com", "smartrecruiters.com", "smartrecruiters-mail.com",
  "icims.com", "jobvite.com", "taleo.net", "successfactors.com", "successfactors.eu",
  "bamboohr.com", "workable.com", "recruitee.com", "rippling.com", "gem.com", "eightfold.ai",
  "avature.net", "phenompeople.com", "comeet.co", "teamtailor.com", "teamtailor-mail.com",
  "pinpointhq.com", "dover.com", "ycombinator.com", "workatastartup.com", "wellfound.com",
  "jazzhr.com", "breezy.hr", "paylocity.com", "ultipro.com", "oraclecloud.com",
  // Scheduling
  "goodtime.io", "calendly.com", "modernloop.io", "prelude.co", "paradox.ai", "yello.co",
  // Assessments and video interviews
  "hackerrank.com", "hackerrankforwork.com", "codesignal.com", "karat.io", "karat.com",
  "coderpad.io", "codility.com", "testgorilla.com", "hirevue.com", "pymetrics.ai",
  "harver.com", "criteriacorp.com", "mettl.com", "imocha.io",
];

export function isHiringService(host: string): boolean {
  const lower = host.toLowerCase();
  return HIRING_SERVICE_DOMAINS.some((domain) => hostMatches(lower, domain));
}

const FORWARDED_SUBJECT = /^\s*(fwd?|fw)\s*:/i;

/** Gmail's "confirm forwarding" message for a new forwarding address. */
export function isGmailForwardingConfirmation(from: Sender, subject: string): boolean {
  return from.address.toLowerCase() === "forwarding-noreply@google.com" && /forwarding confirmation/i.test(subject);
}

export function parseGmailForwardingConfirmation(email: Pick<EmailContent, "subject" | "text" | "links">): {
  code: string | null;
  link: string | null;
} {
  const code = email.subject.match(/\(#(\d{6,12})\)/)?.[1]
    ?? email.text.match(/confirmation code:\s*(\d{6,12})/i)?.[1]
    ?? null;
  const link = email.links.find((href) => {
    try {
      const url = new URL(href);
      return url.protocol === "https:"
        && (url.hostname === "mail-settings.google.com" || url.hostname === "mail.google.com")
        && /\/vf-/.test(url.pathname);
    } catch {
      return false;
    }
  }) ?? null;
  return { code, link };
}

export interface TrackedCompany {
  id: string;
  name: string;
  website: string;
  ats_slug: string;
}

/** Letters and digits only: "Hims & Hers" → "himshers". */
export const compact = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Lowercase words separated by single spaces, for phrase and title search. */
export const words = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

function siteDomain(website: string): string {
  try {
    return new URL(website.includes("://") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The first label of a domain that isn't a generic mail subdomain. */
function domainLabel(host: string): string {
  const labels = host.split(".").filter(Boolean);
  const meaningful = labels.slice(0, -1).filter((label) => !["mail", "email", "e", "em", "info", "careers", "jobs", "hr", "recruiting", "talent", "us", "eu"].includes(label));
  return meaningful.at(-1) ?? labels[0] ?? "";
}

/**
 * How strongly an email points at a company. Sender domain, ATS links and the
 * sender's name are strong; a mention in the subject is weaker; the body
 * weakest. Zero means no evidence.
 */
export function companyEvidence(company: TrackedCompany, email: EmailContent): number {
  const name = compact(company.name);
  if (name.length < 2) return 0;
  const senderHost = domainOf(email.from.address);
  const site = siteDomain(company.website);
  let score = 0;
  if (site && hostMatches(senderHost, site)) score = Math.max(score, 5);
  if (!isHiringService(senderHost) && compact(domainLabel(senderHost)) === name) score = Math.max(score, 5);
  // Workday mails from <tenant>@myworkday.com.
  if (hostMatches(senderHost, "myworkday.com") && compact(email.from.address.split("@")[0] ?? "") === name) {
    score = Math.max(score, 4);
  }
  const slug = company.ats_slug.toLowerCase();
  if (slug && email.links.some((href) => atsSlugsInLink(href).includes(slug))) score = Math.max(score, 5);
  const companyWords = words(company.name);
  const contains = (haystack: string) => companyWords !== "" && ` ${words(haystack)} `.includes(` ${companyWords} `);
  if (contains(email.from.name)) score = Math.max(score, 4);
  if (contains(email.subject)) score = Math.max(score, 3);
  if (score === 0 && contains(email.text.slice(0, 4000))) score = 1;
  return score;
}

/** Board slugs in ATS links: boards.greenhouse.io/<slug>, jobs.lever.co/<slug>,
 * jobs.ashbyhq.com/<slug>, <tenant>.wd5.myworkdayjobs.com. */
export function atsSlugsInLink(href: string): string[] {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return [];
  }
  const host = url.hostname.toLowerCase();
  const first = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if ((hostMatches(host, "greenhouse.io") || hostMatches(host, "lever.co") || hostMatches(host, "ashbyhq.com")) && first) {
    return [first, url.searchParams.get("for")?.toLowerCase() ?? ""].filter(Boolean);
  }
  if (hostMatches(host, "myworkdayjobs.com") || hostMatches(host, "myworkday.com")) {
    return [host.split(".")[0] ?? ""].filter(Boolean);
  }
  return [];
}

const APPLICATION_SUBJECT = /\b(application|applying|applied|candidacy|candidate|interview|assessment|offer|position|role|opportunity|next steps|recruit\w*|hiring)\b/i;

/**
 * Whether to open an email at all. Mail that isn't from a hiring service or a
 * tracked company, and whose subject doesn't read like application mail, is
 * dropped without its body ever being read.
 */
export function shouldOpen(
  headers: { from: Sender; subject: string },
  trackedCompanies: TrackedCompany[]
): boolean {
  if (FORWARDED_SUBJECT.test(headers.subject)) return true;
  if (isHiringService(domainOf(headers.from.address))) return true;
  if (APPLICATION_SUBJECT.test(headers.subject)) return true;
  const headerOnly: EmailContent = { from: headers.from, subject: headers.subject, date: null, text: "", links: [] };
  return trackedCompanies.some((company) => companyEvidence(company, headerOnly) >= 3);
}

/**
 * A forward the user sent by hand carries the original inside its body.
 * Gmail, Outlook and Apple Mail each mark it differently; all three list
 * From, Subject and Date (or Sent) lines first.
 */
export function unwrapForward(email: EmailContent): EmailContent {
  if (!FORWARDED_SUBJECT.test(email.subject)) return email;
  const marker = email.text.match(
    /(-{5,}\s*Forwarded message\s*-{5,}|Begin forwarded message:|_{10,}|-{5,}\s*Original Message\s*-{5,})/i
  );
  let after: string;
  if (marker?.index !== undefined) {
    after = email.text.slice(marker.index + marker[0].length);
  } else {
    // Outlook's HTML forwards draw the separator as a rule, so there's no
    // text marker: find the header block itself.
    const block = email.text.search(/^[ \t]*\*?From\*?:[^\n]*@[^\n]*\n(?:[^\n]*\n){0,5}?[ \t]*\*?(Sent|Date|Subject)\*?:/im);
    if (block < 0) return email;
    after = email.text.slice(block);
  }
  const lines = after.split(/\r?\n/);
  const header: Record<string, string> = {};
  let bodyStart = 0;
  for (let index = 0; index < Math.min(lines.length, 14); index += 1) {
    const line = lines[index]!.trim();
    const field = line.match(/^\*?(From|Subject|Date|Sent|To|Cc)\*?:\s*(.*)$/i);
    if (field) {
      header[field[1]!.toLowerCase()] = field[2]!.trim();
      bodyStart = index + 1;
    } else if (line !== "" && Object.keys(header).length > 0) {
      break;
    }
  }
  if (!header.from) return email;
  const from = header.from.match(/^"?(.*?)"?\s*<\s*([^>\s]+@[^>\s]+)\s*>/)
    ?? header.from.match(/^()([^\s]+@[^\s]+)$/);
  return {
    from: from ? { name: from[1]!.trim(), address: from[2]!.toLowerCase() } : { name: header.from, address: "" },
    subject: header.subject ?? email.subject.replace(FORWARDED_SUBJECT, "").trim(),
    date: header.date ?? header.sent ?? null,
    text: lines.slice(bodyStart).join("\n"),
    links: email.links,
  };
}

/*
 * What happened, from the wording. Each step needs a phrase that only that
 * step uses: a receipt that says "we may invite you to interview" is still a
 * receipt, so interview and assessment need invitation wording or a
 * scheduling or assessment link. Checked from the strongest outcome down.
 */
const OFFER = [
  /\bpleased to (extend|offer)\b/, /\boffer of employment\b/, /\boffer letter\b/,
  /\bextend(ing)? (you )?an offer\b/, /\bverbal offer\b/, /\bwritten offer\b/,
];
const REJECTED = [
  /\bnot (be )?moving forward with (you|your)\b/, /\b(decided|chosen|elected) (not to|to not) (move|proceed)\b/,
  /\b(move|moving|proceed|proceeding) forward with other (candidates|applicants)\b/,
  /\bpursue other candidates\b/, /\bdecided to pursue\b/,
  /\bnot (to )?proceed(ing)? with your (application|candidacy)\b/, /\bwill not be proceeding\b/,
  /\bunable to (move forward|offer you|proceed)\b/, /\bregret to inform\b/,
  /\bposition has (been|now been) filled\b/, /\bno longer (being )?considered\b/,
  /\b(were|was|have|has) not (been )?selected\b/, /\bnot a (fit|match) at this time\b/,
  /\bdecided not to move forward\b/, /\bwon t be moving forward\b/, /\bwill not be moving forward\b/,
];
const INTERVIEW = [
  /\binvite you to (an |a )?(phone |video |virtual |technical |onsite |on site |final )?(interview|screen|call|conversation|chat)\b/,
  /\b(schedule|book|set up) (a|an|your) (phone |video |virtual |technical |onsite |on site |final |recruiter |initial |first )?(interview|screen|call|conversation|chat)\b/,
  /\binterview (invitation|invite|request|confirmation|scheduled|confirmed)\b/,
  /\byour (upcoming )?interview (is|has been) (scheduled|confirmed)\b/,
  /\bavailability for (an |a |your )?(interview|call|phone screen)\b/,
  /\b(move|moving) you forward to\b/, /\bnext round\b/, /\bfinal round\b/, /\bsuper ?day\b/,
  /\bphone screen\b/, /\bonsite interview\b/, /\bselect a time\b/, /\bpick a time\b/,
];
const INTERVIEW_LINK_HOSTS = ["goodtime.io", "calendly.com", "modernloop.io", "prelude.co", "karat.io", "karat.com"];
const ASSESSMENT = [
  /\binvite(d)? you to (complete|take)\b/, /\b(complete|take) (the|your|an|this|a) (online |coding |technical |skills |short )?(assessment|challenge|test|exercise)\b/,
  /\bonline assessment\b/, /\bcoding (challenge|assessment|test|exercise)\b/, /\btake ?home (assignment|challenge|exercise|project)\b/,
  /\btechnical assessment\b/, /\bassessment link\b/,
];
const ASSESSMENT_LINK_HOSTS = ["hackerrank.com", "hackerrankforwork.com", "codesignal.com", "coderpad.io", "codility.com", "testgorilla.com", "hirevue.com", "mettl.com", "imocha.io"];
const APPLIED = [
  /\bthank(s| you) for (applying|your application|submitting your application)\b/,
  /\b(we|we ve|we have) received your application\b/, /\bapplication (has been )?received\b/,
  /\byour application (has been|was) (successfully )?submitted\b/, /\bsuccessfully (applied|submitted)\b/,
  /\bapplication confirmation\b/, /\bthank(s| you) for your interest in\b/, /\byou applied to\b/,
];

function linkHosts(links: string[]): string[] {
  return links.flatMap((href) => {
    try {
      return [new URL(href).hostname.toLowerCase()];
    } catch {
      return [];
    }
  });
}

/** "If your experience matches, we'll reach out to schedule an interview" is a
 * receipt, not an invitation: conditional sentences don't count as steps. */
const CONDITIONAL = /\b(if (your|you|we|selected|there|so)|should (your|you|we)|may (be )?(invite|invited|contact|reach)|will (reach out|contact|be in touch|let you know)|ll (reach out|be in touch|let you know)|in the event|once we|as soon as)\b/;

function withoutConditionals(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(words)
    .filter((sentence) => sentence !== "" && !CONDITIONAL.test(sentence))
    .join(" ");
}

export function detectStage(email: Pick<EmailContent, "subject" | "text" | "links">): DetectedStage | null {
  const source = `${email.subject}\n${email.text.slice(0, 20_000)}`;
  const everything = ` ${words(source)} `;
  const definite = ` ${withoutConditionals(source)} `;
  const any = (patterns: RegExp[], text: string) => patterns.some((pattern) => pattern.test(text));
  const hosts = linkHosts(email.links);
  const linksTo = (domains: string[]) => hosts.some((host) => domains.some((domain) => hostMatches(host, domain)));
  if (any(OFFER, everything)) return "offer";
  if (any(REJECTED, definite)) return "rejected";
  if (any(INTERVIEW, definite) || linksTo(INTERVIEW_LINK_HOSTS)) return "interview";
  if (any(ASSESSMENT, definite) || linksTo(ASSESSMENT_LINK_HOSTS)) return "assessment";
  if (any(APPLIED, everything)) return "applied";
  return null;
}
