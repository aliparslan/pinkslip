import { parseTailoringText } from "./parse";
import { buildTailorPrompt, TAILOR_SYSTEM } from "./prompt";

export interface TailorProviderJob {
  id: string;
  title: string;
  company_name: string;
  description: string;
}

export interface ProviderStreamResult {
  parsed: ReturnType<typeof parseTailoringText>;
  inputTokens: number;
  outputTokens: number;
}

interface ProviderStreamArgs {
  apiKey: string;
  model: string;
  sourceMd: string;
  job: TailorProviderJob;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
}

export function writeSse(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  payload: Record<string, unknown>
) {
  return writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

async function boundedErrorBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < 8192) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const remaining = 8192 - length;
      chunks.push(value.slice(0, remaining));
      length += Math.min(value.length, remaining);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(body);
}

async function providerError(provider: string, response: Response): Promise<Error> {
  const body = await boundedErrorBody(response);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed.error?.message?.trim();
    if (message) return new Error(`${provider} request failed (${response.status}): ${message}`);
  } catch {
    // Raw provider bodies can contain prompt material, so never return them.
  }
  return new Error(`${provider} request failed (${response.status})`);
}

function sseData(rawEvent: string): string | null {
  const data = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  return data || null;
}

export async function streamAnthropicTailoring(args: ProviderStreamArgs): Promise<ProviderStreamResult> {
  const { apiKey, model, sourceMd, job, writer, encoder } = args;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2400,
      system: TAILOR_SYSTEM,
      stream: true,
      messages: [{
        role: "user",
        content: buildTailorPrompt({
          title: job.title,
          company: job.company_name,
          description: job.description,
        }, sourceMd),
      }],
    }),
  });
  if (!response.ok || !response.body) throw await providerError("Anthropic", response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  async function handleEvent(rawEvent: string) {
    const data = sseData(rawEvent);
    if (!data) return;
    const payload = JSON.parse(data) as {
      type?: string;
      message?: { usage?: { input_tokens?: number } };
      delta?: { type?: string; text?: string };
      usage?: { output_tokens?: number };
      error?: { message?: string };
    };
    if (payload.type === "message_start") {
      inputTokens = payload.message?.usage?.input_tokens ?? inputTokens;
    } else if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta" && payload.delta.text) {
      fullText += payload.delta.text;
      await writeSse(writer, encoder, { type: "chunk", text: payload.delta.text });
    } else if (payload.type === "message_delta") {
      outputTokens = payload.usage?.output_tokens ?? outputTokens;
    } else if (payload.type === "error") {
      throw new Error(payload.error?.message || "Anthropic streaming error");
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
    while (buffer.includes("\n\n")) {
      const boundary = buffer.indexOf("\n\n");
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      await handleEvent(rawEvent);
    }
  }
  if (buffer.trim()) await handleEvent(buffer);
  return { parsed: parseTailoringText(fullText), inputTokens, outputTokens };
}

export async function streamGeminiTailoring(args: ProviderStreamArgs): Promise<ProviderStreamResult> {
  const { apiKey, model, sourceMd, job, writer, encoder } = args;
  const prompt = buildTailorPrompt({
    title: job.title,
    company: job.company_name,
    description: job.description,
  }, sourceMd);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: TAILOR_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2400, temperature: 0.15 },
      }),
    }
  );
  if (!response.ok || !response.body) throw await providerError("Gemini", response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  async function handleEvent(rawEvent: string) {
    const data = sseData(rawEvent);
    if (!data || data === "[DONE]") return;
    const payload = JSON.parse(data) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    if (payload.error?.message) throw new Error(`Gemini streaming error: ${payload.error.message}`);
    const chunk = (payload.candidates ?? [])
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
    if (chunk) {
      fullText += chunk;
      await writeSse(writer, encoder, { type: "chunk", text: chunk });
    }
    inputTokens = payload.usageMetadata?.promptTokenCount ?? inputTokens;
    outputTokens = payload.usageMetadata?.candidatesTokenCount ?? outputTokens;
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
    while (buffer.includes("\n\n")) {
      const boundary = buffer.indexOf("\n\n");
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      await handleEvent(rawEvent);
    }
  }
  if (buffer.trim()) await handleEvent(buffer);
  return { parsed: parseTailoringText(fullText), inputTokens, outputTokens };
}
