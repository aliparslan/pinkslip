import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";
import { cloudflareTypstCompiler } from "../../scripts/vite-typst-compiler.mts";

export default defineConfig({
  plugins: [
    cloudflareTypstCompiler(),
    svelte(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{html,js,css,woff2,png,svg,json}"],
        globIgnores: [
          "**/*typst-compiler*",
          "**/pdf-*.js",
          "**/*pdf.worker*",
          "**/*resume-document.worker*",
          "**/*.bin",
          "**/*.wasm",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  worker: { plugins: () => [cloudflareTypstCompiler()] },
  publicDir: resolve(import.meta.dirname, "public"),
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    host: true,
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
    proxy: { "/api": "http://localhost:8787" },
  },
});
