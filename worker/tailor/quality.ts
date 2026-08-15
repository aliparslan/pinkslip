import type { TailoredResume, TailoringPlan, TailoringValidation } from "../../shared/tailoring";

export interface TailoringQualityEvent {
  tailoringId?: string | null;
  userId: string;
  jobId: string;
  stage: "plan" | "generate" | "regenerate" | "edit" | "preview" | "compile" | "artifact";
  outcome: "succeeded" | "failed" | "rejected" | "refunded";
  durationMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  repaired?: boolean | null;
  plan?: TailoringPlan | null;
  resume?: TailoredResume | null;
  baselineResume?: TailoredResume | null;
  validation?: TailoringValidation | null;
  pageCount?: number | null;
  errorCode?: string | null;
  compilerOrigin?: "client" | "service" | null;
  verificationStatus?: "client_only" | "server_reproduced" | "server_content_matched" | null;
}

function bullets(resume: TailoredResume | null | undefined) {
  if (!resume) return [];
  return [
    ...resume.experience.flatMap((entry) => entry.bullets),
    ...resume.projects.flatMap((entry) => entry.bullets),
  ];
}

export function summarizeResumeEdits(
  resume: TailoredResume | null | undefined,
  baseline: TailoredResume | null | undefined,
): { bulletCount: number; baselineBulletCount: number; editedBulletCount: number } {
  const current = bullets(resume);
  const initial = bullets(baseline);
  const initialById = new Map(initial.map((bullet) => [bullet.id, bullet.text]));
  const currentIds = new Set(current.map((bullet) => bullet.id));
  const changed = current.filter((bullet) => initialById.get(bullet.id) !== bullet.text).length;
  const removed = initial.filter((bullet) => !currentIds.has(bullet.id)).length;
  return {
    bulletCount: current.length,
    baselineBulletCount: initial.length,
    editedBulletCount: changed + removed,
  };
}

function safeCode(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80);
}

export async function recordTailoringQualityEvent(
  db: D1Database,
  event: TailoringQualityEvent,
): Promise<void> {
  const plan = event.plan ?? null;
  const resume = event.resume ?? null;
  const edit = summarizeResumeEdits(resume, event.baselineResume);
  const issues = event.validation?.issues ?? [];
  await db.prepare(
    `INSERT INTO tailoring_quality_events (
       id, tailoring_id, user_id, job_id, stage, outcome, duration_ms,
       input_tokens, output_tokens, repaired, requirement_count,
       requirement_source_count, matched_requirement_count, gap_count,
       selected_evidence_count, bullet_count, validation_issue_count,
       unsupported_claim_count, page_count, removed_item_count,
       edited_bullet_count, baseline_bullet_count, error_code,
       compiler_origin, verification_status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    event.tailoringId ?? null,
    event.userId,
    event.jobId,
    event.stage,
    event.outcome,
    event.durationMs ?? null,
    event.inputTokens ?? null,
    event.outputTokens ?? null,
    event.repaired == null ? null : Number(event.repaired),
    plan?.requirements.length ?? null,
    plan?.requirements.filter((requirement) => requirement.source.start >= 0).length ?? null,
    plan?.matches.length ?? null,
    plan?.gaps.length ?? null,
    plan?.selectedEvidenceIds.length ?? null,
    resume ? edit.bulletCount : null,
    event.validation ? issues.length : null,
    event.validation ? issues.filter((issue) => issue.code === "unsupported_claim").length : null,
    event.pageCount ?? null,
    resume?.removedForSpace.length ?? null,
    event.baselineResume ? edit.editedBulletCount : null,
    event.baselineResume ? edit.baselineBulletCount : null,
    safeCode(event.errorCode),
    event.compilerOrigin ?? null,
    event.verificationStatus ?? null,
    new Date().toISOString(),
  ).run();
}
