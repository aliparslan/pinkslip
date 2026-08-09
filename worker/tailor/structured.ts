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

const MAX_JOB_DESCRIPTION = 40_000;
const MAX_EVIDENCE = 80;
const MAX_EVIDENCE_TEXT = 800;

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
        required: ["text", "priority", "keywords", "evidenceIds", "reason"],
        properties: {
          text: { type: "string" },
          priority: { type: "string", enum: ["required", "preferred"] },
          keywords: { type: "array", items: { type: "string" }, maxItems: 8 },
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
      "Do not write a resume, cover letter, interview advice, or markdown.",
    ].join(" "),
    prompt: JSON.stringify({
      task: "Extract up to 12 material requirements and match only directly supporting evidence.",
      jobDescription: args.description.slice(0, MAX_JOB_DESCRIPTION),
      evidence: evidenceForPrompt(args.evidence),
    }),
    clean: cleanPlanOutput,
  });
  const requirements: TailoringRequirement[] = response.data.requirements.map((item, index) => ({
    id: stableTextId(`requirement-${index}`, item.text),
    text: item.text,
    priority: item.priority,
    keywords: item.keywords,
  }));
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
  const selectedEvidenceIds = [...new Set(matches.flatMap((match) => match.evidenceIds))];
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
      "Use concise ATS-readable prose. Return one rewrite for each supplied evidence ID and no markdown.",
    ].join(" "),
    prompt: JSON.stringify({
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
  const resume = buildResumeFromRewrites({
    profile: args.profile,
    evidence: args.evidence,
    selectedEvidenceIds: args.selectedEvidenceIds,
    rewrites,
  });
  const deterministicValidation = validateTailoredResume(args.profile, args.evidence, resume);
  const semanticIssues = finalReview.data.issues.map((issue, index) => ({
    code: "unsupported_claim" as const,
    message: issue.reason,
    path: `evidence.${issue.evidenceId || index}`,
  }));
  const validation: TailoringValidation = {
    valid: deterministicValidation.valid && semanticIssues.length === 0,
    issues: deterministicValidation.issues.concat(semanticIssues),
  };
  return {
    resume,
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
