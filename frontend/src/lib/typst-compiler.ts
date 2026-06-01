import { $typst, TypstSnippet } from "@myriaddreamin/typst.ts/dist/esm/contrib/snippet.mjs";

const CDN_BASE =
  "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0-rc2/pkg";

const COMPILER_WASM_URL = `${CDN_BASE}/typst_ts_web_compiler_bg.wasm`;

const FONT_URLS = [
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2",
  "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff2",
];

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  initialized = true;

  $typst.setCompilerInitOptions({
    getModule: () => COMPILER_WASM_URL,
    getWrapper: () =>
      import(/* @vite-ignore */ `${CDN_BASE}/typst_ts_web_compiler.mjs`),
  });
  $typst.use(TypstSnippet.preloadFonts(FONT_URLS));
}

export async function compileTypstToPdf(source: string): Promise<Uint8Array> {
  await ensureInit();
  const result = await $typst.pdf({ mainContent: source });
  if (!result) {
    throw new Error("Typst compilation produced no output");
  }
  return result;
}
