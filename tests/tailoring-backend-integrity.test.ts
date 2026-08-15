import { describe, expect, test } from "bun:test";
import { normalizeStoredTailoringPlan } from "@worker/routes/tailor";
import {
  artifactProvenanceHash,
  ArtifactStorageUnavailableError,
  deleteR2Keys,
  deleteUserArtifactObjects,
  insertArtifactMetadata,
  restoreArtifactDeletionState,
  sha256Hex,
} from "@worker/tailor/artifact-storage";
import {
  compileResumeWithService,
  ResumeCompilerIntegrityError,
} from "@worker/tailor/compiler-service";
import { recordTailoringQualityEvent, summarizeResumeEdits } from "@worker/tailor/quality";
import type { TailoredResume } from "../shared/tailoring";

function compilerBinding(args: {
  source: string;
  pdf: Uint8Array;
  compilerVersion?: string;
  sourceSha256?: string;
  extractedTextSha256?: string;
}): Fetcher {
  return {
    async fetch() {
      const pdfSha256 = await sha256Hex(args.pdf);
      const sourceSha256 = args.sourceSha256 ?? await sha256Hex(args.source);
      return new Response(args.pdf, {
        headers: {
          "content-type": "application/pdf",
          "x-resume-compiler-version": args.compilerVersion ?? "typst-web-v2",
          "x-resume-source-sha256": sourceSha256,
          "x-resume-pdf-sha256": pdfSha256,
          ...(args.extractedTextSha256
            ? { "x-resume-extracted-text-sha256": args.extractedTextSha256 }
            : {}),
        },
      });
    },
    connect() {
      throw new Error("not implemented");
    },
  } as unknown as Fetcher;
}

const minimalPdf = new TextEncoder().encode("%PDF-1.7\ntrusted resume\n%%EOF");

describe("tailoring compiler integrity", () => {
  test("accepts a byte-for-byte deterministic service compilation", async () => {
    const source = "#set text(11pt)\nHello";
    const pdfSha256 = await sha256Hex(minimalPdf);
    const result = await compileResumeWithService(compilerBinding({ source, pdf: minimalPdf }), {
      source,
      templateVersion: "resume-v3",
      compilerVersion: "typst-web-v2",
      resumeSha256: "a".repeat(64),
      expectedPdfSha256: pdfSha256,
    });
    expect(result.verification).toBe("server_reproduced");
    expect(result.pdfSha256).toBe(pdfSha256);
  });

  test("accepts different bytes only when independently extracted content matches", async () => {
    const source = "Resume";
    const textSha256 = "b".repeat(64);
    const result = await compileResumeWithService(compilerBinding({
      source,
      pdf: minimalPdf,
      extractedTextSha256: textSha256,
    }), {
      source,
      templateVersion: "resume-v3",
      compilerVersion: "typst-web-v2",
      resumeSha256: "a".repeat(64),
      expectedPdfSha256: "c".repeat(64),
      expectedExtractedTextSha256: textSha256,
    });
    expect(result.verification).toBe("server_content_matched");
  });

  test("rejects a compiler response tied to different source", async () => {
    const source = "Resume";
    await expect(compileResumeWithService(compilerBinding({
      source,
      pdf: minimalPdf,
      sourceSha256: "d".repeat(64),
    }), {
      source,
      templateVersion: "resume-v3",
      compilerVersion: "typst-web-v2",
      resumeSha256: "a".repeat(64),
      expectedPdfSha256: await sha256Hex(minimalPdf),
    })).rejects.toBeInstanceOf(ResumeCompilerIntegrityError);
  });
});

