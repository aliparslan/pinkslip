import type { ResumeProfile } from "../../shared/resume-profile";
import type { WorkAuthorization } from "../../shared/search-profile";
import type {
  ApplicationAnswerSource,
  ApplicationAnswerValue,
  ApplicationField,
  ApplicationFieldSection,
  ApplicationFieldType,
  PreparedApplicationField,
} from "../../shared/application-form";
import { isAnswered } from "../../shared/application-form";

/** Keys filled from the resume. Everything else comes from saved answers. */
const ABOUT_KEYS = new Set([
  "first_name", "last_name", "full_name", "preferred_name", "email", "phone",
  "location", "linkedin", "github", "website", "resume", "cover_letter",
  "school", "degree", "discipline", "graduation", "gpa",
  "current_company", "current_title",
]);

/** Asked the same way everywhere, so one saved answer serves every form. */
const YES_NO_KEYS = new Set(["work_authorization", "sponsorship", "relocation", "over_18"]);

const YES_NO_TOPICS = [/sponsor/i, /authori[sz]|eligible to work|right to work/i, /relocat/i];
/** Sponsorship matches only "Will/Do you require sponsorship…", which reads
 * the same even when it names work authorization as the reason. */
const TOPIC_GUARDED_KEYS = new Set(["work_authorization", "relocation"]);

const DECLINE = /decline|don.?t wish|do not wish|prefer not|not to (say|answer|disclose)|choose not|rather not/i;

const SYSTEM_KEYS: Record<string, string> = {
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  phone: "phone",
  resume: "resume",
  cover_letter: "cover_letter",
  location: "location",
  gender: "gender",
  race: "race",
  hispanic_ethnicity: "hispanic",
  veteran_status: "veteran",
  disability_status: "disability",
  _systemfield_name: "full_name",
  _systemfield_email: "email",
  _systemfield_phone: "phone",
  _systemfield_resume: "resume",
  _systemfield_location: "location",
  _systemfield_eeoc_gender: "gender",
  _systemfield_eeoc_race: "race",
  _systemfield_eeoc_veteran_status: "veteran",
  _systemfield_eeoc_disability_status: "disability",
};

const LABEL_KEYS: Array<[RegExp, string]> = [
  [/^(legal |full )?name\b/i, "full_name"],
  [/preferred (first )?name/i, "preferred_name"],
  [/full legal name|legal full name/i, "full_name"],
  [/^(legal )?first name/i, "first_name"],
  [/^(legal )?last name|^surname|family name/i, "last_name"],
  [/^e-?mail/i, "email"],
  [/^(mobile |cell )?phone/i, "phone"],
  [/linkedin/i, "linkedin"],
  [/github/i, "github"],
  [/website|portfolio|personal (site|page)/i, "website"],
  [/^resume|^cv\b/i, "resume"],
  [/cover letter/i, "cover_letter"],
  // Only the plain wordings: "Do you require sponsorship?" and "Are you
  // authorized to work?". A question that mixes the two, or flips one ("you
  // must already be authorized; no sponsorship"), answers differently and
  // stays specific to its form.
  [/^(?!.*\b(without|not|no)\b)(will|do|would|are|is) you\b.{0,60}\b(require|need)\b.{0,80}sponsor/i, "sponsorship"],
  [/^(?!.*sponsor).*(authori[sz]ed to work|eligible to work|work authori[sz]ation|right to work)/i, "work_authorization"],
  [/\b(open|willing|able|plan(ning)?)\b.{0,20}relocat/i, "relocation"],
  [/(at least|over) 18|18 years|18\+|18 or older/i, "over_18"],
  [/earliest.*start|start date|available to start|when can you start|start-date/i, "start_date"],
  [/how did you (first )?(hear|find|learn)|where did you (first )?(hear|find|learn)|hear about|learn(ed)? about (this|the|us)|brought you to/i, "how_heard"],
  [/pronoun/i, "pronouns"],
  [/current ?(or|\/) ?(most recent |previous |last )?(company|employer)|current (company|employer)|(most recent|last) (company|employer)/i, "current_company"],
  [/current ?(or|\/) ?(most recent |previous |last )?(job )?title|current (job )?title|(most recent|last) (job )?title/i, "current_title"],
  [/\bgpa\b|grade point/i, "gpa"],
  [/graduat/i, "graduation"],
  [/school|university|college|institution/i, "school"],
  [/^degree|degree (type|level)|highest (level of )?education/i, "degree"],
  [/major|discipline|field of study|area of study/i, "discipline"],
  [/where are you (currently )?(located|based)|current (location|city)|^(location|city)\b|city.*(live|reside)/i, "location"],
];

