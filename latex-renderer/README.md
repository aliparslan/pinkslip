# Pinkslip Resume Renderer

Small stateless PDF render service for resume tailoring.

The Cloudflare Worker cannot run native compilers, so the Worker forwards a single resume source document to this service, receives PDF bytes, and returns them to the browser. The renderer writes source to a temporary directory, compiles it, returns `main.pdf`, and deletes the temporary directory in the same request. It does not persist resumes, logs, or PDFs.

LaTeX rendering uses an Overleaf-style path when available: `latexmk -pdf` inside a TeX Live environment. Local development falls back to Tectonic if `latexmk` is not installed. Typst rendering uses `typst compile`.

## Endpoints

- `GET /health`
- `POST /render` with `{ "format": "latex", "source": "..." }`, returning `application/pdf`
- `POST /render` with `{ "format": "typst", "source": "..." }`, returning `application/pdf`

The older `{ "tex": "..." }` body is still accepted as LaTeX for compatibility.

## Environment

- `PORT`: service port, default `8080`
- `RENDER_SHARED_SECRET`: optional bearer token required by `/render`

Set these on the Worker:

- `LATEX_RENDER_URL`: renderer base URL, for example `https://pinkslip-latex-renderer.example.com`
- `LATEX_RENDER_TOKEN`: same value as `RENDER_SHARED_SECRET` when auth is enabled

## Local Run

Install at least Tectonic locally for LaTeX fallback. Install `latexmk`/TeX Live for closer Overleaf parity, and `typst` for the Pinkslip default resume template.

```sh
cd latex-renderer
bun install
bun run dev
```

The Worker can point at `http://localhost:8080` during local development.
