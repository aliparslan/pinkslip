/// <reference lib="webworker" />

import { $typst } from "@myriaddreamin/typst.ts";
import { TypstSnippet } from "@myriaddreamin/typst.ts/contrib/snippet";
import { PDFDocument } from "pdf-lib";
import rendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import { loadTypstCompilerModule } from "virtual:pinkslip-typst-compiler";
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
  // The package cannot infer sibling WASM files once Vite bundles this worker.
  // Each app build supplies its own compiler loader: Cloudflare-safe chunks on
  // web and one offline, hashed asset in the signed Capacitor bundle.
  $typst.setCompilerInitOptions({ getModule: loadTypstCompilerModule });
  $typst.setRendererInitOptions({ getModule: () => rendererWasmUrl });
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
    if (typeof svg !== "string") throw new Error("Typst did not return an SVG preview.");
    const copy = Uint8Array.from(bytes);
    const pdf = await PDFDocument.load(copy, { updateMetadata: false });
    const buffer = copy.buffer;
    const response: CompileResponse = { id, pdf: buffer, svg, pageCount: pdf.getPageCount() };
    // Use the transfer-list overload for WKWebView compatibility. Some iOS
    // WebKit versions interpret the newer StructuredSerializeOptions object as
    // a value to clone and fail the whole response with DataCloneError.
    self.postMessage(response, [buffer]);
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
