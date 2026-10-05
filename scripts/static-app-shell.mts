import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Resolve hashed font URLs and preserve metadata on the client-rendered fallback. */
export function finalizeStaticApp(directory: string): void {
  const assetDirectory = "_app/immutable/assets";
  const assets = readdirSync(join(directory, assetDirectory));
  const fonts = ["untitled-sans-vf-roman", "founders-grotesk-semibold"].map((name) => {
    const filename = assets.find((asset) => asset.startsWith(`${name}.`) && asset.endsWith(".woff2"));
    if (!filename) throw new Error(`Missing product font: ${name}`);
    return `<link rel="preload" href="/${assetDirectory}/${filename}" as="font" type="font/woff2" crossorigin>`;
  });
  for (const filename of readdirSync(directory, { recursive: true })) {
    if (typeof filename !== "string" || !filename.endsWith(".html")) continue;
    const path = join(directory, filename);
    let html = readFileSync(path, "utf8");
    if (filename === "index.html") {
      // The private app opts out of SSR, so Kit cannot render its head here.
      // Public prerendered pages supply their own route-specific metadata.
      html = html.replace("</head>", `
<title>Pinkslip — Tech jobs and job alerts</title>
<meta name="description" content="Find US software, AI, data and cybersecurity jobs that match your experience and education. Get job alerts and track applications with Pinkslip.">
<link rel="canonical" href="https://pinkslip.work/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pinkslip">
<meta property="og:title" content="Pinkslip — Tech jobs and job alerts">
<meta property="og:description" content="Find US tech jobs matched to your experience and education. Get job alerts and track applications.">
<meta property="og:url" content="https://pinkslip.work/">
<meta name="twitter:card" content="summary">
</head>`);
    }
    writeFileSync(path, html.replace("</head>", `${fonts.join("\n")}\n</head>`));
  }
}
