import type { ResumeProfile } from "../../../../shared/resume-profile";
import type { ResumeImportAssessment } from "../../../../shared/resume-import";
import {
  assessResumeImportFields,
  chooseBestResumeImport,
  resumeImportWarnings,
  shouldRequestServerResumeImport,
} from "./resume-import-quality";
import { shouldUseLocalPdfFallback } from "./pdf-import";

export interface ResumeImportCandidate {
  profile: Partial<ResumeProfile>;
  warnings: string[];
  assessment?: ResumeImportAssessment;
}

export interface AdaptiveResumeImportResult extends ResumeImportCandidate {
  extractor: "local_pdfjs" | "workers_ai" | "workers_ai_ocr";
  serverAttempted: boolean;
}

interface AdaptiveResumeImportOptions {
  parseLocal: () => Promise<Partial<ResumeProfile>>;
  parseServer: () => Promise<ResumeImportCandidate>;
  parseOcr?: () => Promise<ResumeImportCandidate>;
  serverAvailable?: boolean;
}

type SettledLocalImport =
  | { ok: true; profile: Partial<ResumeProfile> }
  | { ok: false; failure: unknown };

function failureCode(failure: unknown): string | null {
  if (!failure || typeof failure !== "object" || !("code" in failure)) return null;
  return typeof failure.code === "string" ? failure.code : null;
}

function localResult(
  profile: Partial<ResumeProfile>,
  serverAttempted: boolean,
): AdaptiveResumeImportResult {
  return {
    profile,
    warnings: resumeImportWarnings(profile),
    assessment: assessResumeImportFields(profile),
    extractor: "local_pdfjs",
    serverAttempted,
  };
}

/**
 * PDF.js is the privacy-preserving fast path. The authenticated converter is
 * reserved for a failed or materially weak local parse, then both candidates
 * are compared by retained resume structure rather than raw text length.
 */
export async function importResumeAdaptively({
  parseLocal,
  parseServer,
  parseOcr,
  serverAvailable = true,
}: AdaptiveResumeImportOptions): Promise<AdaptiveResumeImportResult> {
  const local: SettledLocalImport = await parseLocal().then(
    (profile) => ({ ok: true as const, profile }),
    (failure: unknown) => ({ ok: false as const, failure }),
  );

  if (local.ok && !shouldRequestServerResumeImport(local.profile)) {
    return localResult(local.profile, false);
  }

  if (!serverAvailable) {
    if (local.ok) return localResult(local.profile, false);
    throw local.failure;
  }

  try {
    const server = await parseServer();
    if (local.ok && chooseBestResumeImport(server.profile, local.profile) === "local") {
      return localResult(local.profile, true);
    }
    return {
      ...server,
      assessment: server.assessment ?? assessResumeImportFields(server.profile),
      extractor: "workers_ai",
      serverAttempted: true,
    };
  } catch (serverFailure) {
    if (parseOcr && failureCode(serverFailure) === "no_extractable_text") {
      const ocr = await parseOcr();
      return {
        ...ocr,
        assessment: ocr.assessment ?? assessResumeImportFields(ocr.profile),
        extractor: "workers_ai_ocr",
        serverAttempted: true,
      };
    }
    if (local.ok && shouldUseLocalPdfFallback(serverFailure)) {
      return localResult(local.profile, true);
    }
    if (!local.ok && shouldUseLocalPdfFallback(serverFailure)) {
      throw local.failure;
    }
    throw serverFailure;
  }
}
