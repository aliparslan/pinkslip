import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { cloudflareTypstCompiler } from "../../scripts/vite-typst-compiler.mts";

export default defineConfig({
  plugins: [cloudflareTypstCompiler(), svelte()],
  worker: { plugins: () => [cloudflareTypstCompiler()] },
  publicDir: resolve(import.meta.dirname, "../../packages/client/public"),
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    host: true,
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
    proxy: { "/api": "http://localhost:8787" },
  },
});
