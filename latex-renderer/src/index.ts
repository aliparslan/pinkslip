import { Hono } from "hono";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MAX_TEX_CHARS = 1_000_000;
const COMPILE_TIMEOUT_MS = 20_000;

const app = new Hono();

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function requireSharedSecret(request: Request) {
  const secret = Bun.env.RENDER_SHARED_SECRET?.trim();
  if (!secret) return null;
  return request.headers.get("authorization") === `Bearer ${secret}` ? null : unauthorized();
}

function publicCompileError() {
  return "LaTeX compile failed. Check the uploaded template packages and syntax.";
}

function prepareTexForTectonic(tex: string) {
  return tex
    .replace(/^\s*\\input\{glyphtounicode\}\s*$/gm, "")
    .replace(/^\s*\\pdfgentounicode\s*=\s*1\s*$/gm, "");
}

async function compileTex(tex: string) {
  const workDir = await mkdtemp(join(tmpdir(), "pinkslip-tex-"));
  const outDir = join(workDir, "out");
  const texPath = join(workDir, "main.tex");
  const pdfPath = join(outDir, "main.pdf");

  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(texPath, prepareTexForTectonic(tex), "utf8");

    const proc = Bun.spawn(["tectonic", "--keep-logs", "--outdir", outDir, texPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), COMPILE_TIMEOUT_MS);
    });
    const result = await Promise.race([proc.exited, timeout]);
    if (result === "timeout") {
      proc.kill();
      throw new Error("LaTeX compile timed out");
    }
    if (result !== 0) {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text().catch(() => ""),
        new Response(proc.stderr).text().catch(() => ""),
      ]);
      console.error("LaTeX compile failed", {
        exitCode: result,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
      });
      throw new Error(publicCompileError());
    }

    return await readFile(pdfPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

app.get("/health", (c) => c.json({ ok: true }));

app.post("/render", async (c) => {
  const auth = requireSharedSecret(c.req.raw);
  if (auth) return auth;

  const body =
    (await c.req
      .json<{ tex?: string }>()
      .catch(() => null)) ?? {};
  const tex = body.tex?.trim();

  if (!tex) {
    return c.json({ error: "TeX source is required" }, 400);
  }
  if (tex.length > MAX_TEX_CHARS) {
    return c.json({ error: "TeX source is too large" }, 413);
  }

  try {
    const pdf = await compileTex(tex);
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "LaTeX compile timed out"
      ? error.message
      : publicCompileError();
    return c.json({ error: message }, 422);
  }
});

const port = Number(Bun.env.PORT ?? 8080);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`LaTeX renderer listening on :${port}`);
