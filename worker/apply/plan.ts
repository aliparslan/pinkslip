import { getUserProfile } from "../account";
import { aiBudgetStatus } from "../ai-budget";
import type { Env } from "../types";
import type { ResumeProfile } from "../../shared/resume-profile";
import type { WorkAuthorization } from "../../shared/search-profile";
import type {
  ApplicationAnswerValue,
  ApplicationField,
  ApplicationFieldType,
  ApplyPlan,
  FillStep,
  FormControl,
  FormControlKind,
} from "../../shared/application-form";
import {
  answerKey,
  impliedAnswers,
  isAcknowledgement,
  prepareFields,
  resumeAnswer,
  resumeKeyForLabel,
  sectionFor,
  storageKey,
  storedAnswer,
} from "./answers";
import { acceptedJevAnswer, answerWithJev, type JevQuestion } from "./jev-answers";
import type { JevRunner } from "../jev";
import { preferredWorkAuthorization, savedAnswers } from "./prepare";

const VOLUNTARY = /gender|\brace\b|racial|ethnic|hispanic|latin[oxa]|veteran|disabilit|lgbt|sexual orientation|transgender/i;
const CHOICE_KINDS = new Set<FormControlKind>(["select", "combobox", "radio", "buttons", "checkboxes"]);
/** Longer option lists (every university, every country) aren't worth asking Jev. */
const MAX_JEV_OPTIONS = 40;

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The option a resume fact most plausibly means: "UT Austin" style
 * abbreviations aside, schools and degrees differ mostly by prefixes. */
export function fuzzyOption(options: string[], fact: string): string | null {
  const target = norm(fact).replace(/^the /, "");
  if (!target) return null;
  const labelled = options.map((option) => [option, norm(option).replace(/^the /, "")] as const);
  const found = labelled.find(([, label]) => label === target)
    ?? labelled.find(([, label]) => label.startsWith(target) || target.startsWith(label))
    ?? labelled.find(([, label]) => label.includes(target) || (label.length > 3 && target.includes(label)));
  return found?.[0] ?? null;
}

