import { describe, expect, test } from "bun:test";
import {
  shouldUseLocalPdfFallback,
  validateResumePdf,
} from "../src/lib/pdf-import";

describe("resume import fallback policy", () => {
  test("uses PDF.js for offline, timeout, and converter outages", () => {
    expect(shouldUseLocalPdfFallback(new TypeError("offline"))).toBe(true);
    expect(shouldUseLocalPdfFallback({ code: "network_unavailable", status: 0 })).toBe(true);
    expect(shouldUseLocalPdfFallback({ code: "request_timeout", status: 408 })).toBe(true);
    expect(shouldUseLocalPdfFallback({ code: "conversion_unavailable", status: 503 })).toBe(true);
  });

  test("does not hide actionable file or authentication failures", () => {
    expect(shouldUseLocalPdfFallback({ code: "authentication_required", status: 401 })).toBe(false);
    expect(shouldUseLocalPdfFallback({ code: "protected_pdf", status: 422 })).toBe(false);
    expect(shouldUseLocalPdfFallback({ code: "invalid_pdf", status: 422 })).toBe(false);
  });

  test("applies the server PDF contract before taking the local fast path", async () => {
    await expect(validateResumePdf(new File(
      ["not a pdf"],
      "resume.pdf",
      { type: "application/pdf" },
    ))).rejects.toMatchObject({ code: "invalid_pdf" });

    await expect(validateResumePdf(new File(
      ["not a pdf"],
      "resume.txt",
      { type: "text/plain" },
    ))).rejects.toMatchObject({ code: "unsupported_type" });
  });

  test("accepts generic MIME types emitted by iOS document providers when the signature is valid", async () => {
    await expect(validateResumePdf(new File(
      ["%PDF-1.7"],
      "resume.pdf",
      { type: "application/octet-stream" },
    ))).resolves.toBeUndefined();

    await expect(validateResumePdf(new File(
      ["%PDF-1.7"],
      "resume.pdf",
      { type: "application/x-pdf" },
    ))).resolves.toBeUndefined();

    await expect(validateResumePdf(new File(
      ["%PDF-1.7"],
      "resume.pdf",
      { type: "text/plain" },
    ))).resolves.toBeUndefined();
  });
});
