import { Hono, type Context } from "hono";
import { normalizeResumeProfile } from "../../shared/resume-profile";
import { parseResumeText } from "../../packages/client/src/lib/pdf-to-profile";
import { recordProductEvent } from "../product-events";
import type { Env, Variables } from "../types";

const resumeImport = new Hono<{ Bindings: Env; Variables: Variables }>();
type ResumeImportContext = Context<{ Bindings: Env; Variables: Variables }>;
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const HOURLY_IMPORT_LIMIT = 10;

export type ResumeImportErrorCode =
  | "authentication_required"
  | "file_too_large"
  | "unsupported_type"
  | "invalid_pdf"
  | "protected_pdf"
  | "no_extractable_text"
  | "conversion_unavailable"
  | "import_rate_limited"
  | "unknown";

const ERROR_MESSAGES: Record<ResumeImportErrorCode, string> = {
  authentication_required: "Sign in to import a resume.",
  file_too_large: "Choose a PDF smaller than 5 MB.",
  unsupported_type: "Choose a PDF resume.",
  invalid_pdf: "This file is not a valid PDF. Choose another file.",
  protected_pdf: "Remove the PDF password, then try again.",
  no_extractable_text: "No readable resume text was found. Try a text-based PDF.",
  conversion_unavailable: "Resume import is temporarily unavailable. Try again.",
  import_rate_limited: "You’ve imported several resumes recently. Try again in an hour.",
  unknown: "The resume couldn’t be imported. Try again.",
};

function responseError(
  c: ResumeImportContext,
  code: ResumeImportErrorCode,
  status: 400 | 413 | 415 | 422 | 429 | 503,
) {
  return c.json({ error: ERROR_MESSAGES[code], code }, status);
}

function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

function conversionFailureCode(message: string): ResumeImportErrorCode {
  if (/password|encrypted|protected/i.test(message)) return "protected_pdf";
  if (/invalid|malformed|corrupt|damaged|bad (?:header|xref|object)/i.test(message)) return "invalid_pdf";
  return "conversion_unavailable";
}

/** Remove conversion markup while retaining headings, rows, and link targets. */
export function normalizeConvertedResumeText(value: string): string {
  return value
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_|\*([^*]+)\*/g, "$1$2")
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/gm, "")
    .replace(/^\s*\|\s?|\s*\|\s*$/gm, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function importCounts(profile: ReturnType<typeof normalizeResumeProfile>) {
  return {
    experience: profile.experience.length,
    education: profile.education.length,
    projects: profile.projects.length,
    skills: profile.skills.length,
    additional: profile.optionalSections.length,
  };
}

resumeImport.post("/parse", async (c) => {
  if (c.get("sessionState") !== "authenticated") {
    return c.json({ error: "Sign in to import a resume.", code: "authentication_required" }, 401);
  }
  const startedAt = Date.now();
  const userId = c.get("userId");
  const platform = c.req.header("x-pinkslip-client") === "ios" ? "ios" : "web";
  const recent = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM product_events
     WHERE user_id = ?
       AND event_name = 'resume_import_attempt'
       AND datetime(occurred_at) > datetime('now', '-1 hour')`
  ).bind(userId).first<{ count: number }>();
  if ((recent?.count ?? 0) >= HOURLY_IMPORT_LIMIT) {
    return responseError(c, "import_rate_limited", 429);
  }

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return responseError(c, "unsupported_type", 415);
  if (file.size > MAX_RESUME_BYTES) return responseError(c, "file_too_large", 413);
  if (file.type && file.type !== "application/pdf") return responseError(c, "unsupported_type", 415);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) return responseError(c, "invalid_pdf", 422);

  let eventStatus = "failed";
  let eventCode: ResumeImportErrorCode | "success" = "unknown";
  try {
    if (!c.env.AI) {
      eventCode = "conversion_unavailable";
      return responseError(c, eventCode, 503);
    }
    const converted = await c.env.AI.toMarkdown({
      name: "resume.pdf",
      blob: new Blob([bytes], { type: "application/pdf" }),
    }, {
      conversionOptions: { pdf: { metadata: false } },
    });
    if (converted.format === "error") {
      eventCode = conversionFailureCode(converted.error);
      const status = eventCode === "conversion_unavailable" ? 503 : 422;
      return responseError(c, eventCode, status);
    }

    const text = normalizeConvertedResumeText(converted.data);
    if (text.replace(/\s/g, "").length < 40) {
      eventCode = "no_extractable_text";
      return responseError(c, eventCode, 422);
    }
    const profile = normalizeResumeProfile(parseResumeText(text));
    const counts = importCounts(profile);
    if (!profile.contact.name && Object.values(counts).every((count) => count === 0)) {
      eventCode = "no_extractable_text";
      return responseError(c, eventCode, 422);
    }

    const warnings = [
      !profile.contact.name ? "We couldn’t identify a name." : "",
      !profile.contact.email ? "We couldn’t identify an email address." : "",
      counts.experience === 0 ? "We couldn’t identify an experience section." : "",
      counts.education === 0 ? "We couldn’t identify an education section." : "",
    ].filter(Boolean);

    eventStatus = "success";
    eventCode = "success";
    return c.json({ profile, counts, warnings });
  } catch (error) {
    console.error(JSON.stringify({
      message: "resume import failed",
      error_kind: error instanceof Error ? error.name : "unknown",
      platform,
    }));
    eventCode = "conversion_unavailable";
    return responseError(c, eventCode, 503);
  } finally {
    await recordProductEvent(c.env.DB, {
      userId,
      sessionId: c.get("sessionId"),
      name: "resume_import_attempt",
      properties: {
        status: eventStatus,
        error_code: eventCode,
        platform,
        size_bytes: file.size,
        latency_ms: Date.now() - startedAt,
        extractor: "workers_ai_markdown",
      },
    }).catch((error) => {
      console.error(JSON.stringify({
        message: "resume import event failed",
        error_kind: error instanceof Error ? error.name : "unknown",
      }));
    });
  }
});

export default resumeImport;
