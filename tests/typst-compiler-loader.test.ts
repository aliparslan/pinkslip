import { describe, expect, test } from "bun:test";
import { offlineTypstCompiler } from "../scripts/vite-typst-compiler.mts";

function hookHandler(hook: unknown): (...args: unknown[]) => unknown {
  if (!hook) throw new Error("Expected Vite plugin hook.");
  if (typeof hook === "function") return hook as (...args: unknown[]) => unknown;
  if (typeof hook === "object" && "handler" in hook && typeof hook.handler === "function") {
    return hook.handler as (...args: unknown[]) => unknown;
  }
  throw new Error("Expected callable Vite plugin hook.");
}

describe("offline Typst compiler loader", () => {
  test("returns the bundled WASM URL synchronously for WKWebView", async () => {
    const plugin = offlineTypstCompiler();
    const resolveId = hookHandler(plugin.resolveId);
    const load = hookHandler(plugin.load);
    const resolvedId = await resolveId.call({}, "virtual:pinkslip-typst-compiler");
    const source = await load.call({}, resolvedId);

    expect(typeof source).toBe("string");
    expect(source).toContain("export function loadTypstCompilerModule()");
    expect(source).not.toContain("export async function loadTypstCompilerModule()");
  });
});
