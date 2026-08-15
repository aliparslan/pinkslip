import { TypstSnippet } from "@myriaddreamin/typst.ts/contrib/snippet";

const MAX_SOURCE_BYTES = 300_000;
const PORT = Number(Bun.env.PORT ?? 8080);
const COMPILER_VERSION = Bun.env.RESUME_COMPILER_VERSION ?? "typst-web-v2";
const compiler = new TypstSnippet();

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

const fontsReady = Promise.all([
  "SourceSans3-Regular.ttf",
  "SourceSans3-Semibold.ttf",
  "SourceSans3-Bold.ttf",
].map(async (name) => new Uint8Array(
  await Bun.file(new URL(`../../packages/client/src/assets/fonts/${name}`, import.meta.url)).arrayBuffer(),
))).then((fonts) => {
  compiler.use(TypstSnippet.disableDefaultFontAssets(), TypstSnippet.preloadFonts(fonts));
});

export async function compileTypstSource(source: string): Promise<{
  pdf: Uint8Array;
  sourceSha256: string;
  pdfSha256: string;
}> {
  if (!source.trim()) throw new Error("Typst source is empty.");
  if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
    throw new Error("Typst source exceeds the compiler limit.");
  }
  await fontsReady;
  const bytes = await compiler.pdf({ mainContent: source });
  if (!bytes) throw new Error("Typst returned no PDF bytes.");
  const pdf = Uint8Array.from(bytes);
  if (new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-") {
    throw new Error("Typst returned an invalid PDF.");
  }
  return {
    pdf,
    sourceSha256: await sha256(source),
    pdfSha256: await sha256(pdf),
  };
}

if (import.meta.main) {
  Bun.serve({
    port: PORT,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/health") {
        return Response.json({ ok: true, compilerVersion: COMPILER_VERSION });
      }
      if (url.pathname !== "/compile" || request.method !== "POST") {
        return new Response("Not found", { status: 404 });
      }
      const body = await request.json<{ source?: unknown; compilerVersion?: unknown }>().catch(() => null);
      if (!body || typeof body.source !== "string" || body.compilerVersion !== COMPILER_VERSION) {
        return Response.json({ error: "Compiler request version mismatch." }, { status: 409 });
      }
      try {
        const compiled = await compileTypstSource(body.source);
        return new Response(compiled.pdf, {
          headers: {
            "content-type": "application/pdf",
            "x-resume-compiler-version": COMPILER_VERSION,
            "x-resume-source-sha256": compiled.sourceSha256,
            "x-resume-pdf-sha256": compiled.pdfSha256,
          },
        });
      } catch (error) {
        return Response.json({
          error: error instanceof Error ? error.message : "Resume compilation failed.",
        }, { status: 422 });
      }
    },
  });
}
