import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  publicDir: resolve(import.meta.dirname, "../../packages/client/public"),
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    host: true,
    fs: { allow: [resolve(import.meta.dirname, "../..")] },
    proxy: { "/api": "http://localhost:8787" },
  },
});
