import type { ResumeProfile } from "../../shared/resume-profile";

export interface DraftContext {
  profile: ResumeProfile;
  /** Account name, used when the resume has none. */
  accountName: string;
  contactName: string;
  jobTitle: string;
  companyName: string;
  now?: Date;
}

export interface DraftMessage {
  step: 0 | 1 | 2;
  subject: string;
  body: string;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

function graduationYear(endDate: string): number | null {
  const match = endDate.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function introLine(profile: ResumeProfile, name: string, now: Date): string {
  const school = profile.education[0];
  const field = school?.credentials.flatMap((credential) => credential.fieldsOfStudy)[0]?.trim();
  const opener = name ? `I'm ${name}` : "I'm reaching out";
  if (!school?.institution.trim()) return `${opener}.`;

  const year = graduationYear(school.endDate);
  if (year !== null && year < now.getUTCFullYear()) {
    return field
      ? `${opener}, a recent ${school.institution} graduate in ${field}.`
      : `${opener}, a recent ${school.institution} graduate.`;
  }
  const graduating = year !== null ? `, graduating in ${school.endDate.trim()}` : "";
  return field
    ? `${opener}, a ${field} student at ${school.institution}${graduating}.`
    : `${opener}, a student at ${school.institution}${graduating}.`;
}

function experienceLine(profile: ResumeProfile): string {
  const latest = profile.experience.find((entry) => entry.company.trim() && entry.title.trim());
  if (!latest) return "";
  const current = !latest.endDate.trim() || /present|current|now/i.test(latest.endDate);
  return current
    ? `I'm currently a ${latest.title} at ${latest.company}.`
    : `Most recently I was a ${latest.title} at ${latest.company}.`;
}

function signature(profile: ResumeProfile, name: string): string {
  const links = [profile.contact.linkedin, profile.contact.website || profile.contact.github]
    .map((link) => link.trim())
    .filter(Boolean);
  return [name, ...links].filter(Boolean).join("\n");
}

/** The first email and both follow-ups, drafted up front so the user can read
 * the whole sequence before sending anything. */
export function draftOutreachSequence(context: DraftContext): DraftMessage[] {
  const now = context.now ?? new Date();
  const name = context.profile.contact.name.trim() || context.accountName.trim();
  const greeting = `Hi ${firstName(context.contactName) || "there"},`;
  const sign = signature(context.profile, name);
  const subject = name ? `${context.jobTitle} — ${name}` : `Interested in the ${context.jobTitle} role`;
  const reply = `Re: ${subject}`;

  const thanks = (closing: string, signed: string) => [closing, signed].filter(Boolean).join("\n");
  const paragraphs = (...blocks: string[]) => blocks.filter(Boolean).join("\n\n");

  const first = paragraphs(
    greeting,
    [
      introLine(context.profile, name, now),
      `I applied for the ${context.jobTitle} role at ${context.companyName} and wanted to reach out directly.`,
      experienceLine(context.profile),
    ].filter(Boolean).join(" "),
    "Would you be open to a quick chat, or pointing me to the right person on the team?",
    thanks("Thanks,", sign),
  );
  const followUp = paragraphs(
    greeting,
    `I wanted to follow up on my note about the ${context.jobTitle} role. I'm still very interested and happy to send anything that would help.`,
    thanks("Thanks,", name),
  );
  const lastFollowUp = paragraphs(
    greeting,
    `Checking in one last time about the ${context.jobTitle} role. If someone else is the better person to talk to, I'd be grateful for a pointer.`,
    thanks("Thanks again,", name),
  );

  return [
    { step: 0, subject, body: first },
    { step: 1, subject: reply, body: followUp },
    { step: 2, subject: reply, body: lastFollowUp },
  ];
}
