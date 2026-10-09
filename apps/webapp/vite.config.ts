import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      remoteBindings: false,
      persistState: { path: fileURLToPath(new URL("../../.wrangler/state", import.meta.url)) },
      // Run the existing Hono Worker alongside Start in development only.
      // It keeps its own build/deploy path and never joins the web deployment.
      auxiliaryWorkers: command === "serve" && !isPreview
        ? [{ configPath: "./wrangler.api.local.jsonc" }]
        : [],
    }),
    tanstackStart(),
    react(),
  ],
}));
