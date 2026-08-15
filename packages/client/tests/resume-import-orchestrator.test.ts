import { describe, expect, test } from "bun:test";
import { createEmptyResumeProfile, type ResumeProfile } from "../../../shared/resume-profile";
import { importResumeAdaptively } from "../src/lib/resume-import-orchestrator";

function strongProfile(): ResumeProfile {
  return {
    ...createEmptyResumeProfile(),
    contact: {
      ...createEmptyResumeProfile().contact,
      name: "Jane Doe",
      email: "jane@example.com",
    },
    experience: [{
      id: "role-1",
      company: "Acme Labs",
      title: "Software Engineer",
      location: "Austin, TX",
      startDate: "January 2024",
      endDate: "Present",
      bullets: ["Built a reliable service"],
    }],
  };
}

describe("adaptive resume import orchestration", () => {
  test("does not call server conversion for a strong local parse", async () => {
    let serverCalls = 0;
    const result = await importResumeAdaptively({
      parseLocal: async () => strongProfile(),
      parseServer: async () => {
        serverCalls += 1;
        throw new Error("server should not be called");
      },
    });

    expect(serverCalls).toBe(0);
    expect(result.extractor).toBe("local_pdfjs");
    expect(result.serverAttempted).toBe(false);
  });

  test("calls the server for a weak local parse and selects the stronger structure", async () => {
    const local = {
      ...createEmptyResumeProfile(),
      contact: { ...createEmptyResumeProfile().contact, name: "Jane Doe" },
    };
    const result = await importResumeAdaptively({
      parseLocal: async () => local,
      parseServer: async () => ({ profile: strongProfile(), warnings: ["server warning"] }),
    });

    expect(result.extractor).toBe("workers_ai");
    expect(result.serverAttempted).toBe(true);
    expect(result.profile.experience?.[0].company).toBe("Acme Labs");
    expect(result.warnings).toEqual(["server warning"]);
  });

  test("keeps a usable local parse when server conversion is unavailable", async () => {
    const local = {
      ...createEmptyResumeProfile(),
      contact: {
        ...createEmptyResumeProfile().contact,
        name: "Jane Doe",
        email: "jane@example.com",
      },
    };
    const result = await importResumeAdaptively({
      parseLocal: async () => local,
      parseServer: async () => {
        throw { code: "conversion_unavailable", status: 503 };
      },
    });

    expect(result.extractor).toBe("local_pdfjs");
    expect(result.serverAttempted).toBe(true);
    expect(result.warnings).toContain("We couldn’t identify an experience section.");
  });

  test("does not wait for a server request while the device is offline", async () => {
    let serverCalls = 0;
    const result = await importResumeAdaptively({
      serverAvailable: false,
      parseLocal: async () => ({
        ...createEmptyResumeProfile(),
        contact: {
          ...createEmptyResumeProfile().contact,
          name: "Jane Doe",
          email: "jane@example.com",
        },
      }),
      parseServer: async () => {
        serverCalls += 1;
        throw new Error("offline");
      },
    });

    expect(serverCalls).toBe(0);
    expect(result.extractor).toBe("local_pdfjs");
    expect(result.serverAttempted).toBe(false);
  });

  test("uses the server when local PDF extraction fails", async () => {
    const result = await importResumeAdaptively({
      parseLocal: async () => {
        throw new Error("PDF.js could not load the document");
      },
      parseServer: async () => ({ profile: strongProfile(), warnings: [] }),
    });

    expect(result.extractor).toBe("workers_ai");
    expect(result.profile.contact?.email).toBe("jane@example.com");
  });

  test("uses optional vision OCR only when document extraction finds no text", async () => {
    let ocrCalls = 0;
    const result = await importResumeAdaptively({
      parseLocal: async () => createEmptyResumeProfile(),
      parseServer: async () => {
        throw { code: "no_extractable_text", status: 422 };
      },
      parseOcr: async () => {
        ocrCalls += 1;
        return { profile: strongProfile(), warnings: [] };
      },
    });

    expect(ocrCalls).toBe(1);
    expect(result.extractor).toBe("workers_ai_ocr");
    expect(result.profile.contact?.email).toBe("jane@example.com");
  });

  test("does not invoke vision OCR for protected or malformed documents", async () => {
    let ocrCalls = 0;
    const preciseFailure = { code: "protected_pdf", status: 422 };
    await expect(importResumeAdaptively({
      parseLocal: async () => createEmptyResumeProfile(),
      parseServer: async () => {
        throw preciseFailure;
      },
      parseOcr: async () => {
        ocrCalls += 1;
        return { profile: strongProfile(), warnings: [] };
      },
    })).rejects.toBe(preciseFailure);
    expect(ocrCalls).toBe(0);
  });

  test("preserves precise server file failures instead of accepting a weak parse", async () => {
    const preciseFailure = { code: "protected_pdf", status: 422 };
    await expect(importResumeAdaptively({
      parseLocal: async () => ({
        ...createEmptyResumeProfile(),
        contact: { ...createEmptyResumeProfile().contact, name: "Jane Doe" },
      }),
      parseServer: async () => {
        throw preciseFailure;
      },
    })).rejects.toBe(preciseFailure);
  });

  test("preserves the local parser error when both extractors are unavailable", async () => {
    const localFailure = new Error("PasswordException: protected PDF");
    await expect(importResumeAdaptively({
      parseLocal: async () => {
        throw localFailure;
      },
      parseServer: async () => {
        throw { code: "conversion_unavailable", status: 503 };
      },
    })).rejects.toBe(localFailure);
  });
});
