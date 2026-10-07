import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `--mode artifact` emits one self-contained HTML file (fonts and scripts
// inlined) so a build can be previewed anywhere, including on a phone.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "artifact" ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === "artifact" ? "dist-artifact" : "dist",
    assetsInlineLimit: mode === "artifact" ? Number.MAX_SAFE_INTEGER : undefined,
  },
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
}));
