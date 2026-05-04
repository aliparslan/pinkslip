import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [svelte(), tailwindcss()],
  build: { outDir: "dist" },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