const VOLUNTARY_KEYS: Array<[RegExp, string]> = [
  [/lgbt|sexual orientation/i, "orientation"],
  [/transgender/i, "transgender"],
  [/hispanic|latin[oxa]/i, "hispanic"],
  [/\bgender\b|\byour sex\b|^sex\b/i, "gender"],
  [/\brace\b|racial|ethnic/i, "race"],
  [/veteran/i, "veteran"],
  [/disabilit/i, "disability"],
];

export function normalizeQuestion(label: string): string {
  return label
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 200);
}

const CHOICE_TYPES = new Set<ApplicationFieldType>(["select", "multiselect", "boolean"]);

/** The key for this exact question, used when its answer can't be shared. */
export function questionKey(field: Pick<ApplicationField, "id" | "label">): string {
  const question = normalizeQuestion(field.label.replace(/^\(optional\)\s*/i, ""));
  return question ? `q:${question}` : `field:${field.id}`;
}

/** Where to save an answer: the shared key, unless it's a yes/no key and the
 * user picked something other than yes or no, which only fits this form. */
export function storageKey(field: ApplicationField, stored: ApplicationAnswerValue): string {
  if (YES_NO_KEYS.has(field.key) && stored !== "yes" && stored !== "no") return questionKey(field);
  return field.key;
}

/** The resume fact a question asks for, judged by its wording alone, so a
 * long dropdown of schools or countries can be matched against the resume. */
export function resumeKeyForLabel(label: string): string | null {
  const cleaned = label.replace(/^\(optional\)\s*/i, "").trim();
  if (/^country\b|country of residence|which country|country\/region/i.test(cleaned)) return "country";
  if (/^state\b|\b(state|province)\b.*\b(reside|live|located|based)\b|state of residence/i.test(cleaned)) return "state";
  const match = LABEL_KEYS.find(([pattern]) => pattern.test(cleaned))?.[1];
  return match && ABOUT_KEYS.has(match) ? match : null;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** "Austin, TX" or "Austin, Texas" → "Texas". */
function stateName(location: string): string {
  for (const part of location.split(",").map((piece) => piece.trim())) {
    const upper = part.toUpperCase();
    if (STATE_NAMES[upper]) return STATE_NAMES[upper];
    const full = Object.values(STATE_NAMES).find((name) => name.toLowerCase() === part.toLowerCase());
    if (full) return full;
  }
  return "";
}

const US_STATE = /\b(A[LKZR]|C[AOT]|DE|DC|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])\b|united states|\busa?\b/i;

/** A place in the US: a state's code or name, or the country. */
export function inUnitedStates(place: string): boolean {
  return Boolean(stateName(place)) || US_STATE.test(place);
}

export function answerKey(
  fieldId: string,
  label: string,
  type: ApplicationFieldType,
  voluntary = false,
): string {
  const system = SYSTEM_KEYS[fieldId];
  if (system) return system;
  const cleaned = label.replace(/^\(optional\)\s*/i, "").trim();
  const question = normalizeQuestion(cleaned);
  const custom = question ? `q:${question}` : `field:${fieldId}`;
  // "Other website" is a second link, not the same one again.
  if (/^other\b/i.test(cleaned)) return custom;
  const match = (voluntary ? VOLUNTARY_KEYS : LABEL_KEYS).find(([pattern]) => pattern.test(cleaned))?.[1];
  if (!match) return custom;
  // A yes/no key only fits a choice, and a resume key only fits free text:
  // "If you'd need to relocate, where?" is not the relocation question.
  if (YES_NO_KEYS.has(match) && !CHOICE_TYPES.has(type)) return custom;
  // A question that touches two of these can mean either, so a saved yes/no
  // could answer it backwards. The user answers it on its own.
  if (TOPIC_GUARDED_KEYS.has(match) && YES_NO_TOPICS.filter((topic) => topic.test(cleaned)).length > 1) return custom;
  if (ABOUT_KEYS.has(match) && CHOICE_TYPES.has(type)) return custom;
  return match;
}

