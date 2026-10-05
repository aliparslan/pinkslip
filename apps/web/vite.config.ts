import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import adapterStatic from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { renameSync } from "node:fs";
import { resolve } from "node:path";
import { cloudflareTypstCompiler } from "../../scripts/vite-typst-compiler.mts";
import { finalizeStaticApp } from "../../scripts/static-app-shell.mts";

const staticAdapter = adapterStatic({ pages: "dist", assets: "dist", fallback: "index.html" });

export default defineConfig({
  plugins: [
    cloudflareTypstCompiler(),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: {
        ...staticAdapter,
        async adapt(builder) {
          await staticAdapter.adapt(builder);
          finalizeStaticApp("dist");
          // Preserve the URL used by existing installations and push subscriptions.
          renameSync("dist/service-worker.js", "dist/sw.js");
        },
      },
      files: { assets: "public", serviceWorker: "src/service-worker/index.ts" },
      serviceWorker: { register: false },
      csp: {
        mode: "hash",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self", "unsafe-inline"],
          "img-src": ["self", "data:", "https:"],
          "font-src": ["self", "data:"],
          "connect-src": ["self", "https://generativelanguage.googleapis.com"],
          "worker-src": ["self", "blob:"],
          "object-src": ["none"],
          "base-uri": ["self"],
          "form-action": ["self"],
        },
      },
    }),
  ],
  worker: { plugins: () => [cloudflareTypstCompiler()] },
  server: {
    host: true,
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
    proxy: { "/api": "http://localhost:8787" },
  },
});
