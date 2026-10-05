import { extname, resolve, sep } from "node:path";

const port = Number(process.env.PINKSLIP_E2E_PORT ?? "4173");
const distDir = resolve(import.meta.dirname, "../dist");
const indexPath = resolve(distDir, "index.html");
const indexFile = Bun.file(indexPath);
let serviceWorkerRevision = 0;

if (!await indexFile.exists()) {
  throw new Error(`Missing ${indexPath}. Run \`bun run build:frontend\` before the web smoke suite.`);
}

function fileInsideDist(pathname: string): string | null {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!relative) return null;
  const candidate = resolve(distDir, relative);
  return candidate.startsWith(`${distDir}${sep}`) ? candidate : null;
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/__e2e__/service-worker-revision" && request.method === "POST") {
      serviceWorkerRevision += 1;
      return Response.json({ revision: serviceWorkerRevision });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    // API requests are fulfilled by the Playwright fixture. A missed mock
    // should fail clearly instead of accidentally receiving the SPA shell.
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Unmocked E2E API request" }, { status: 501 });
    }

    const requestedPath = fileInsideDist(url.pathname);
    const prerenderedPage = Bun.file(`${requestedPath}.html`);
    if (requestedPath && !extname(url.pathname) && await prerenderedPage.exists()) {
      return new Response(request.method === "HEAD" ? null : prerenderedPage, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
      });
    }
    if (requestedPath) {
      const requestedFile = Bun.file(requestedPath);
      if (await requestedFile.exists()) {
        if (url.pathname === "/sw.js") {
          const source = `${await requestedFile.text()}\n// e2e-service-worker-revision:${serviceWorkerRevision}\n`;
          return new Response(request.method === "HEAD" ? null : source, {
            headers: {
              "content-type": "text/javascript; charset=utf-8",
              "cache-control": "no-cache, no-store, must-revalidate",
            },
          });
        }
        return new Response(request.method === "HEAD" ? null : requestedFile, {
          headers: {
            "content-type": requestedFile.type,
            "cache-control": url.pathname.startsWith("/assets/") || url.pathname.startsWith("/_app/immutable/")
              ? "public, max-age=31536000, immutable"
              : "no-cache",
          },
        });
      }
      if (extname(url.pathname)) return new Response("Not found", { status: 404 });
    }

    return new Response(request.method === "HEAD" ? null : indexFile, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  },
});

console.log(`Pinkslip E2E server ready at ${server.url}`);
