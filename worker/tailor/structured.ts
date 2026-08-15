import type { ResumeProfile } from "../../shared/resume-profile";
import {
  stableTextId,
  validateTailoredResume,
  type CandidateEvidence,
  type RequirementMatch,
  type TailoredBullet,
  type TailoredResume,
  type TailoringGap,
  type TailoringPlan,
  type TailoringRequirement,
  type TailoringValidation,
} from "../../shared/tailoring";
import type { WorkersAiTailorModel } from "./config";

interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

interface StructuredModelResult<T> {
  data: T;
  usage: ModelUsage;
}

interface PlanModelRequirement {
  text: string;
  priority: "required" | "preferred";
  keywords: string[];
  sourceQuote: string;
  confidence: number;
  evidenceIds: string[];
  reason: string;
}

interface PlanModelOutput {
  requirements: PlanModelRequirement[];
}

interface RewriteModelOutput {
  rewrites: Array<{ evidenceId: string; text: string }>;
}

interface ReviewModelOutput {
  issues: Array<{ evidenceId: string; reason: string }>;
}

export interface StructuredGenerationResult {
  resume: TailoredResume;
  validation: TailoringValidation;
  usage: ModelUsage;
  repaired: boolean;
}

export interface FocusedRegenerationResult {
  resume: TailoredResume;
  validation: TailoringValidation;
  usage: ModelUsage;
  repaired: boolean;
}

const MAX_JOB_DESCRIPTION = 40_000;
const MAX_EVIDENCE = 80;
const MAX_EVIDENCE_TEXT = 800;
const MAX_SELECTED_BULLET_EVIDENCE = 8;

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requirements"],
  properties: {
    requirements: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "priority", "keywords", "sourceQuote", "confidence", "evidenceIds", "reason"],
        properties: {
          text: { type: "string" },
          priority: { type: "string", enum: ["required", "preferred"] },
          keywords: { type: "array", items: { type: "string" }, maxItems: 8 },
          sourceQuote: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidenceIds: { type: "array", items: { type: "string" }, maxItems: 8 },
          reason: { type: "string" },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

const rewritesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rewrites"],
  properties: {
    rewrites: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["evidenceId", "text"],
        properties: {
          evidenceId: { type: "string" },
          text: { type: "string" },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["issues"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["evidenceId", "reason"],
        properties: {
          evidenceId: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) throw new Error("The tailoring model returned no structured data.");
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The tailoring model returned an invalid structured response.");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown, max = 80): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function cleanPlanOutput(value: Record<string, unknown>): PlanModelOutput {
  if (!Array.isArray(value.requirements)) {
    throw new Error("The tailoring model did not return role requirements.");
  }
  const requirements = value.requirements.slice(0, 12).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) return [];
    return [{
      text,
      priority: item.priority === "preferred" ? "preferred" as const : "required" as const,
      keywords: stringArray(item.keywords, 8),
      sourceQuote: typeof item.sourceQuote === "string" ? item.sourceQuote.trim() : text,
      confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.5,
      evidenceIds: stringArray(item.evidenceIds, 8),
      reason: typeof item.reason === "string" ? item.reason.trim() : "",
    }];
  });
  if (requirements.length === 0) {
    throw new Error("The role description did not yield usable requirements.");
  }
  return { requirements };
}

function cleanRewriteOutput(value: Record<string, unknown>): RewriteModelOutput {
  if (!Array.isArray(value.rewrites)) throw new Error("No resume bullet rewrites were returned.");
  return {
    rewrites: value.rewrites.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const item = candidate as Record<string, unknown>;
      const evidenceId = typeof item.evidenceId === "string" ? item.evidenceId.trim() : "";
      const text = typeof item.text === "string" ? item.text.trim() : "";
      return evidenceId && text ? [{ evidenceId, text }] : [];
    }),
  };
}

function cleanReviewOutput(value: Record<string, unknown>): ReviewModelOutput {
  if (!Array.isArray(value.issues)) throw new Error("The evidence review returned invalid data.");
  return {
    issues: value.issues.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const item = candidate as Record<string, unknown>;
      const evidenceId = typeof item.evidenceId === "string" ? item.evidenceId.trim() : "";
      const reason = typeof item.reason === "string" ? item.reason.trim() : "";
      return evidenceId && reason ? [{ evidenceId, reason }] : [];
    }),
  };
}

