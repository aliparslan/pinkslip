import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

/** Wrangler reads `.dev.vars` beside the config file, which for the dev-only
 * API worker is this directory. The API's local settings (the access code,
 * secrets) live in the repository root's `.dev.vars`, so load them from there.
 * Values win over the config's `vars`, as they do under `wrangler dev`. */
function rootDevVars(): Record<string, string> {
  const file = fileURLToPath(new URL("../../.dev.vars", import.meta.url));
  if (!existsSync(file)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) continue;
    vars[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return vars;
}

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      remoteBindings: false,
      persistState: { path: fileURLToPath(new URL("../../.wrangler/state", import.meta.url)) },
      // Run the existing Hono Worker alongside Start in development only.
      // It keeps its own build/deploy path and never joins the web deployment.
      auxiliaryWorkers: command === "serve" && !isPreview
        ? [{
          configPath: "./wrangler.api.local.jsonc",
          config: (config) => ({ vars: { ...config.vars, ...rootDevVars() } }),
        }]
        : [],
    }),
    tanstackStart(),
    react(),
  ],
  // PDF.js loads only when someone imports a resume. Bundle it up front in
  // development, or its first use reloads the page mid-import.
  optimizeDeps: { include: ["pdfjs-dist"] },
}));
