import { describe, expect, spyOn, test } from "bun:test";
import { Hono } from "hono";
import resumeImport from "../worker/routes/resume-import";
import type { Env, Variables } from "../worker/types";

function fakeDb(): D1Database {
  return {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async first<T>() {
          return { count: 0 } as T;
        },
        async run() {
          return { success: true } as D1Result;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

function appWith(sessionState: Variables["sessionState"] = "authenticated") {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use("*", async (context, next) => {
    context.set("userId", "user-1");
    context.set("sessionId", "session-1");
    context.set("sessionState", sessionState);
    context.set("authTransport", sessionState === "authenticated" ? "native" : "anonymous");
    await next();
  });
  app.route("/resume-import", resumeImport);
  return app;
}

function pdfForm(contents: Uint8Array | string = "%PDF-1.7\nfixture"): FormData {
  const form = new FormData();
  form.set("file", new File([contents], "resume.pdf", { type: "application/pdf" }));
  return form;
}

function aiWith(result: unknown): Ai {
  return { toMarkdown: async () => result } as unknown as Ai;
}

async function parseRequest(app: ReturnType<typeof appWith>, env: Partial<Env>, body = pdfForm()) {
  return (app.fetch as unknown as (
    request: Request,
    env: Env,
  ) => Promise<Response>)(new Request("https://pinkslip.test/resume-import/parse", {
    method: "POST",
    body,
  }), { DB: fakeDb(), ...env } as Env);
}

function ocrForm(pageCount = 1, type = "image/jpeg"): FormData {
  const form = new FormData();
  for (let index = 0; index < pageCount; index += 1) {
    const extension = type === "text/plain" ? "txt" : "jpg";
    form.append("page", new File(
      [new Uint8Array([0xff, 0xd8, 0xff, index])],
      `page-${index + 1}.${extension}`,
      { type },
    ));
  }
  return form;
}

async function ocrRequest(app: ReturnType<typeof appWith>, env: Partial<Env>, body = ocrForm()) {
  return (app.fetch as unknown as (
    request: Request,
    env: Env,
  ) => Promise<Response>)(new Request("https://pinkslip.test/resume-import/ocr", {
    method: "POST",
    body,
  }), { DB: fakeDb(), ...env } as Env);
}

function aiWithOcr(run: () => Promise<{ response?: string }>): Ai {
  return { run } as unknown as Ai;
}

describe("POST /resume-import/parse", () => {
  test("requires an authenticated account", async () => {
    const response = await parseRequest(appWith("anonymous"), {});
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "authentication_required" });
  });

  test("rejects oversized and malformed files before conversion", async () => {
    const oversized = pdfForm(new Uint8Array(5 * 1024 * 1024 + 1));
    const tooLarge = await parseRequest(appWith(), {}, oversized);
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toMatchObject({ code: "file_too_large" });

    const malformed = await parseRequest(appWith(), {}, pdfForm("not a pdf"));
    expect(malformed.status).toBe(422);
    expect(await malformed.json()).toMatchObject({ code: "invalid_pdf" });
  });

  test("accepts valid PDFs labeled generically by mobile document providers", async () => {
    const form = new FormData();
    form.set("file", new File(
      ["%PDF-1.7\nfixture"],
      "resume.pdf",
      { type: "text/plain" },
    ));
    const response = await parseRequest(appWith(), {
      AI: aiWith({
        format: "markdown",
        data: "Jane Doe\njane@example.com\n\nEducation\nExample University\nBachelor of Science in Computer Science | May 2026",
      }),
    }, form);
    expect(response.status).toBe(200);
  });

  test("distinguishes protected and scanned PDFs", async () => {
    const protectedResponse = await parseRequest(appWith(), {
      AI: aiWith({ format: "error", error: "Document is password protected" }),
    });
    expect(protectedResponse.status).toBe(422);
    expect(await protectedResponse.json()).toMatchObject({ code: "protected_pdf" });

    const scannedResponse = await parseRequest(appWith(), {
      AI: aiWith({ format: "markdown", data: "   " }),
    });
    expect(scannedResponse.status).toBe(422);
    expect(await scannedResponse.json()).toMatchObject({ code: "no_extractable_text" });
  });

  test("treats an unavailable converter as a service failure, not a corrupt file", async () => {
    const response = await parseRequest(appWith(), {
      AI: aiWith({ format: "error", error: "PDF conversion service unavailable" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "conversion_unavailable" });
  });

  test("returns structured counts and non-fatal warnings", async () => {
    const response = await parseRequest(appWith(), {
      AI: aiWith({
        format: "markdown",
        data: "# Jane Doe\njane@example.com\n\n## Experience\nAcme | Austin, TX\nSoftware Engineer | Jan 2024 – Present\n- Built a reliable service.",
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      counts: Record<string, number>;
      warnings: string[];
      profile: { contact: { name: string } };
    };
    expect(body.profile.contact.name).toBe("Jane Doe");
    expect(body.counts.experience).toBe(1);
    expect(body.warnings).toContain("We couldn’t identify an education section.");
  });
});

describe("POST /resume-import/ocr", () => {
  test("requires authentication and a bounded image set", async () => {
    const anonymous = await ocrRequest(appWith("anonymous"), {});
    expect(anonymous.status).toBe(401);

    const tooManyPages = await ocrRequest(appWith(), {}, ocrForm(4));
    expect(tooManyPages.status).toBe(415);

    const wrongType = await ocrRequest(appWith(), {}, ocrForm(1, "text/plain"));
    expect(wrongType.status).toBe(415);

    const spoofedImage = new FormData();
    spoofedImage.append("page", new File(["not an image"], "page.jpg", { type: "image/jpeg" }));
    const badSignature = await ocrRequest(appWith(), {}, spoofedImage);
    expect(badSignature.status).toBe(415);
  });

  test("transcribes transient page images into the shared structured parser", async () => {
    let calls = 0;
    const response = await ocrRequest(appWith(), {
      AI: aiWithOcr(async () => {
        calls += 1;
        return {
          response: calls === 1
            ? "```text\nJane Doe\njane@example.com\nEXPERIENCE\nAcme Labs | Austin, TX\nSoftware Engineer | January 2024 – Present\n• Built a reliable service.\n```"
            : "EDUCATION\nExample University | Austin, TX\nBachelor of Science in Computer Science | May 2024",
        };
      }),
    }, ocrForm(2));

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    const body = await response.json() as {
      counts: Record<string, number>;
      profile: { contact: { name: string }; education: Array<{ institution: string }> };
    };
    expect(body.profile.contact.name).toBe("Jane Doe");
    expect(body.counts.experience).toBe(1);
    expect(body.profile.education[0].institution).toBe("Example University");
  });

  test("returns a scanned-file error when vision finds no text", async () => {
    const response = await ocrRequest(appWith(), {
      AI: aiWithOcr(async () => ({ response: " " })),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "no_extractable_text" });
  });

  test("never writes OCR text or model errors containing resume content to logs", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await ocrRequest(appWith(), {
        AI: aiWithOcr(async () => {
          throw new Error("Jane Doe jane@example.com");
        }),
      });
      expect(response.status).toBe(503);
      const logged = JSON.stringify(consoleSpy.mock.calls);
      expect(logged).not.toContain("Jane Doe");
      expect(logged).not.toContain("jane@example.com");
      expect(logged).toContain("resume OCR failed");
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
