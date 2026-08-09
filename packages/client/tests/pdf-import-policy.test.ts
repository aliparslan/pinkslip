import { describe, expect, test } from "bun:test";
import { shouldUseLocalPdfFallback } from "../src/lib/pdf-import";

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
});