export function sectionFor(key: string, voluntary: boolean): ApplicationFieldSection {
  if (voluntary) return "voluntary";
  return ABOUT_KEYS.has(key) ? "about" : "questions";
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function displayDegree(value: string | undefined): string {
  if (!value) return "";
  const names: Record<string, string> = {
    high_school: "High school",
    associate: "Associate's",
    bachelor: "Bachelor's",
    master: "Master's",
    doctorate: "Doctorate",
    professional: "Professional",
    certificate: "Certificate",
  };
  return names[value] ?? "";
}

/** What the resume says for a standard key, or "" when it doesn't say. */
export function resumeAnswer(profile: ResumeProfile, key: string): string {
  const { first, last } = splitName(profile.contact.name);
  const school = profile.education[0];
  const credential = school?.credentials[0];
  const job = profile.experience.find((entry) => entry.company.trim());
  switch (key) {
    case "first_name":
    case "preferred_name": return first;
    case "last_name": return last;
    case "full_name": return profile.contact.name.trim();
    case "email": return profile.contact.email.trim();
    case "phone": return profile.contact.phone.trim();
    case "location": return profile.contact.location.trim();
    case "linkedin": return profile.contact.linkedin.trim();
    case "github": return profile.contact.github.trim();
    case "website": return (profile.contact.website || profile.contact.github).trim();
    case "resume": return profile.contact.name.trim() ? "Your resume" : "";
    case "school": return school?.institution.trim() ?? "";
    case "degree": return displayDegree(credential?.degreeType);
    case "discipline": return credential?.fieldsOfStudy[0]?.trim() ?? "";
    case "graduation": return school?.endDate.trim() ?? "";
    case "gpa": return school?.gpa?.trim() ?? "";
    case "current_company": return job?.company.trim() ?? "";
    case "current_title": return job?.title.trim() ?? "";
    case "country": return US_STATE.test(profile.contact.location) ? "United States" : "";
    case "state": return stateName(profile.contact.location);
    default: return "";
  }
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const SYNONYMS: Record<string, string[]> = {
  male: ["man"],
  man: ["male"],
  female: ["woman"],
  woman: ["female"],
};

/** Maps a stored answer onto one of the field's options: yes/no and
 * "decline" by meaning, everything else by label. */
function matchOption(field: ApplicationField, stored: string): string | null {
  const options = field.options.map((option) => option.label);
  if (stored === "yes") return options.find((label) => /^yes\b/i.test(label)) ?? null;
  if (stored === "no") return options.find((label) => /^no\b/i.test(label)) ?? null;
  if (stored === "decline") return options.find((label) => DECLINE.test(label)) ?? null;
  const exact = options.find((label) => sameText(label, stored));
  if (exact) return exact;
  const alternates = SYNONYMS[stored.trim().toLowerCase()] ?? [];
  const synonym = options.find((label) => alternates.some((alternate) => sameText(label, alternate)));
  if (synonym) return synonym;
  // The same answer worded shorter or longer: "He/him/his" and "He/Him".
  // Only when exactly one option fits.
  const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = words(stored);
  const near = options.filter((label) => {
    const option = words(label);
    return option !== "" && target !== "" && (option.startsWith(`${target} `) || target.startsWith(`${option} `));
  });
  return near.length === 1 ? near[0] : null;
}

function fitToField(field: ApplicationField, stored: ApplicationAnswerValue): ApplicationAnswerValue | null {
  if (field.type === "select" || field.type === "boolean") {
    const value = Array.isArray(stored) ? stored[0] : stored;
    return value === undefined ? null : matchOption(field, value);
  }
  if (field.type === "multiselect") {
    const values = (Array.isArray(stored) ? stored : [stored])
      .map((value) => matchOption(field, value))
      .filter((value): value is string => value !== null);
    return values.length > 0 ? [...new Set(values)] : null;
  }
  if (field.type === "date") {
    const value = Array.isArray(stored) ? stored[0] : stored;
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }
  return Array.isArray(stored) ? stored.join(", ") : stored;
}

/** Turns what the user picked into what gets saved, so it carries over to
 * forms that word the options differently. */
export function storedAnswer(field: ApplicationField, value: ApplicationAnswerValue): ApplicationAnswerValue {
  const canonical = (label: string) => {
    if (YES_NO_KEYS.has(field.key) || field.type === "boolean") {
      if (/^yes\b/i.test(label)) return "yes";
      if (/^no\b/i.test(label)) return "no";
    }
    if (field.section === "voluntary" && DECLINE.test(label)) return "decline";
    return label.trim();
  };
  return Array.isArray(value) ? value.map(canonical) : canonical(value);
}

/** What job preferences already say about work authorization. "Not sure"
 * says nothing, and needing sponsorship doesn't settle current authorization. */
export function impliedAnswers(workAuthorization: WorkAuthorization | null): Map<string, ApplicationAnswerValue> {
  if (workAuthorization === "authorized") return new Map([["work_authorization", "yes"], ["sponsorship", "no"]]);
  if (workAuthorization === "sponsorship") return new Map([["sponsorship", "yes"]]);
  return new Map();
}

/** Choices for "How did you hear about us?", best first. Pinkslip lists jobs
 * from many employers, so "job board" is the honest answer. */
const HOW_HEARD_PREFERENCES = [
  /job board|job site|job search/i,
  /online|internet/i,
  /career(s)? (page|site)|company website|website/i,
  /other/i,
];
/** Options that would claim a connection the user may not have. */
const HOW_HEARD_EXCLUDED = /internal|employee|referr|friend|colleague|recruiter|event|fair|universit|school|grow\b/i;

/** Asks the applicant to acknowledge a document or give a routine consent. */
const ACKNOWLEDGEMENT = /acknowledg|privacy|arbitration|terms (of|and)|polic(y|ies)|\bconsent\b|\bi (agree|understand|certify|attest)\b|agree to|read and understood|accurate and complete|double.?check/i;
/** Wording strong enough to count even when phrased as a question. */
const EXPLICIT_ACKNOWLEDGEMENT = /acknowledg|\bconsent\b|privacy|arbitration/i;
const FACTUAL_QUESTION = /^(are|do|did|have|has|is|was|were|will|would|can|could)\b/i;
/** Statements about the applicant's legal status or history are never a formality. */
const NEVER_ASSUMED = /citizen|permanent resident|asylee|refugee|export|itar|convict|indict|criminal|sanction|ineligible|non.?compete|non.?solicit|post.?employment|restrict|relationship|employed by|worked (for|at)/i;
const AFFIRMATIVE = /^(yes\b|i (acknowledge|agree|understand|confirm|consent|accept|certify|attest|have (read|reviewed))|acknowledge|agree|accept|confirm|understood)/i;

export function isAcknowledgement(label: string): boolean {
  if (!ACKNOWLEDGEMENT.test(label) || NEVER_ASSUMED.test(label)) return false;
  return !FACTUAL_QUESTION.test(label) || EXPLICIT_ACKNOWLEDGEMENT.test(label);
}

/** Consent to more than the application: other roles, a talent community,
 * texts, marketing, keeping the resume. Never given unless the form
 * requires it to apply (Spotify's was ticked in phase 0). */
const OPTIONAL_CONSENT = /future (job |career |employment )?(opportunit|role|position|opening|vacanc|recruit)|other (job |open )?(roles|positions|opportunit|openings|vacancies)|talent (community|network|pool|pipeline)|newsletter|marketing|promotion|\b(text|sms) (messages?|alerts?|updates?)\b|\bsms\b|keep me (informed|updated|posted)|stay in touch|contact(ed)? me (about|regarding|for)|send me|subscribe|(retain|keep|store) (my|your) (data|information|details|application|resume|cv) (for|to)/i;
const DECLINE_CONSENT = /^(no\b|i do not|i don'?t|do not|don'?t|decline|opt.?out|not (now|interested)|no thanks)/i;

export function isOptionalConsent(label: string): boolean {
  return OPTIONAL_CONSENT.test(label);
}

/** An answer Pinkslip can pick without asking: the only option, a
 * confirmation, how the user found the job, or declining a voluntary survey
 * or an optional consent. */
export function defaultAnswer(field: ApplicationField): ApplicationAnswerValue | null {
  const choice = field.type === "select" || field.type === "multiselect" || field.type === "boolean";
  if (field.section === "voluntary") return fitToField(field, "decline");
  if (choice && isOptionalConsent(field.label)) {
    const decline = field.options.find((candidate) => DECLINE_CONSENT.test(candidate.label));
    if (decline) return field.type === "multiselect" ? null : decline.label;
    if (!field.required) return null;
  }
  if (choice && field.options.length === 1) {
    return field.type === "multiselect" ? [field.options[0].label] : field.options[0].label;
  }
  if (field.key === "how_heard") {
    if (!choice) return "Job board";
    for (const preference of HOW_HEARD_PREFERENCES) {
      const option = field.options.find((candidate) =>
        preference.test(candidate.label) && !HOW_HEARD_EXCLUDED.test(candidate.label));
      if (option) return field.type === "multiselect" ? [option.label] : option.label;
    }
    return null;
  }
  if (choice && isAcknowledgement(field.label)) {
    const option = field.options.find((candidate) => AFFIRMATIVE.test(candidate.label));
    if (option) return field.type === "multiselect" ? [option.label] : option.label;
  }
  return null;
}

export function prepareFields(
  fields: ApplicationField[],
  profile: ResumeProfile,
  saved: Map<string, ApplicationAnswerValue>,
  implied: Map<string, ApplicationAnswerValue> = new Map(),
): PreparedApplicationField[] {
  return fields.map((field) => {
    const fill = (value: ApplicationAnswerValue | null, source: ApplicationAnswerSource) =>
      isAnswered(value) ? { ...field, answer: value, source } : null;

    const own = field.key === questionKey(field) ? undefined : saved.get(questionKey(field));
    const stored = own ?? saved.get(field.key);
    const fromSaved = stored !== undefined ? fill(fitToField(field, stored), "saved") : null;
    if (fromSaved) return fromSaved;

    const impliedValue = implied.get(field.key);
    const fromProfile = impliedValue !== undefined ? fill(fitToField(field, impliedValue), "profile") : null;
    if (fromProfile) return fromProfile;

    const fromResume = ABOUT_KEYS.has(field.key)
      ? fill(fitToField(field, resumeAnswer(profile, field.key)), "resume")
      : null;
    if (fromResume) return fromResume;

    return fill(defaultAnswer(field), "default") ?? { ...field, answer: null, source: null };
  });
}

/** A resume fact, or else the applicant's own answer to it on an earlier
 * form: a GPA the resume leaves off, a city typed once. Country and state
 * come from wherever the location does (owner, 2026-11-04: a tester gave his
 * country four ways because his resume has no city). */
export function knownAnswer(profile: ResumeProfile, saved: Map<string, ApplicationAnswerValue>, key: string): string {
  const fromResume = resumeAnswer(profile, key);
  if (fromResume) return fromResume;
  const own = (name: string) => {
    const value = saved.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  if (key === "country" || key === "state") {
    const location = profile.contact.location.trim() || own("location");
    if (key === "state") return stateName(location);
    return US_STATE.test(location) ? "United States" : "";
  }
  return ABOUT_KEYS.has(key) ? own(key) : "";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** The months a season covers, for graduation: spring ends in May or June,
 * fall in December. */
const SEASONS: Record<string, [number, number]> = { winter: [0, 1], spring: [2, 5], summer: [6, 7], fall: [8, 11], autumn: [8, 11] };

/** "May 2025", "Spring 2027" or "2026" as a span of months, inclusive. */
function monthSpan(text: string): [number, number] | null {
  const year = Number(text.match(/\b(19|20)\d{2}\b/)?.[0]);
  if (!year) return null;
  const word = text.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(19|20)\d{2}\b|\b(winter|spring|summer|fall|autumn)\s+(19|20)\d{2}\b/);
  if (word?.[1]) {
    const month = year * 12 + MONTHS.indexOf(word[1]);
    return [month, month];
  }
  if (word?.[3]) {
    const [from, to] = SEASONS[word[3]]!;
    return [year * 12 + from, year * 12 + to];
  }
  return [year * 12, year * 12 + 11];
}

/** What a date choice covers: "Earlier than Fall 2026", "Fall 2027 or
 * later", "Dec 2025 – May 2026", or one term. */
function dateRange(option: string): [number, number] | null {
  const parts = option.split(/\s+(?:-|–|—|to|through)\s+/i);
  if (parts.length === 2) {
    const from = monthSpan(parts[0]!);
    const to = monthSpan(parts[1]!);
    return from && to ? [from[0], to[1]] : null;
  }
  const span = monthSpan(option);
  if (!span) return null;
  if (/\b(earlier than|before|prior to)\b/i.test(option)) return [-Infinity, span[0] - 1];
  if (/\bor (later|after)\b|\b(after)\b|\band (later|beyond)\b|\+/i.test(option)) {
    return /\bafter\b/i.test(option) && !/\bor after\b/i.test(option) ? [span[1] + 1, Infinity] : [span[0], Infinity];
  }
  return span;
}

/** What a GPA choice covers on a 4.0 scale: "3.1 - 3.3", "3.6 or above",
 * "2.4 or below". Percentages and other scales don't count. */
function gpaRange(option: string): [number, number] | null {
  if (/%|out of (5|10|100)|\/ ?(5|10|100)\b/i.test(option)) return null;
  const text = option.replace(/\(?\s*(out of|on a|\/)\s*4(\.0+)?(\s*scale)?\s*\)?/gi, " ");
  const numbers = [...text.matchAll(/\b[0-4](?:\.\d{1,2})?\b/g)].map((match) => Number(match[0]));
  const [low, high] = numbers;
  if (low === undefined) return null;
  if (high !== undefined && /\d\s*(?:-|–|—|to)\s*\d/.test(text)) return [low, high];
  if (/or (above|higher|more|greater)|\babove\b|\bover\b|\+|>/i.test(text)) return [low, Infinity];
  if (/or (below|lower|less)|\bbelow\b|\bunder\b|<|less than/i.test(text)) return [-Infinity, low];
  return null;
}

/** The one choice whose range holds a known date or GPA ("May 2025" is
 * "Earlier than Fall 2026"; 3.7 is "3.6 or above"), or null when none or
 * several do. */
export function rangeOption(options: string[], key: string, fact: string): string | null {
  if (key === "graduation") {
    const span = monthSpan(fact.replace(/^expected\s+/i, ""));
    if (!span) return null;
    const fits = options.filter((option) => {
      const range = dateRange(option);
      return range !== null && range[0] <= span[0] && span[1] <= range[1];
    });
    return fits.length === 1 ? fits[0]! : null;
  }
  if (key === "gpa") {
    const value = Number(fact.match(/\b[0-4](?:\.\d{1,3})?\b/)?.[0]);
    if (!Number.isFinite(value) || /\/ ?(5|10|100)\b|%/.test(fact)) return null;
    const fits = options.filter((option) => {
      const range = gpaRange(option);
      return range !== null && range[0] <= value && value <= range[1];
    });
    return fits.length === 1 ? fits[0]! : null;
  }
  return null;
}

const COUNTRY_NAMES: Record<string, string[]> = {
  "united states": ["united states", "united states of america", "usa", "us", "u s", "u s a", "america"],
};

/**
 * The choice for where the applicant lives, from the most specific match
 * down: the city ("Chicago Metro"), the state ("US - Texas"), then the
 * country ("United States +1", "USA", "US - Other").
 */
export function placeOption(options: string[], location: string, country: string): string | null {
  const words = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  // "Dallas, TX" names a city; "Illinois" alone doesn't.
  const first = location.includes(",") ? location.split(",")[0]!.trim() : "";
  const city = first && !stateName(first) ? first : "";
  const state = stateName(location);
  const names = COUNTRY_NAMES[country.toLowerCase()] ?? (country ? [country.toLowerCase()] : []);
  const inCountry = (option: string) => names.some((name) => words(option).includes(` ${name} `));
  const only = (found: string[]) => (found.length === 1 ? found[0]! : null);

  if (state) {
    const stateOptions = options.filter((option) => words(option).includes(` ${state.toLowerCase()} `));
    const withCity = city ? stateOptions.filter((option) => words(option).includes(` ${city.toLowerCase()} `)) : [];
    const picked = only(withCity) ?? (stateOptions.length > 1 && city
      // "Chicago Metro" and "Chicago Non-Metro": a city named is the metro.
      ? only(stateOptions.filter((option) => !/\bnon.?metro\b/i.test(option) && words(option).includes(` ${city.toLowerCase()} `)))
      : only(stateOptions));
    if (picked) return picked;
    if (stateOptions.length > 0) return null;
  }
  if (!names.length) return null;
  const exact = options.filter((option) => names.includes(words(option).trim()) || names.some((name) => words(option).startsWith(` ${name} `) && !/ - /.test(option)));
  if (exact.length === 1) return exact[0]!;
  // A list of regions with one catch-all for the country: "US - Other".
  return only(options.filter((option) => inCountry(option) && /\bother\b/i.test(option)));
}

/** Specific statuses an option may claim; being authorized doesn't say which. */
const SPECIFIC_STATUS = /citizen|permanent resident|green card|\bvisa\b|\bh-?1b\b|\bopt\b|\bstem\b|\bf-?1\b|\btn\b|\bead\b|asylee|refugee/i;
const UNSURE = /unknown|not sure|unsure|prefer not|don.?t know/i;
const NEEDS_SPONSOR = /\b(require|requires|need|needs|needing|requiring)\b.{0,50}\b(sponsor\w*|renewal)\b/i;
const NEGATED = /\b(do not|don.?t|does not|doesn.?t|will not|won.?t|never|no longer|without|not)\b/i;
const AUTHORIZED = /\b(am|are|is)\b.{0,20}\b(legally )?(authori[sz]ed|eligible|permitted|allowed)\b.{0,10}\bto work\b/i;

/**
 * For someone authorized to work in the US who needs no sponsorship, the
 * sentence choice that says so, when a work-authorization question words its
 * choices as statements (Intercom's "I am authorised to work in the country
 * which this role is located (citizen, permanent resident etc)"). Only for a
 * US role, only one plain statement of authorization, never one that claims
 * a particular status.
 */
export function workStatusOption(label: string, options: string[], authorizedWithoutSponsorship: boolean, usRole: boolean): string | null {
  if (!authorizedWithoutSponsorship || !usRole) return null;
  if (!YES_NO_TOPICS.slice(0, 2).some((topic) => topic.test(label))) return null;
  // Plain Yes and No go by the saved yes/no answers instead.
  if (options.length < 2 || options.every((option) => /^(yes|no)\.?$/i.test(option.trim()))) return null;
  const fits = options.filter((option) => {
    // "(citizen, permanent resident etc)" gives examples; it claims nothing.
    const plain = option.replace(/\([^)]*\)/g, " ").trim();
    if (UNSURE.test(plain) || SPECIFIC_STATUS.test(plain)) return false;
    const sponsorship = NEEDS_SPONSOR.test(plain);
    if (sponsorship && !NEGATED.test(plain)) return false;
    const authorized = AUTHORIZED.test(plain) && !/\bnot\b.{0,20}\b(authori[sz]ed|eligible|permitted|allowed)\b/i.test(plain);
    // "I am authorized to work…" or "I won't need sponsorship".
    return authorized || sponsorship;
  });
  return fits.length === 1 ? fits[0]! : null;
}
