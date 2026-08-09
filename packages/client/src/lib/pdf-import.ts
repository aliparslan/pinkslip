import type { ResumeProfile } from "../../../../shared/resume-profile";
import { extractPdfText } from "./pdf-extract";
import { parseResumeText } from "./pdf-to-profile";

/** Server failures that are safe to recover from without changing the selected file. */
export function shouldUseLocalPdfFallback(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const failure = error as { code?: unknown; status?: unknown };
  if (typeof failure.code !== "string" && typeof failure.status !== "number") return true;
  return failure.code === "network_unavailable"
    || failure.code === "request_timeout"
    || failure.code === "conversion_unavailable"
    || (typeof failure.status === "number" && failure.status >= 500);
}

/** Browser-only local fallback. The shared parser remains free of PDF.js and DOM imports. */
export async function parsePdfToProfile(file: File): Promise<Partial<ResumeProfile>> {
  const { text, links } = await extractPdfText(file);
  return parseResumeText(text, links);
}
