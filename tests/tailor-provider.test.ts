import { describe, expect, test } from "bun:test";
import { streamGeminiTailoring } from "@worker/tailor/providers";

describe("tailoring provider errors", () => {
  test("does not expose a raw provider response that could contain resume text", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(
      "upstream echoed private resume: SECRET-RESUME-CONTENT",
      { status: 500 }
    )) as unknown as typeof fetch;
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();

    try {
      await expect(streamGeminiTailoring({
        apiKey: "test-key",
        model: "gemini-3.1-flash-lite",
        sourceMd: "SECRET-RESUME-CONTENT",
        job: {
          id: "job-1",
          title: "Software Engineer",
          company_name: "Example",
          description: "Build software.",
        },
        writer,
        encoder: new TextEncoder(),
      })).rejects.toThrow("Gemini request failed (500)");
    } finally {
      globalThis.fetch = originalFetch;
      await writer.close();
    }
  });
});