async function runJson<T>(args: {
  ai: Ai;
  model: WorkersAiTailorModel;
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  prompt: string;
  maxTokens: number;
  clean: (value: Record<string, unknown>) => T;
}): Promise<StructuredModelResult<T>> {
  const output = await args.ai.run(args.model, {
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.prompt },
    ],
    stream: false,
    temperature: 0.1,
    max_completion_tokens: args.maxTokens,
    chat_template_kwargs: { enable_thinking: false },
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.schemaName,
        strict: true,
        schema: args.schema,
      },
    },
  });
  const content = output.choices?.[0]?.message?.content ?? null;
  const usage = output.usage && "prompt_tokens" in output.usage ? output.usage : undefined;
  return {
    data: args.clean(parseJsonObject(content)),
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  };
}

function evidenceForPrompt(evidence: CandidateEvidence[]) {
  return evidence.slice(0, MAX_EVIDENCE).map((item) => ({
    id: item.id,
    sourceType: item.sourceType,
    label: item.label,
    text: item.text.slice(0, MAX_EVIDENCE_TEXT),
  }));
}

function locateRequirementSource(
  description: string,
  sourceQuote: string,
  requirementText: string,
): { quote: string; start: number; end: number } {
  const candidates = [sourceQuote, requirementText]
    .map((value) => value.trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const exact = description.indexOf(candidate);
    if (exact >= 0) return { quote: candidate, start: exact, end: exact + candidate.length };
    const insensitive = description.toLocaleLowerCase().indexOf(candidate.toLocaleLowerCase());
    if (insensitive >= 0) {
      return {
        quote: description.slice(insensitive, insensitive + candidate.length),
        start: insensitive,
        end: insensitive + candidate.length,
      };
    }
  }
  return { quote: "", start: -1, end: -1 };
}

export async function createTailoringPlan(args: {
  ai: Ai;
  model: WorkersAiTailorModel;
  description: string;
  evidence: CandidateEvidence[];
}): Promise<{ plan: TailoringPlan; usage: ModelUsage }> {
  const availableIds = new Set(args.evidence.map((item) => item.id));
  const response = await runJson({
    ai: args.ai,
    model: args.model,
    schemaName: "resume_tailoring_plan",
    schema: planSchema,
    maxTokens: 2400,
    system: [
      "You analyze job descriptions and match them to candidate evidence.",
      "Never infer experience. Only return evidence IDs from the supplied inventory.",
      "Distinguish actual required qualifications from preferred ones.",
      "For every requirement, copy a short exact sourceQuote from the job description and report confidence from 0 to 1.",
      "Keyword overlap alone is not evidence. Do not match generic engineering work to specialized security, privacy, IAM, or domain expertise.",
      "A skills row shows familiarity, not proof that the candidate implemented or owned a system.",
      "When the evidence is indirect or ambiguous, leave the requirement unmatched.",
      "Do not write a resume, cover letter, interview advice, or markdown.",
    ].join(" "),
    prompt: JSON.stringify({
      task: "Extract up to 12 material requirements and match only directly supporting evidence.",
      jobDescription: args.description.slice(0, MAX_JOB_DESCRIPTION),
      evidence: evidenceForPrompt(args.evidence),
    }),
    clean: cleanPlanOutput,
  });
  const requirements: TailoringRequirement[] = response.data.requirements.map((item, index) => {
    const source = locateRequirementSource(args.description, item.sourceQuote, item.text);
    return {
      id: stableTextId(`requirement-${index}`, item.text),
      text: item.text,
      priority: item.priority,
      keywords: item.keywords,
      source,
      confidence: source.start >= 0 ? item.confidence : Math.min(item.confidence, 0.35),
    };
  });
  const matches: RequirementMatch[] = [];
  const gaps: TailoringGap[] = [];
  for (const [index, requirement] of requirements.entries()) {
    const modelRequirement = response.data.requirements[index];
    const evidenceIds = modelRequirement.evidenceIds.filter((id) => availableIds.has(id));
    if (evidenceIds.length) {
      matches.push({
        requirementId: requirement.id,
        evidenceIds,
        reason: modelRequirement.reason || "This evidence directly supports the requirement.",
      });
    } else {
      gaps.push({
        requirementId: requirement.id,
        reason: modelRequirement.reason || "No direct evidence was found in your saved resume.",
      });
    }
  }
  const evidenceById = new Map(args.evidence.map((item) => [item.id, item]));
  const requirementById = new Map(requirements.map((item) => [item.id, item]));
  const relevance = new Map<string, { score: number; order: number }>();
  let order = 0;
  for (const match of matches) {
    const weight = requirementById.get(match.requirementId)?.priority === "required" ? 4 : 2;
    for (const [evidenceIndex, id] of match.evidenceIds.entries()) {
      const evidence = evidenceById.get(id);
      if (evidence?.sourceType !== "experience" && evidence?.sourceType !== "project") continue;
      const current = relevance.get(id) ?? { score: 0, order: order++ };
      current.score += weight + Math.max(0, 2 - evidenceIndex);
      relevance.set(id, current);
    }
  }
  let selectedEvidenceIds = [...relevance.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].order - b[1].order)
    .slice(0, MAX_SELECTED_BULLET_EVIDENCE)
    .map(([id]) => id);
  const mostRecentRoleEvidence = args.evidence.find((item) => item.sourceType === "experience");
  if (
    selectedEvidenceIds.length > 0
    && mostRecentRoleEvidence
    && !selectedEvidenceIds.includes(mostRecentRoleEvidence.id)
  ) {
    selectedEvidenceIds = [mostRecentRoleEvidence.id, ...selectedEvidenceIds]
      .slice(0, MAX_SELECTED_BULLET_EVIDENCE);
  }
  return {
    plan: {
      schemaVersion: 2,
      requirements,
      matches,
      gaps,
      selectedEvidenceIds,
      excludedEvidenceIds: args.evidence
        .map((item) => item.id)
        .filter((id) => !selectedEvidenceIds.includes(id)),
    },
    usage: response.usage,
  };
}

