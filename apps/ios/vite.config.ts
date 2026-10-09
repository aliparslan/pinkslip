import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { offlineTypstCompiler } from "../../scripts/vite-typst-compiler.mts";

export default defineConfig({
  plugins: [offlineTypstCompiler(), svelte()],
  worker: { plugins: () => [offlineTypstCompiler()] },
  // The packaged native shell does not use the web manifest, service worker,
  // favicons, or hosting headers from packages/client/public.
  publicDir: false,
  resolve: {
    alias: [
      {
        find: /^pdfjs-dist$/,
        replacement: "pdfjs-dist/legacy/build/pdf.mjs",
      },
      {
        find: /^pdfjs-dist\/build\/pdf\.worker\.mjs\?url$/,
        replacement: "pdfjs-dist/legacy/build/pdf.worker.mjs?url",
      },
    ],
  },
  // Pre-bundling pdfjs-dist turns the worker's `?url` import into the worker
  // module itself, so live reload got no worker URL and PDF import failed.
  optimizeDeps: { exclude: ["pdfjs-dist"] },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    host: true,
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
    proxy: { "/api": "http://localhost:8787" },
  },
});
