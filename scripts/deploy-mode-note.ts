const mode = Bun.argv[2];

if (mode === "web") {
  console.log("Deploying the worker and a freshly built web bundle.");
} else if (mode === "backend") {
  // keep_assets keeps the published files, but the ASSETS binding and
  // run_worker_first routing belong to each worker version, and Wrangler
  // rejects an [assets] block without a local directory. A backend-only
  // version therefore serves every web page as a 404 (2026-10-05).
  console.error(
    "Backend-only deploys are disabled: they drop the web asset binding and take the site down. "
    + "Run `bun run deploy` from a clean checkout of main instead.",
  );
  process.exit(1);
} else {
  throw new Error("Expected deployment mode `web` or `backend`.");
}
