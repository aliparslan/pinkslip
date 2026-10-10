# Chunk 3.4: replace the Svelte site

## Done (committed locally, not pushed)

- **Tag:** `svelte-final` → `bb3c986`, the last commit with the Svelte web app,
  `packages/client` and the Capacitor app.
- **Moved out before deleting:**
  - The public files → `apps/webapp/public/`, with icon, manifest and
    `theme-color` links in the root route.
  - The resume compiler's fonts → `services/resume-compiler/fonts/`, plus its
    own `@myriaddreamin/typst-ts-web-compiler` dependency.
  - Verbatim Svelte `tokens.css` and `typography.css` →
    `packages/tokens/reference/`, so the equivalence check still runs.
  - `resume-document.ts` → `packages/core`; `job-content.ts` and its test → the
    web app (it uses the DOM).
  - The Playwright `api-mocks.ts` → `apps/webapp/e2e/`.
- **Deleted:**
  - `apps/web`, `packages/client`, `apps/ios`.
  - The 12 root tests that covered only them.
  - The Svelte governance, Typst-loader, static-shell and deploy-mode scripts.
  - `wrangler.backend.toml` and `capture-references.ts`.
  - The PDF.js ≥ 6.2.108 pin, the browser Typst loader and the resume PDF tests
    come back from the tag with 4.10/4.11.
- **Kill switch:** `apps/webapp/public/sw.js` replaces the old worker at its URL.
  It deletes every cache, unregisters itself and reloads open pages, and is
  marked no-store. `e2e/retirement.pw.ts` proves it.
- **Scripts:**
  - `dev` runs the web app with the API beside it; `dev:api` runs the API alone.
  - `deploy:backend` runs migrations and deploys the API. It's safe again.
  - `deploy:web` builds the web app and deploys `dist/server/wrangler.json`.
  - `deploy` runs backend, then web.
  - `check` drops the Svelte steps; CI builds the web app only.
- **Docs:** README, AGENTS.md, CLAUDE.md, ARCHITECTURE, DEPLOYMENT, IOS.md (a note),
  and the core, tokens and web app READMEs.
- **Unchanged:** `noindex` (meta tag plus `X-Robots-Tag`).

## Domain move (done)

- `wrangler.toml` (the API) has no `routes` or `[assets]`, and it sets
  `workers_dev = false` and `preview_urls = false`. Without routes, Wrangler
  would otherwise give it a public workers.dev URL. It's reachable only through
  the web Worker's service binding.
- `apps/webapp/wrangler.jsonc` owns `pinkslip.work` and `pinkslip.alip.dev`.
- The API's `ASSETS` fallback and asset-CSP passthrough are gone, and the types
  are regenerated. `tests/legal-pages.test.ts` now asserts this topology.
- Still to clean up later: the Hono `/privacy`, `/support` and `/legal.css`
  handlers. They're unreachable, because the web app renders those pages.

## Owner: deploy day

1. Disable the Xcode Cloud workflow. It builds `apps/ios` on every push to main,
   and that folder is gone.
2. Run `bun run check` and `bun test` on a clean checkout of `main`.
3. Push `main` and the tag: `git push origin main svelte-final`.
4. `bun run deploy:web`. Wrangler should offer to move both custom domains from
   `pinkslip` to `pinkslip-web`; answer yes. If it refuses, detach them from
   `pinkslip` in the dashboard (Workers → pinkslip → Domains) and rerun.
5. `bun run deploy:backend`. The API loses its routes and assets, so its
   deploy no longer touches the site.
6. Check:
   - `https://pinkslip.work` serves the React app.
   - `https://pinkslip.alip.dev/jobs/x` returns a 308 to `pinkslip.work`.
   - `/api/v2/me` and `/.well-known/apple-app-site-association` answer through
     the web Worker.
   - Crons show in the API Worker's logs, and the queues drain.
   - A phone with the old site saved to the home screen reloads into the new one.
7. Rollback: `wrangler rollback` on each Worker. Putting `routes` back in
   `wrangler.toml` and redeploying the API returns the domains to it.
