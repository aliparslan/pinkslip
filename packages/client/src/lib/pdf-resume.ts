import { platform, type PlatformFileExportResult } from "./platform";

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function tailoredResumePdfFileName(companyName?: string | null, jobTitle?: string | null) {
  const parts = [companyName, jobTitle].filter(Boolean);
  const slug = slugify(parts.length > 0 ? [...parts, "resume"].join(" ") : "tailored-resume");
  return `${slug || "tailored-resume"}.pdf`;
}

export function exportPdfBytes(
  fileName: string,
  bytes: Uint8Array,
): Promise<PlatformFileExportResult> {
  return platform().exportFile({
    fileName,
    contentType: "application/pdf",
    bytes,
  });
}
