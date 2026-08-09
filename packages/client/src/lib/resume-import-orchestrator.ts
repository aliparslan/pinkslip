import type { ResumeProfile } from "../../../../shared/resume-profile";
import {
  chooseBestResumeImport,
  resumeImportWarnings,
  shouldRequestServerResumeImport,
} from "./resume-import-quality";
import { shouldUseLocalPdfFallback } from "./pdf-import";

export interface ResumeImportCandidate {
  profile: Partial<ResumeProfile>;
  warnings: string[];
}

export interface AdaptiveResumeImportResult extends ResumeImportCandidate {
  extractor: "local_pdfjs" | "workers_ai";
  serverAttempted: boolean;
}

interface AdaptiveResumeImportOptions {
  parseLocal: () => Promise<Partial<ResumeProfile>>;
  parseServer: () => Promise<ResumeImportCandidate>;
  serverAvailable?: boolean;
}

type SettledLocalImport =
  | { ok: true; profile: Partial<ResumeProfile> }
  | { ok: false; failure: unknown };

function localResult(
  profile: Partial<ResumeProfile>,
  serverAttempted: boolean,
): AdaptiveResumeImportResult {
  return {
    profile,
    warnings: resumeImportWarnings(profile),
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
      extractor: "workers_ai",
      serverAttempted: true,
    };
  } catch (serverFailure) {
    if (local.ok && shouldUseLocalPdfFallback(serverFailure)) {
      return localResult(local.profile, true);
    }
    if (!local.ok && shouldUseLocalPdfFallback(serverFailure)) {
      throw local.failure;
    }
    throw serverFailure;
  }
}
