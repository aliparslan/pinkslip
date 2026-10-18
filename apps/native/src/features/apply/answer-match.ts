import type { SavedApplicationAnswer } from "@pinkslip/domain/application-answers";

/**
 * Board 2's 2.3: above the keyboard, your saved answer for this kind of
 * question. A form asks "Why Stripe?" where your last one asked "Why do you
 * want to work at Datadog?", so answers are matched by kind, not by the exact
 * words. The answer is offered as you wrote it, to edit: nothing is invented
 * or rewritten (Decisions: Auto-apply #3).
 */
export type QuestionKind = "why_company" | "why_role" | "project" | "anything_else";

/** The card's title for each kind (Paper: "Why this company"). */
export const KIND_TITLES: Record<QuestionKind, string> = {
  why_company: "Why this company",
  why_role: "Why this role",
  project: "A project",
  anything_else: "Anything else",
};

const norm = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/** The kind of a question, from its wording. Null when it's none of them. */
export function questionKind(label: string, company?: string): QuestionKind | null {
  const text = norm(label).replace(/\s*[*✱]\s*$/, "");
  const name = company ? norm(company) : "";
  if (/\b(project|tell us about a time|describe a (time|situation|challenge)|something you('ve| have) built)\b/.test(text)) return "project";
  // "Why", or "what interests / excites / drew you".
  const asksWhy = /\bwhy\b|\b(interests|excites|attracts|drew) you\b/.test(text);
  if (asksWhy && /\b(role|position|team|this job)\b/.test(text)) return "why_role";
  if ((asksWhy && /\b(work|join|joining|interested|apply|company|us)\b/.test(text))
    || (name && /\bwhy\b/.test(text) && text.includes(name))
    // "Why Stripe?": a short why-question names the company.
    || /^why [\w&.\- ]{1,40}\??$/.test(text)) return "why_company";
  if (/\b(anything else|additional information|cover letter|what else should we know)\b/.test(text)) return "anything_else";
  return null;
}

const STOP = new Set(["the", "and", "you", "your", "are", "for", "with", "what", "how", "this", "that", "have", "about", "our", "please"]);
const words = (text: string) => new Set(norm(text).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((word) => word.length > 2 && !STOP.has(word)));

export interface AnswerSuggestion {
  /** The card's title: the kind, or the saved question itself. */
  title: string;
  answer: string;
  key: string;
}

/**
 * The newest saved answer of the same kind as this question, or, when the
 * question has no kind, one whose question shares most of its words. Only
 * written answers: a choice (a list) belongs to the dropdown it came from.
 */
export function suggestAnswer(label: string, answers: SavedApplicationAnswer[], company?: string): AnswerSuggestion | null {
  const written = answers.filter((answer): answer is SavedApplicationAnswer & { value: string } =>
    typeof answer.value === "string" && answer.value.trim().length > 0);
  const kind = questionKind(label, company);
  if (kind) {
    const same = written.find((answer) => questionKind(answer.label) === kind);
    return same ? { title: KIND_TITLES[kind], answer: same.value, key: same.key } : null;
  }
  const wanted = words(label);
  if (wanted.size === 0) return null;
  let best: { answer: SavedApplicationAnswer & { value: string }; score: number } | null = null;
  for (const answer of written) {
    const shared = [...words(answer.label)].filter((word) => wanted.has(word)).length;
    const score = shared / wanted.size;
    if (score >= 0.6 && (!best || score > best.score)) best = { answer, score };
  }
  return best ? { title: best.answer.label, answer: best.answer.value, key: best.answer.key } : null;
}
