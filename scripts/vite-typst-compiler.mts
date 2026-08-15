import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";

const VIRTUAL_MODULE_ID = "virtual:pinkslip-typst-compiler";
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const WEB_CHUNK_BYTES = 16 * 1024 * 1024;
const DEV_ASSET_PREFIX = "/@pinkslip/typst-compiler/";
const compilerWasmPath = resolve(
  import.meta.dirname,
  "../packages/client/node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
);

function compilerBytes(): Buffer {
  return readFileSync(compilerWasmPath);
}

function chunkCount(byteLength: number): number {
  return Math.ceil(byteLength / WEB_CHUNK_BYTES);
}

function loaderSource(urlExpressions: string[], expectedBytes: number): string {
  return `
const compilerPartUrls = [${urlExpressions.join(",")}];
const expectedCompilerBytes = ${expectedBytes};

export async function loadTypstCompilerModule() {
  const responses = await Promise.all(compilerPartUrls.map((url) => fetch(url)));
  const failed = responses.find((response) => !response.ok);
  if (failed) {
    throw new Error(\`The resume compiler could not load (\${failed.status}).\`);
  }

  const parts = await Promise.all(responses.map((response) => response.arrayBuffer()));
  const totalBytes = parts.reduce((total, part) => total + part.byteLength, 0);
  if (totalBytes !== expectedCompilerBytes) {
    throw new Error("The resume compiler download was incomplete.");
  }

  const module = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of parts) {
    module.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }
  return module;
}
`;
}

/**
 * Cloudflare Workers Assets rejects individual files over 25 MiB. The Typst
 * compiler is kept byte-for-byte identical but emitted as independently
 * cacheable chunks that the browser worker joins before WASM initialization.
 */
export function cloudflareTypstCompiler(): Plugin {
  let config: ResolvedConfig;
  let source: Buffer;
  const compilerPartReferences = new Set<string>();

  return {
    name: "pinkslip-cloudflare-typst-compiler",
    enforce: "pre",
    configResolved(resolved) {
      config = resolved;
    },
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
      return undefined;
    },
    configureServer(server: ViteDevServer) {
      source = compilerBytes();
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        if (!pathname.startsWith(DEV_ASSET_PREFIX) || !pathname.endsWith(".bin")) {
          next();
          return;
        }
        const index = Number(pathname.slice(DEV_ASSET_PREFIX.length, -4));
        if (!Number.isInteger(index) || index < 0 || index >= chunkCount(source.byteLength)) {
          response.statusCode = 404;
          response.end();
          return;
        }
        const start = index * WEB_CHUNK_BYTES;
        const end = Math.min(start + WEB_CHUNK_BYTES, source.byteLength);
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/octet-stream");
        response.setHeader("Cache-Control", "no-store");
        response.end(source.subarray(start, end));
      });
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) return undefined;
      source ??= compilerBytes();
      const count = chunkCount(source.byteLength);
      if (config.command === "serve") {
        return loaderSource(
          Array.from({ length: count }, (_, index) => JSON.stringify(`${DEV_ASSET_PREFIX}${index}.bin`)),
          source.byteLength,
        );
      }
      const emittedParts = Array.from({ length: count }, (_, index) => {
        const start = index * WEB_CHUNK_BYTES;
        const end = Math.min(start + WEB_CHUNK_BYTES, source.byteLength);
        const reference = this.emitFile({
          type: "asset",
          name: `typst-compiler-${index}.bin`,
          source: source.subarray(start, end),
        });
        compilerPartReferences.add(reference);
        return reference;
      });
      return loaderSource(
        emittedParts.map((reference) => `import.meta.ROLLUP_FILE_URL_${reference}`),
        source.byteLength,
      );
    },
    resolveFileUrl({ fileName, referenceId }) {
      if (!compilerPartReferences.has(referenceId)) return undefined;
      // The web worker is emitted as an IIFE, so import.meta.url is not
      // available. Cloudflare serves every build asset from the site root.
      return JSON.stringify(`/${fileName}`);
    },
  };
}

/** Capacitor keeps a complete offline compiler in the signed app bundle. */
export function offlineTypstCompiler(): Plugin {
  return {
    name: "pinkslip-offline-typst-compiler",
    enforce: "pre",
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
      return undefined;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) return undefined;
      return `
import compilerWasmUrl from ${JSON.stringify(`${compilerWasmPath}?url`)};
export async function loadTypstCompilerModule() {
  return compilerWasmUrl;
}
`;
    },
  };
}
