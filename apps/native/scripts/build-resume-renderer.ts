import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL("../resume-renderer/index.ts", import.meta.url))],
  target: "browser", format: "iife", minify: true,
  define: { "import.meta.url": JSON.stringify("about:blank") },
});
if (!result.success) throw new AggregateError(result.logs, "Resume renderer did not bundle");
const script = (await result.outputs[0]!.text()).replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; connect-src 'none'"></head><body><script>${script}</script></body></html>\n`;
const path = new URL("../assets/resume-renderer.html", import.meta.url);
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8").catch(() => "") !== html) throw new Error("Resume renderer is stale. Run: bun --filter @pinkslip/native resume-renderer");
  console.log("Resume renderer is up to date.");
} else {
  await writeFile(path, html);
  console.log(`Wrote local resume renderer (${Math.round(html.length / 1024)} KiB).`);
}
