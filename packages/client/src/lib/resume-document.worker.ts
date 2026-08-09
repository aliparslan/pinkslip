/// <reference lib="webworker" />

import { $typst } from "@myriaddreamin/typst.ts";
import { TypstSnippet } from "@myriaddreamin/typst.ts/contrib/snippet";
import { PDFDocument } from "pdf-lib";
import regularFontUrl from "../assets/fonts/SourceSans3-Regular.ttf?url";
import semiboldFontUrl from "../assets/fonts/SourceSans3-Semibold.ttf?url";
import boldFontUrl from "../assets/fonts/SourceSans3-Bold.ttf?url";

interface CompileRequest {
  id: number;
  source: string;
}

interface CompileResponse {
  id: number;
  pdf?: ArrayBuffer;
  svg?: string;
  pageCount?: number;
  error?: string;
}

let initialized = false;
let compileQueue: Promise<void> = Promise.resolve();

function ensureInitialized() {
  if (initialized) return;
  $typst.use(
    TypstSnippet.disableDefaultFontAssets(),
    TypstSnippet.preloadFonts([regularFontUrl, semiboldFontUrl, boldFontUrl]),
  );
  initialized = true;
}

async function compile(request: CompileRequest): Promise<void> {
  const { id, source } = request;
  try {
    ensureInitialized();
    const bytes = await $typst.pdf({ mainContent: source });
    if (!bytes) throw new Error("Typst did not return a PDF.");
    const svg = await $typst.svg({ mainContent: source });
    const copy = Uint8Array.from(bytes);
    const pdf = await PDFDocument.load(copy, { updateMetadata: false });
    const buffer = copy.buffer;
    const response: CompileResponse = { id, pdf: buffer, svg, pageCount: pdf.getPageCount() };
    self.postMessage(response, { transfer: [buffer] });
  } catch (error) {
    const response: CompileResponse = {
      id,
      error: error instanceof Error ? error.message : "Could not compile the resume.",
    };
    self.postMessage(response);
  }
}

self.addEventListener("message", (event: MessageEvent<CompileRequest>) => {
  const request = event.data;
  compileQueue = compileQueue.then(
    () => compile(request),
    () => compile(request),
  );
});

export {};
