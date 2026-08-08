import { describe, expect, test } from "bun:test";
import {
  streamGeminiTailoring,
  streamWorkersAiTailoring,
} from "@worker/tailor/providers";

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

describe("Workers AI tailoring", () => {
  test("streams visible content, drops reasoning, and records exact neurons", async () => {
    const output = [
      `data: ${JSON.stringify({
        choices: [{ delta: { reasoning_content: "SECRET INTERNAL REASONING" } }],
        usage: { prompt_tokens: 100, completion_tokens: 4, neurons: 1.25 },
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [{ delta: { content: [
          "=== RESUME ===",
          "# Ada Example",
          "- Built a search service.",
          "=== COVER ===",
          "Dear Hiring Team,",
          "I built a search service.",
          "Ada Example",
          "=== QA ===",
          JSON.stringify({
            why_company: "The role matches my search work.",
            biggest_project: "A search service.",
            technical_challenge: "Improving relevance.",
            gap_to_role: "No stated gap.",
          }),
        ].join("\n") } }],
        usage: { prompt_tokens: 100, completion_tokens: 80, neurons: 3.5 },
      })}\n\n`,
      `data: ${JSON.stringify({
        response: "duplicate aggregate response",
        usage: { prompt_tokens: 100, completion_tokens: 80, neurons: 3.5 },
      })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    const ai = {
      run: async () => new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(output));
          controller.close();
        },
      }),
    } as unknown as Ai;
    const writes: string[] = [];
    const writer = {
      write: async (chunk: Uint8Array) => {
        writes.push(new TextDecoder().decode(chunk));
      },
    } as unknown as WritableStreamDefaultWriter<Uint8Array>;

    const result = await streamWorkersAiTailoring({
      ai,
      model: "@cf/zai-org/glm-4.7-flash",
      sourceMd: "# Ada Example\n- Built a search service.",
      job: {
        id: "job-1",
        title: "Software Engineer",
        company_name: "Example",
        description: "Build search systems.",
      },
      writer,
      encoder: new TextEncoder(),
    });

    expect(writes.join("")).not.toContain("SECRET INTERNAL REASONING");
    expect(writes.join("")).not.toContain("duplicate aggregate response");
    expect(result.parsed.resume_md).toContain("Built a search service");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(80);
    expect(result.providerUnits).toBe(3.5);
  });
});