export function buildResumeFromRewrites(args: {
  profile: ResumeProfile;
  evidence: CandidateEvidence[];
  selectedEvidenceIds: string[];
  rewrites: RewriteModelOutput["rewrites"];
}): TailoredResume {
  const selected = new Set(args.selectedEvidenceIds);
  const evidenceById = new Map(args.evidence.map((item) => [item.id, item]));
  const rewriteById = new Map(
    args.rewrites
      .filter((item) => selected.has(item.evidenceId) && evidenceById.has(item.evidenceId))
      .map((item) => [item.evidenceId, item.text]),
  );
  const bulletFor = (evidenceId: string): TailoredBullet => ({
    id: stableTextId("bullet", evidenceId),
    text: rewriteById.get(evidenceId) ?? evidenceById.get(evidenceId)?.text ?? "",
    evidenceIds: [evidenceId],
  });
  const evidenceForEntry = (sourceEntryId: string, sourceType: CandidateEvidence["sourceType"]) =>
    args.evidence.filter((item) =>
      item.sourceEntryId === sourceEntryId
      && item.sourceType === sourceType
      && selected.has(item.id)
    );

  return {
    schemaVersion: 2,
    contact: structuredClone(args.profile.contact),
    experience: args.profile.experience.flatMap((entry) => {
      const bullets = evidenceForEntry(entry.id, "experience").map((item) => bulletFor(item.id));
      return bullets.length ? [{
        sourceEntryId: entry.id,
        company: entry.company,
        title: entry.title,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        bullets,
      }] : [];
    }),
    education: structuredClone(args.profile.education),
    projects: args.profile.projects.flatMap((entry) => {
      const bullets = evidenceForEntry(entry.id, "project").map((item) => bulletFor(item.id));
      return bullets.length ? [{
        sourceEntryId: entry.id,
        name: entry.name,
        role: entry.role,
        teamInfo: entry.teamInfo,
        url: entry.url,
        date: entry.date,
        bullets,
      }] : [];
    }),
    skills: structuredClone(args.profile.skills),
    optionalSections: structuredClone(args.profile.optionalSections),
    removedForSpace: [],
    spaceProtectedEvidenceIds: [],
  };
}

function mergeUsage(...items: ModelUsage[]): ModelUsage {
  return items.reduce((sum, item) => ({
    inputTokens: sum.inputTokens + item.inputTokens,
    outputTokens: sum.outputTokens + item.outputTokens,
  }), { inputTokens: 0, outputTokens: 0 });
}

function reviewPrompt(
  evidence: CandidateEvidence[],
  rewrites: RewriteModelOutput["rewrites"],
): string {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  return JSON.stringify({
    task: "Flag every rewrite that adds an unsupported claim, technology, metric, employer, title, date, or degree.",
    rules: [
      "A change in phrasing or emphasis is allowed.",
      "Omitting a source detail is allowed and is never an unsupported claim.",
      "Only flag a fact that appears in the rewrite but is absent from the source.",
      "A fact must be explicitly supported by its source text.",
      "Return an empty issues array only when every claim is grounded.",
    ],
    rewrites: rewrites.map((item) => ({
      evidenceId: item.evidenceId,
      source: evidenceById.get(item.evidenceId)?.text ?? "",
      rewrite: item.text,
    })),
  });
}

