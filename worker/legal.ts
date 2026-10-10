import { privacyPolicy, supportPage as supportContent, type LegalPage } from "../shared/legal";

export const LEGAL_STYLES = `
:root {
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: Canvas;
  color: CanvasText;
}
* { box-sizing: border-box; }
body { margin: 0; }
main {
  width: min(44rem, 100%);
  margin-inline: auto;
  padding: 3rem 1.25rem 5rem;
  line-height: 1.6;
}
header { margin-bottom: 2.5rem; }
h1, h2 { line-height: 1.18; letter-spacing: -0.02em; }
h1 { margin: 0 0 0.5rem; font-size: clamp(2rem, 8vw, 3.25rem); }
h2 { margin: 2.25rem 0 0.5rem; font-size: 1.25rem; }
p, ul { margin: 0.5rem 0 1rem; }
ul { padding-left: 1.25rem; }
li + li { margin-top: 0.45rem; }
a { color: LinkText; text-underline-offset: 0.16em; }
.eyebrow { margin: 0 0 0.4rem; font-weight: 650; }
.updated { color: GrayText; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin-top: 1.5rem; }
@media (max-width: 32rem) {
  main { padding-top: 2rem; }
}
`;

function page({ path, title, description, subtitle, bodyHtml }: LegalPage): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <title>${title} · Pinkslip</title>
  <link rel="canonical" href="https://pinkslip.work${path}">
  <link rel="stylesheet" href="/legal.css">
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">Pinkslip</p>
      <h1>${title}</h1>
      <p class="updated">${subtitle}</p>
    </header>
${bodyHtml}
  </main>
</body>
</html>`;
}

export function privacyPolicyPage(): string {
  return page(privacyPolicy);
}

export function supportPage(): string {
  return page(supportContent);
}
