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

export function downloadPdfBytes(fileName: string, bytes: Uint8Array) {
  if (typeof document === "undefined") return;
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
}
