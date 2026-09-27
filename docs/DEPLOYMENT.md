# Deployment modes

Use `bun run deploy` (or its explicit alias, `bun run deploy:web`) for every
release that changes the browser app. It builds the frontend, applies remote
database migrations, and publishes the worker with the new static assets.

`bun run deploy:backend` intentionally preserves the already-published static
assets through `wrangler.backend.toml`. It is only for worker or API changes
that do not depend on a new frontend. The command prints this distinction
before it starts so a backend-only release cannot be mistaken for a web
release.

The service worker checks for a new release at startup and when a tab becomes
active. New workers activate immediately, clear the retired navigation cache,
and reload controlled tabs once. HTML navigations always revalidate the
network; revisioned assets under `/assets/` remain long-lived and immutable.