const WORKED_THERE = /\b(worked|employed|interned)\s+(at|for|by|with)\b|\b(employee|intern|contractor)\s+(of|at|for|with)\b|\b(current|former|previous)\s+(or\s+(current|former)\s+)?(employee|intern|contractor)\b|\bworked here\b/i;
const NOT_ABOUT_APPLICANT = /relative|family|friend|spouse|partner|related|know (any|some)one|refer|applied|interview|products?|technolog|platform/i;
const NEGATIVE = /^\s*no\b|\b(not|never|haven'?t)\b/i;
const EVASIVE = /prefer not|not to (say|answer|disclose)|decline|not listed/i;

/** "Have you worked at Affirm before?" The resume lists every employer, so
 * when the company isn't on it the answer is no. When it is, the kind of
 * employment is Jev's to pick. */
export function formerEmployerAnswer(control: FormControl, profile: ResumeProfile, company: string): string | null {
  const name = norm(company);
  const label = control.label.trim();
  if (!name || control.kind === "checkbox" || control.kind === "file") return null;
  if (!WORKED_THERE.test(label) || NOT_ABOUT_APPLICANT.test(label)) return null;
  if (!/^(have|are|were|did)\b/i.test(label) && !/\b(current|former|previous)\b/i.test(label)) return null;
  if (!` ${norm(label)} `.includes(` ${name} `) && !/\b(for|with|at|by) (us|our company|this company)\b|\bhere\b/i.test(label)) return null;
  // Without a resume there's no employer list to trust.
  if (profile.experience.length === 0 && profile.education.length === 0) return null;
  const employers = profile.experience.map((entry) => norm(entry.company)).filter(Boolean);
  if (employers.some((employer) => employer === name || employer.startsWith(`${name} `) || name.startsWith(`${employer} `))) return null;
  if (control.options.length === 0) return CHOICE_KINDS.has(control.kind) ? null : "No";
  return control.options.find((option) => NEGATIVE.test(option) && !EVASIVE.test(option)) ?? null;
}

/** How a page control maps onto the answer rules written for ATS forms. */
export function fieldForControl(control: FormControl): ApplicationField {
  const choice = CHOICE_KINDS.has(control.kind) && control.options.length > 0;
  const yesNo = control.options.length === 2 && control.options.every((option) => /^(yes|no)\b/i.test(option));
  const type: ApplicationFieldType = control.kind === "checkboxes"
    ? "multiselect"
    : choice
      ? (control.kind === "buttons" && yesNo ? "boolean" : "select")
      : control.kind === "tel"
        ? "phone"
        : control.kind === "combobox"
          ? (/location|city|address/i.test(control.label) ? "location" : "text")
          : control.kind === "checkbox"
            ? "boolean"
            : control.kind === "radio" || control.kind === "buttons" || control.kind === "select"
              ? "select"
              : control.kind;
  const voluntary = VOLUNTARY.test(control.label);
  const key = answerKey(control.ref, control.label, type, voluntary);
  return {
    id: control.ref,
    label: control.label,
    type,
    required: control.required,
    options: control.options.map((label) => ({ label, value: label })),
    section: sectionFor(key, voluntary),
    key,
  };
}

function describeWorkAuthorization(value: WorkAuthorization | null): string {
  if (value === "authorized") return "Authorized to work in the US; does not need visa sponsorship now or later.";
  if (value === "sponsorship") return "Needs visa sponsorship to work in the US.";
  return "Not stated.";
}

/** Everything Jev may rely on, written as plain facts. */
export function applicantFacts(input: {
  profile: ResumeProfile;
  name: string;
  workAuthorization: WorkAuthorization | null;
  answered: Array<{ label: string; value: ApplicationAnswerValue }>;
  job: { title: string; company: string; location: string } | null;
}): string {
  const { profile } = input;
  const education = profile.education.map((entry) => {
    const credential = entry.credentials[0];
    const degree = [credential?.degreeType?.replace(/_/g, " "), credential?.fieldsOfStudy.join(" and ")].filter(Boolean).join(" in ");
    return `${degree || "Studies"} at ${entry.institution} (${[entry.startDate, entry.endDate].filter(Boolean).join(" to ")})`
      + (entry.gpa ? `, GPA ${entry.gpa}` : "");
  });
  const work = profile.experience
    .filter((entry) => entry.company.trim())
    .map((entry) => `${entry.title} at ${entry.company} (${[entry.startDate, entry.endDate || "present"].filter(Boolean).join(" to ")})`);
  const lines = [
    "Applicant facts:",
    `Name: ${profile.contact.name || input.name || "Not stated"}`,
    `Lives in: ${profile.contact.location || "Not stated"}`,
    `Education: ${education.join("; ") || "Not stated"}`,
    `Every employer the applicant has worked for: ${work.join("; ") || "none listed"}`,
    `Work authorization: ${describeWorkAuthorization(input.workAuthorization)}`,
  ];
  if (input.answered.length > 0) {
    lines.push("Answers the applicant gave on earlier applications:");
    for (const { label, value } of input.answered.slice(0, 40)) {
      lines.push(`- ${label.slice(0, 200)}: ${Array.isArray(value) ? value.join(", ") : value}`);
    }
  }
  if (input.job) lines.push(`Applying to: ${input.job.title} at ${input.job.company}${input.job.location ? ` (${input.job.location})` : ""}.`);
  return lines.join("\n");
}

async function answeredLabels(db: D1Database, userId: string) {
  const rows = await db.prepare(
    `SELECT label, value_json FROM application_answers WHERE user_id = ? ORDER BY updated_at DESC LIMIT 40`
  ).bind(userId).all<{ label: string; value_json: string }>();
  return (rows.results ?? []).flatMap((row) => {
    try {
      return [{ label: row.label, value: JSON.parse(row.value_json) as ApplicationAnswerValue }];
    } catch {
      return [];
    }
  });
}

/** Adds to the month's AI spend without touching the shadow classifier's call quota. */
async function recordAiSpend(db: D1Database, now: Date, costUsd: number) {
  if (!(costUsd > 0)) return;
  await db.prepare(
    `INSERT INTO classification_daily_budget (day, calls, reported_cost_usd) VALUES (?, 0, ?)
     ON CONFLICT(day) DO UPDATE SET reported_cost_usd = reported_cost_usd + excluded.reported_cost_usd`
  ).bind(now.toISOString().slice(0, 10), costUsd).run();
}

function isEmpty(value: FormControl["value"]): boolean {
  return value === null || (Array.isArray(value) ? value.length === 0 : value.trim() === "");
}

/**
 * Works out how to fill a page: rules and saved answers first, then resume
 * facts matched against long dropdowns, then Jev for the multiple-choice
 * questions left. Anything without a confident answer goes to `needs`.
 * Controls that already hold a value are left alone.
 */
export async function planApplication(
  env: Env,
  userId: string,
  input: { jobId: string | null; controls: FormControl[] },
  ai: JevRunner | undefined = env.AI as unknown as JevRunner | undefined,
  now = new Date(),
): Promise<ApplyPlan & { cost_usd: number }> {
  const [profile, saved, workAuthorization, user, job, answered] = await Promise.all([
    getUserProfile(env.DB, userId),
    savedAnswers(env.DB, userId),
    preferredWorkAuthorization(env.DB, userId),
    env.DB.prepare("SELECT name FROM users WHERE id = ?").bind(userId).first<{ name: string }>(),
    input.jobId
      ? env.DB.prepare(
        `SELECT j.title, c.name AS company, j.location FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = ?`
      ).bind(input.jobId).first<{ title: string; company: string; location: string }>()
      : Promise.resolve(null),
    answeredLabels(env.DB, userId),
  ]);

  const pending = input.controls.filter((control) => isEmpty(control.value));
  const prepared = new Map(prepareFields(
    pending.filter((control) => control.kind !== "checkbox").map(fieldForControl),
    profile.data,
    saved,
    impliedAnswers(workAuthorization),
  ).map((field) => [field.id, field]));

  const steps: FillStep[] = [];
  const needs: ApplyPlan["needs"] = [];
  const inferred: ApplyPlan["inferred"] = [];
  const jevQuestions: Record<string, JevQuestion> = {};
  const byRef = new Map(pending.map((control) => [control.ref, control]));
  const need = (control: FormControl) => {
    if (control.required) {
      needs.push({ ref: control.ref, label: control.label, kind: control.kind, options: control.options, required: true });
    }
  };
  const asValue = (control: FormControl, value: ApplicationAnswerValue): ApplicationAnswerValue =>
    control.kind === "checkboxes" && !Array.isArray(value) ? [value] : value;

  for (const control of pending) {
    if (control.kind === "checkbox") {
      if (isAcknowledgement(control.label)) {
        steps.push({ ref: control.ref, kind: "checkbox", value: "checked" });
      } else if (control.required) {
        // "I certify I am a U.S. citizen": tick it only if it's true.
        jevQuestions[control.ref] = {
          label: `Is this statement true for the applicant? "${control.label}"`,
          options: ["Yes", "No"],
        };
      }
      continue;
    }
    if (control.kind === "file") {
      if (/resume|\bcv\b/i.test(control.label)) steps.push({ ref: control.ref, kind: "file", value: "resume" });
      else need(control);
      continue;
    }

    const field = prepared.get(control.ref);
    if (field && field.answer !== null) {
      const pick = (control.kind === "combobox" && control.searchable) || field.type === "location";
      steps.push({ ref: control.ref, kind: control.kind, value: asValue(control, field.answer), ...(pick ? { pick: true } : {}) });
      continue;
    }

    const formerEmployer = job ? formerEmployerAnswer(control, profile.data, job.company) : null;
    if (formerEmployer) {
      steps.push({ ref: control.ref, kind: control.kind, value: asValue(control, formerEmployer) });
      continue;
    }

    // A resume fact asked as a search or a long dropdown: school, degree, country.
    const resumeKey = resumeKeyForLabel(control.label);
    const fact = resumeKey ? resumeAnswer(profile.data, resumeKey) : "";
    if (fact) {
      if (control.searchable || control.options.length === 0) {
        steps.push({ ref: control.ref, kind: control.kind, value: fact, pick: control.kind === "combobox" || field?.type === "location" });
        continue;
      }
      const option = fuzzyOption(control.options, fact);
      if (option) {
        steps.push({ ref: control.ref, kind: control.kind, value: asValue(control, option) });
        continue;
      }
    }

    const askable = CHOICE_KINDS.has(control.kind)
      && control.options.length >= 2
      && control.options.length <= MAX_JEV_OPTIONS
      && field?.section !== "voluntary";
    if (askable) {
      jevQuestions[control.ref] = { label: control.label, options: control.options };
      continue;
    }
    need(control);
  }

  let costUsd = 0;
  const asked = Object.keys(jevQuestions);
  if (asked.length > 0) {
    let answers: Awaited<ReturnType<typeof answerWithJev>>["answers"] = {};
    if (ai && !(await aiBudgetStatus(env, now)).exhausted) {
      try {
        const result = await answerWithJev(ai, applicantFacts({
          profile: profile.data,
          name: user?.name ?? "",
          workAuthorization,
          answered,
          job: job ?? null,
        }), jevQuestions);
        answers = result.answers;
        costUsd = result.costUsd;
        await recordAiSpend(env.DB, now, costUsd).catch(() => undefined);
      } catch (error) {
        console.error("Jev application answers failed", { error: error instanceof Error ? error.message : String(error) });
      }
    }
    for (const ref of asked) {
      const control = byRef.get(ref)!;
      const choice = acceptedJevAnswer(answers[ref]);
      if (control.kind === "checkbox") {
        if (choice === "Yes") {
          steps.push({ ref, kind: "checkbox", value: "checked" });
          inferred.push({ ref, label: control.label, answer: "Yes", confidence: answers[ref].probability });
        } else {
          need(control);
        }
      } else if (choice) {
        steps.push({ ref, kind: control.kind, value: asValue(control, choice) });
        inferred.push({ ref, label: control.label, answer: choice, confidence: answers[ref].probability });
      } else {
        need(control);
      }
    }
  }

  return { steps, needs, inferred, cost_usd: costUsd };
}

/** Saves what the user typed into a form, so the same question fills itself
 * next time. Only questions the user actually answered are given. */
export async function learnAnswers(
  db: D1Database,
  userId: string,
  controls: FormControl[],
  now = new Date(),
): Promise<number> {
  const statements: D1PreparedStatement[] = [];
  for (const control of controls) {
    if (isEmpty(control.value) || control.kind === "file" || control.kind === "checkbox") continue;
    const field = fieldForControl(control);
    if (field.section === "about") continue;
    const stored = storedAnswer(field, control.value!);
    statements.push(db.prepare(
      `INSERT INTO application_answers (user_id, answer_key, label, value_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, answer_key) DO UPDATE SET
         label = excluded.label, value_json = excluded.value_json, updated_at = excluded.updated_at`
    ).bind(userId, storageKey(field, stored), control.label.slice(0, 500), JSON.stringify(stored), now.toISOString()));
  }
  if (statements.length > 0) await db.batch(statements);
  return statements.length;
}
