import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { offlineTypstCompiler } from "../../scripts/vite-typst-compiler.mts";

export default defineConfig({
  plugins: [offlineTypstCompiler(), svelte()],
  worker: { plugins: () => [offlineTypstCompiler()] },
  publicDir: resolve(import.meta.dirname, "../../packages/client/public"),
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
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    host: true,
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
    proxy: { "/api": "http://localhost:8787" },
  },
});
