const mode = Bun.argv[2];

if (mode === "web") {
  console.log("Deploying the worker and a freshly built web bundle.");
} else if (mode === "backend") {
  console.warn(
    "Backend-only deploy: the currently published web bundle will be kept unchanged. "
    + "Use `bun run deploy` when a release includes frontend changes.",
  );
} else {
  throw new Error("Expected deployment mode `web` or `backend`.");
}