export async function generateStructuredResume(args: {
  ai: Ai;
  model: WorkersAiTailorModel;
  profile: ResumeProfile;
  description: string;
  evidence: CandidateEvidence[];
  selectedEvidenceIds: string[];
}): Promise<StructuredGenerationResult> {
  const selected = new Set(args.selectedEvidenceIds);
  const selectedEvidence = args.evidence.filter((item) =>
    selected.has(item.id) && (item.sourceType === "experience" || item.sourceType === "project")
  );
  const generation = await runJson({
    ai: args.ai,
    model: args.model,
    schemaName: "grounded_resume_bullets",
    schema: rewritesSchema,
    maxTokens: 3000,
    system: [
      "You rewrite resume bullets using only supplied source evidence.",
      "Preserve every number exactly. Never add a technology, responsibility, result, employer, title, date, degree, or metric.",
      "Preserve supported outcomes and metrics; do not delete impact merely to shorten a bullet.",
      "If the source bullet is already clear and relevant, return it unchanged.",
      "Use concise ATS-readable prose. Return one rewrite for each supplied evidence ID and no markdown.",
    ].join(" "),
    prompt: JSON.stringify({
      task: "Align wording to the role while preserving each source bullet's action, scope, technology, and supported outcome.",
      jobDescription: args.description.slice(0, MAX_JOB_DESCRIPTION),
      evidence: evidenceForPrompt(selectedEvidence),
    }),
    clean: cleanRewriteOutput,
  });
  const allowedIds = new Set(selectedEvidence.map((item) => item.id));
  let rewrites = generation.data.rewrites.filter((item) => allowedIds.has(item.evidenceId));
  const review = await runJson({
    ai: args.ai,
    model: args.model,
    schemaName: "resume_evidence_review",
    schema: reviewSchema,
    maxTokens: 1200,
    system: "You are a strict factual resume verifier. Do not reward plausible inference. Return JSON only.",
    prompt: reviewPrompt(args.evidence, rewrites),
    clean: cleanReviewOutput,
  });
  let repaired = false;
  let repairUsage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
  let finalReview = review;
  if (review.data.issues.length) {
    repaired = true;
    const issueIds = new Set(review.data.issues.map((issue) => issue.evidenceId));
    const repairEvidence = selectedEvidence.filter((item) => issueIds.has(item.id));
    const repair = await runJson({
      ai: args.ai,
      model: args.model,
      schemaName: "repaired_resume_bullets",
      schema: rewritesSchema,
      maxTokens: 1600,
      system: [
        "Repair resume bullets so every claim is directly supported by the supplied source.",
        "Remove unsupported specifics instead of inventing replacements. Preserve supported numbers exactly. Return JSON only.",
      ].join(" "),
      prompt: JSON.stringify({
        evidence: evidenceForPrompt(repairEvidence),
        issues: review.data.issues,
      }),
      clean: cleanRewriteOutput,
    });
    repairUsage = repair.usage;
    const repairById = new Map(repair.data.rewrites.map((item) => [item.evidenceId, item.text]));
    rewrites = rewrites.map((item) => issueIds.has(item.evidenceId)
      ? { ...item, text: repairById.get(item.evidenceId) ?? item.text }
      : item
    );
    finalReview = await runJson({
      ai: args.ai,
      model: args.model,
      schemaName: "repaired_resume_evidence_review",
      schema: reviewSchema,
      maxTokens: 1200,
      system: "You are a strict factual resume verifier. Do not reward plausible inference. Return JSON only.",
      prompt: reviewPrompt(args.evidence, rewrites),
      clean: cleanReviewOutput,
    });
  }
  const hasUnmappedIssue = finalReview.data.issues.some((issue) => !allowedIds.has(issue.evidenceId));
  const unresolvedIds = new Set(hasUnmappedIssue
    ? selectedEvidence.map((item) => item.id)
    : finalReview.data.issues.map((issue) => issue.evidenceId));
  if (unresolvedIds.size > 0) {
    const sourceById = new Map(selectedEvidence.map((item) => [item.id, item.text]));
    rewrites = rewrites.map((item) => unresolvedIds.has(item.evidenceId)
      ? { ...item, text: sourceById.get(item.evidenceId) ?? item.text }
      : item
    );
  }
  const safeResume = buildResumeFromRewrites({
    profile: args.profile,
    evidence: args.evidence,
    selectedEvidenceIds: args.selectedEvidenceIds,
    rewrites,
  });
  const safeValidation = validateTailoredResume(args.profile, args.evidence, safeResume);
  const validation: TailoringValidation = {
    valid: safeValidation.valid,
    issues: safeValidation.issues,
  };
  return {
    resume: safeResume,
    validation,
    usage: mergeUsage(
      generation.usage,
      review.usage,
      repairUsage,
      repaired ? finalReview.usage : { inputTokens: 0, outputTokens: 0 },
    ),
    repaired,
  };
}