describe("tailoring artifact retention", () => {
  test("deletes R2 objects in the API's 1,000-key batches", async () => {
    const calls: string[][] = [];
    const bucket = {
      async delete(keys: string | string[]) {
        calls.push(Array.isArray(keys) ? keys : [keys]);
      },
    } as unknown as R2Bucket;
    await deleteR2Keys(bucket, Array.from({ length: 2_005 }, (_, index) => `artifact-${index}`));
    expect(calls.map((call) => call.length)).toEqual([1_000, 1_000, 5]);
  });

  test("binds provenance to the revision and every compiled input", async () => {
    const base = {
      tailoringId: "tailoring-1",
      revision: 2,
      resumeSha256: "a".repeat(64),
      typstSha256: "b".repeat(64),
      pdfSha256: "c".repeat(64),
      templateVersion: "resume-v3",
      compilerVersion: "typst-web-v2",
      pageCount: 1,
    };
    const first = await artifactProvenanceHash(base);
    expect(first).toBe(await artifactProvenanceHash(base));
    expect(first).not.toBe(await artifactProvenanceHash({ ...base, revision: 3 }));
  });

  test("restores a visible retry state when R2 deletion fails", async () => {
    const statements: string[] = [];
    const db = {
      prepare(sql: string) {
        statements.push(sql);
        const statement = {
          bind() { return statement; },
          async run() { return { meta: { changes: 1 } }; },
        };
        return statement;
      },
    } as unknown as D1Database;
    await restoreArtifactDeletionState({
      db,
      userId: "user-1",
      tailoringId: "tailoring-1",
      artifactId: "artifact-1",
    });
    expect(statements.join("\n")).toContain("storage_state = 'available'");
    expect(statements.join("\n")).toContain("delete_requested_at = NULL");
  });

  test("blocks account metadata deletion when private PDFs cannot be reached", async () => {
    let writes = 0;
    const db = {
      prepare() {
        const statement = {
          bind() { return statement; },
          async all() {
            return { results: [{ id: "artifact-1", pdf_storage_key: "private/resume.pdf" }] };
          },
          async run() {
            writes += 1;
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
    } as unknown as D1Database;
    await expect(deleteUserArtifactObjects({ db, userId: "user-1" }))
      .rejects.toBeInstanceOf(ArtifactStorageUnavailableError);
    expect(writes).toBe(0);
  });

  test("stores every integrity field with a complete D1 binding", async () => {
    let wrote = false;
    const db = {
      prepare(sql: string) {
        const statement = {
          bind(...values: unknown[]) {
            expect(values.length).toBe(sql.match(/\?/g)?.length ?? 0);
            return statement;
          },
          async run() {
            wrote = true;
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
    } as unknown as D1Database;
    await insertArtifactMetadata({
      db,
      id: "artifact-1",
      tailoringId: "tailoring-1",
      userId: "user-1",
      revision: 1,
      resumeJson: "{}",
      validationJson: "{}",
      typstSource: "Resume",
      templateVersion: "resume-v3",
      compilerVersion: "typst-web-v2",
      pdfStorageKey: "tailored/resume.pdf",
      pageCount: 1,
      pdfSha256: "a".repeat(64),
      resumeSha256: "b".repeat(64),
      typstSha256: "c".repeat(64),
      provenanceSha256: "d".repeat(64),
      extractedTextSha256: null,
      pdfByteSize: 1024,
      compilerOrigin: "client",
      verificationStatus: "client_only",
      createdAt: "2026-08-15T00:00:00.000Z",
    });
    expect(wrote).toBe(true);
  });
});

describe("stored tailoring compatibility", () => {
  test("adds exact provenance to a pre-provenance plan", () => {
    const description = "We need TypeScript and accessible UI experience.";
    const normalized = normalizeStoredTailoringPlan(description, [], JSON.stringify({
      schemaVersion: 2,
      requirements: [{
        id: "requirement-1",
        text: "TypeScript",
        priority: "required",
        keywords: ["TypeScript"],
      }],
      matches: [],
      gaps: [{ requirementId: "requirement-1", reason: "No evidence" }],
      selectedEvidenceIds: [],
      excludedEvidenceIds: [],
    }));
    expect(normalized.valid).toBe(true);
    expect(normalized.plan.requirements[0]).toMatchObject({
      source: { quote: "TypeScript", start: 8, end: 18 },
      confidence: 0.5,
    });
  });

  test("requires a fresh plan when frozen text cannot prove a requirement", () => {
    const normalized = normalizeStoredTailoringPlan("TypeScript role", [], JSON.stringify({
      schemaVersion: 2,
      requirements: [{ id: "requirement-1", text: "Rust", priority: "required", keywords: [] }],
      matches: [],
      gaps: [],
      selectedEvidenceIds: [],
      excludedEvidenceIds: [],
    }));
    expect(normalized.valid).toBe(false);
  });
});

describe("tailoring quality edit metrics", () => {
  test("counts changed and removed bullets against the frozen generated baseline", () => {
    const baseline = {
      experience: [{
        sourceEntryId: "role-1",
        company: "Pinkslip",
        title: "Engineer",
        location: "Chicago",
        startDate: "2025",
        endDate: "Present",
        bullets: [
          { id: "bullet-1", text: "Built A", evidenceIds: ["evidence-1"] },
          { id: "bullet-2", text: "Built B", evidenceIds: ["evidence-2"] },
        ],
      }],
      projects: [],
    } as unknown as TailoredResume;
    const edited = structuredClone(baseline);
    edited.experience[0].bullets = [{ ...edited.experience[0].bullets[0], text: "Built A safely" }];
    expect(summarizeResumeEdits(edited, baseline)).toEqual({
      bulletCount: 1,
      baselineBulletCount: 2,
      editedBulletCount: 2,
    });
  });

  test("writes only bounded aggregate fields with a complete D1 binding", async () => {
    let recorded = false;
    const db = {
      prepare(sql: string) {
        const statement = {
          bind(...values: unknown[]) {
            expect(values.length).toBe(sql.match(/\?/g)?.length ?? 0);
            return statement;
          },
          async run() {
            recorded = true;
            return { meta: { changes: 1 } };
          },
        };
        return statement;
      },
    } as unknown as D1Database;
    await recordTailoringQualityEvent(db, {
      userId: "user-1",
      jobId: "job-1",
      stage: "compile",
      outcome: "failed",
      durationMs: 120,
      errorCode: "wasm_timeout",
    });
    expect(recorded).toBe(true);
  });
});
