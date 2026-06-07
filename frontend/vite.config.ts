import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [svelte(), tailwindcss()],
  build: { outDir: "dist" },
  // `host: true` exposes the dev server on the LAN so a physical iPhone can load
  // it for live-reload; the /api proxy still runs on the Mac (→ wrangler :8787).
  server: {
    host: true,
    fs: { allow: [resolve(__dirname, "..")] },
    proxy: { "/api": "http://localhost:8787" },
  },
});
