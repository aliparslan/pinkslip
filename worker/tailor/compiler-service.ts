import { sha256Hex, validSha256 } from "./artifact-storage";

const MAX_COMPILED_PDF_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_BYTES = 300_000;

export class ResumeCompilerIntegrityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ResumeCompilerIntegrityError";
    this.code = code;
  }
}

export interface CompileResumeRequest {
  source: string;
  templateVersion: string;
  compilerVersion: string;
  resumeSha256: string;
  expectedPdfSha256: string;
  expectedExtractedTextSha256?: string | null;
}

export interface CompiledResumeResult {
  pdf: Uint8Array;
  pdfSha256: string;
  sourceSha256: string;
  resumeSha256: string;
  templateVersion: string;
  compilerVersion: string;
  pageCount: number | null;
  extractedTextSha256: string | null;
  verification: "server_reproduced" | "server_content_matched";
}

function responseHeader(response: Response, name: string): string | null {
  const value = response.headers.get(name)?.trim() ?? null;
  return value || null;
}

function optionalPositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Calls only the optional internal Service Binding. The compiler receives no
 * profile, database, R2, or credential binding and its response is treated as
 * untrusted until every available integrity field has been checked.
 */
export async function compileResumeWithService(
  compiler: Fetcher,
  request: CompileResumeRequest,
): Promise<CompiledResumeResult> {
  if (new TextEncoder().encode(request.source).byteLength > MAX_SOURCE_BYTES) {
    throw new ResumeCompilerIntegrityError("compiler_source_too_large", "The resume source is too large to compile safely.");
  }
  const sourceSha256 = await sha256Hex(request.source);
  const response = await compiler.fetch("https://resume-compiler.internal/compile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: request.source,
      sourceSha256,
      resumeSha256: request.resumeSha256,
      templateVersion: request.templateVersion,
      compilerVersion: request.compilerVersion,
      expectedExtractedTextSha256: request.expectedExtractedTextSha256 ?? null,
    }),
  });
  if (!response.ok) {
    throw new ResumeCompilerIntegrityError("compiler_rejected", "The isolated resume compiler rejected this revision.");
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_COMPILED_PDF_BYTES) {
    throw new ResumeCompilerIntegrityError("compiler_pdf_too_large", "The isolated compiler returned an oversized PDF.");
  }
  const pdf = new Uint8Array(await response.arrayBuffer());
  if (pdf.byteLength === 0 || pdf.byteLength > MAX_COMPILED_PDF_BYTES) {
    throw new ResumeCompilerIntegrityError("compiler_pdf_too_large", "The isolated compiler returned an invalid PDF size.");
  }
  if (new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-") {
    throw new ResumeCompilerIntegrityError("compiler_invalid_pdf", "The isolated compiler returned an invalid PDF.");
  }

  const actualPdfSha256 = await sha256Hex(pdf);
  const reportedPdfSha256 = responseHeader(response, "x-resume-pdf-sha256");
  const reportedSourceSha256 = responseHeader(response, "x-resume-source-sha256");
  const reportedResumeSha256 = responseHeader(response, "x-resume-resume-sha256") ?? request.resumeSha256;
  const reportedTemplateVersion = responseHeader(response, "x-resume-template-version") ?? request.templateVersion;
  const reportedCompilerVersion = responseHeader(response, "x-resume-compiler-version");
  const extractedTextSha256 = responseHeader(response, "x-resume-extracted-text-sha256");

  if (!validSha256(reportedPdfSha256) || reportedPdfSha256 !== actualPdfSha256) {
    throw new ResumeCompilerIntegrityError("compiler_pdf_hash_mismatch", "The isolated compiler PDF failed its integrity check.");
  }
  if (reportedSourceSha256 !== sourceSha256) {
    throw new ResumeCompilerIntegrityError("compiler_source_hash_mismatch", "The isolated compiler used different resume source.");
  }
  if (reportedResumeSha256 !== request.resumeSha256) {
    throw new ResumeCompilerIntegrityError("compiler_resume_hash_mismatch", "The isolated compiler used different resume data.");
  }
  if (reportedTemplateVersion !== request.templateVersion || reportedCompilerVersion !== request.compilerVersion) {
    throw new ResumeCompilerIntegrityError("compiler_version_mismatch", "The isolated compiler version does not match this resume.");
  }

  let verification: CompiledResumeResult["verification"];
  if (actualPdfSha256 === request.expectedPdfSha256) {
    verification = "server_reproduced";
  } else if (
    validSha256(extractedTextSha256)
    && extractedTextSha256 === request.expectedExtractedTextSha256
  ) {
    verification = "server_content_matched";
  } else {
    throw new ResumeCompilerIntegrityError(
      "compiler_reproducibility_mismatch",
      "The isolated compiler could not reproduce the verified resume.",
    );
  }

  return {
    pdf,
    pdfSha256: actualPdfSha256,
    sourceSha256,
    resumeSha256: request.resumeSha256,
    templateVersion: request.templateVersion,
    compilerVersion: request.compilerVersion,
    pageCount: optionalPositiveInteger(responseHeader(response, "x-resume-page-count")),
    extractedTextSha256: validSha256(extractedTextSha256) ? extractedTextSha256 : null,
    verification,
  };
}
