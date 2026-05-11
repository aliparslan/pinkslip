import { Hono } from "hono";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MAX_SOURCE_CHARS = 1_000_000;
const COMPILE_TIMEOUT_MS = 30_000;

const app = new Hono();

type RenderFormat = "latex" | "typst";

interface CompileResult {
  exitCode: number | "timeout";
  stdout: string;
  stderr: string;
}

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

function publicTypstCompileError() {
  return "Typst compile failed. Check the generated resume syntax.";
}

function prepareTexForTectonic(tex: string) {
  return tex
    .replace(/^\s*\\input\{glyphtounicode\}\s*$/gm, "")
    .replace(/^\s*\\pdfgentounicode\s*=\s*1\s*$/gm, "");
}

async function runCommand(args: string[], cwd: string): Promise<CompileResult> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        exitCode: 127,
        stdout: "",
        stderr: `${args[0]} is not installed`,
      };
    }
    throw error;
  }

  const timeout = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), COMPILE_TIMEOUT_MS);
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    Promise.race([proc.exited, timeout]),
    new Response(proc.stdout).text().catch(() => ""),
    new Response(proc.stderr).text().catch(() => ""),
  ]);

  if (exitCode === "timeout") {
    proc.kill();
  }

  return { exitCode, stdout, stderr };
}

async function compileWithTectonic(tex: string, workDir: string, outDir: string) {
  const texPath = join(workDir, "main.tex");
  await writeFile(texPath, prepareTexForTectonic(tex), "utf8");
  const result = await runCommand(["tectonic", "--keep-logs", "--outdir", outDir, texPath], workDir);
  return {
    ...result,
    pdfPath: join(outDir, "main.pdf"),
    engine: "tectonic",
  };
}

async function compileWithLatexmk(tex: string, workDir: string, outDir: string) {
  const texPath = join(workDir, "main.tex");
  await writeFile(texPath, tex, "utf8");
  const result = await runCommand(
    [
      "latexmk",
      "-pdf",
      "-interaction=nonstopmode",
      "-halt-on-error",
      `-outdir=${outDir}`,
      texPath,
    ],
    workDir
  );
  return {
    ...result,
    pdfPath: join(outDir, "main.pdf"),
    engine: "latexmk",
  };
}

async function compileLatex(source: string) {
  const workDir = await mkdtemp(join(tmpdir(), "pinkslip-latex-"));
  const outDir = join(workDir, "out");

  try {
    await mkdir(outDir, { recursive: true });

    let result = await compileWithLatexmk(source, workDir, outDir);
    if (result.exitCode === 127) {
      result = await compileWithTectonic(source, workDir, outDir);
    }

    if (result.exitCode === "timeout") {
      throw new Error("LaTeX compile timed out");
    }
    if (result.exitCode !== 0) {
      console.error("LaTeX compile failed", {
        engine: result.engine,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(-4000),
        stderr: result.stderr.slice(-4000),
      });
      throw new Error(publicCompileError());
    }

    return await readFile(result.pdfPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function compileTypst(source: string) {
  const workDir = await mkdtemp(join(tmpdir(), "pinkslip-typst-"));
  const typstPath = join(workDir, "main.typ");
  const pdfPath = join(workDir, "main.pdf");

  try {
    await writeFile(typstPath, source, "utf8");
    const result = await runCommand(["typst", "compile", typstPath, pdfPath], workDir);

    if (result.exitCode === 127) {
      throw new Error("Typst compiler is unavailable on the renderer.");
    }
    if (result.exitCode === "timeout") {
      throw new Error("Typst compile timed out");
    }
    if (result.exitCode !== 0) {
      console.error("Typst compile failed", {
        exitCode: result.exitCode,
        stdout: result.stdout.slice(-4000),
        stderr: result.stderr.slice(-4000),
      });
      throw new Error(publicTypstCompileError());
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
      .json<{ tex?: string; source?: string; format?: RenderFormat }>()
      .catch(() => null)) ?? {};
  const format = body.format === "typst" ? "typst" : "latex";
  const source = (body.source ?? body.tex)?.trim();

  if (!source) {
    return c.json({ error: `${format === "typst" ? "Typst" : "TeX"} source is required` }, 400);
  }
  if (source.length > MAX_SOURCE_CHARS) {
    return c.json({ error: "Resume source is too large" }, 413);
  }

  try {
    const pdf = format === "typst"
      ? await compileTypst(source)
      : await compileLatex(source);
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const allowedMessages = new Set([
      "LaTeX compile timed out",
      "Typst compile timed out",
      "Typst compiler is unavailable on the renderer.",
    ]);
    const message = error instanceof Error && allowedMessages.has(error.message)
      ? error.message
      : format === "typst"
        ? publicTypstCompileError()
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
