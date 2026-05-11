# Pinkslip LaTeX Renderer

Small stateless PDF render service for resume tailoring.

The Cloudflare Worker cannot run a LaTeX engine, so the Worker forwards a single TeX document to this service, receives PDF bytes, and returns them to the browser. The renderer writes TeX to a temporary directory, runs Tectonic, returns `main.pdf`, and deletes the temporary directory in the same request. It does not persist resumes, logs, or PDFs.

## Endpoints

- `GET /health`
- `POST /render` with `{ "tex": "..." }`, returning `application/pdf`

## Environment

- `PORT`: service port, default `8080`
- `RENDER_SHARED_SECRET`: optional bearer token required by `/render`

Set these on the Worker:

- `LATEX_RENDER_URL`: renderer base URL, for example `https://pinkslip-latex-renderer.example.com`
- `LATEX_RENDER_TOKEN`: same value as `RENDER_SHARED_SECRET` when auth is enabled

## Local Run

Install Tectonic locally, then:

```sh
cd latex-renderer
bun install
bun run dev
```

The Worker can point at `http://localhost:8080` during local development.