export async function regenerateStructuredBullet(args: {
  ai: Ai;
  model: WorkersAiTailorModel;
  profile: ResumeProfile;
  description: string;
  evidence: CandidateEvidence[];
  resume: TailoredResume;
  section: "experience" | "projects";
  sourceEntryId: string;
  bulletId: string;
  instruction?: string;
}): Promise<FocusedRegenerationResult> {
  const next = structuredClone(args.resume);
  const entry = next[args.section].find((candidate) => candidate.sourceEntryId === args.sourceEntryId);
  const bullet = entry?.bullets.find((candidate) => candidate.id === args.bulletId);
  if (!entry || !bullet) throw new Error("That resume bullet no longer exists.");
  if (bullet.locked) throw new Error("Unlock this bullet before regenerating it.");
  const evidenceById = new Map(args.evidence.map((item) => [item.id, item]));
  const citedEvidence = bullet.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is CandidateEvidence => Boolean(item));
  if (citedEvidence.length === 0) throw new Error("This bullet has no saved evidence to regenerate from.");
  const primaryEvidence = citedEvidence[0];
  const generation = await runJson({
    ai: args.ai,
    model: args.model,
    schemaName: "focused_resume_bullet",
    schema: rewritesSchema,
    maxTokens: 700,
    system: [
      "Rewrite one resume bullet using only the supplied source evidence.",
      "Preserve every number exactly and never add technologies, scope, responsibilities, or results.",
      "Follow the user's direction only when the evidence supports it. Return JSON only.",
    ].join(" "),
    prompt: JSON.stringify({
      task: "Rewrite only this bullet. Do not alter any other resume content.",
      instruction: args.instruction?.trim().slice(0, 300) || "Improve relevance and clarity.",
      jobDescription: args.description.slice(0, MAX_JOB_DESCRIPTION),
      currentBullet: bullet.text,
      evidence: evidenceForPrompt(citedEvidence),
    }),
    clean: cleanRewriteOutput,
  });
  let rewritten = generation.data.rewrites.find((item) => item.evidenceId === primaryEvidence.id)?.text
    ?? generation.data.rewrites[0]?.text
    ?? bullet.text;
  const review = await runJson({
    ai: args.ai,
    model: args.model,
    schemaName: "focused_resume_evidence_review",
    schema: reviewSchema,
    maxTokens: 500,
    system: "You are a strict factual resume verifier. Do not reward plausible inference. Return JSON only.",
    prompt: reviewPrompt(args.evidence, [{ evidenceId: primaryEvidence.id, text: rewritten }]),
    clean: cleanReviewOutput,
  });
  let repaired = false;
  let repairUsage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
  let finalReviewUsage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
  if (review.data.issues.length) {
    repaired = true;
    const repair = await runJson({
      ai: args.ai,
      model: args.model,
      schemaName: "focused_resume_bullet_repair",
      schema: rewritesSchema,
      maxTokens: 600,
      system: "Remove every unsupported claim. Preserve supported facts and numbers exactly. Return JSON only.",
      prompt: JSON.stringify({
        evidence: evidenceForPrompt(citedEvidence),
        rewrite: rewritten,
        issues: review.data.issues,
      }),
      clean: cleanRewriteOutput,
    });
    repairUsage = repair.usage;
    rewritten = repair.data.rewrites.find((item) => item.evidenceId === primaryEvidence.id)?.text
      ?? repair.data.rewrites[0]?.text
      ?? primaryEvidence.text;
    const finalReview = await runJson({
      ai: args.ai,
      model: args.model,
      schemaName: "focused_resume_final_review",
      schema: reviewSchema,
      maxTokens: 500,
      system: "You are a strict factual resume verifier. Do not reward plausible inference. Return JSON only.",
      prompt: reviewPrompt(args.evidence, [{ evidenceId: primaryEvidence.id, text: rewritten }]),
      clean: cleanReviewOutput,
    });
    finalReviewUsage = finalReview.usage;
    if (finalReview.data.issues.length) rewritten = primaryEvidence.text;
  }
  bullet.text = rewritten;
  const validation = validateTailoredResume(args.profile, args.evidence, next);
  return {
    resume: next,
    validation,
    usage: mergeUsage(generation.usage, review.usage, repairUsage, finalReviewUsage),
    repaired,
  };
}
