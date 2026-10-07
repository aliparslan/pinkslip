import { basename, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const read = (path: string) => Bun.file(resolve(root, path)).text();
const lineCount = (text: string) => text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);
const failures: string[] = [];
const warnings: string[] = [];

// These are deliberately rounded review thresholds, not exact LOC budgets.
// Crossing one prints a warning so reviewers inspect responsibilities and
// dependencies; it does not reward compression or arbitrary file splitting.
const reviewThresholds: Record<string, number> = {
  "apps/ios/src/IosApp.svelte": 550,
  "packages/client/src/app.css": 3200,
  "packages/client/src/components/JobRow.svelte": 750,
  "packages/client/src/components/Onboarding.svelte": 600,
  "packages/client/src/components/SearchProfileFields.svelte": 500,
  "packages/core/src/api.ts": 850,
  "packages/ui/src/styles/motion.css": 400,
  "packages/ui/src/styles/skin.css": 500,
  "packages/client/src/pages/Companies.svelte": 1100,
  "packages/client/src/pages/Feed.svelte": 1100,
  "packages/client/src/pages/JobDetail.svelte": 900,
  "packages/client/src/pages/Profile.svelte": 650,
  "packages/client/src/pages/ResumeProfile.svelte": 1500,
  "packages/client/src/pages/Tailor.svelte": 900,
  "packages/client/src/pages/profile/AdminSection.svelte": 950,
  "packages/client/src/styles/ios.css": 350,
  "packages/client/src/styles/reset.css": 125,
  "packages/client/src/styles/tokens.css": 250,
};

for (const [path, threshold] of Object.entries(reviewThresholds)) {
  const lines = lineCount(await read(path));
  if (lines > threshold) warnings.push(`${path} is ${lines} lines (review threshold ${threshold})`);
}

const pageFiles = [...new Bun.Glob("packages/client/src/pages/**/*.svelte").scanSync({ cwd: root })];
const componentFiles = [...new Bun.Glob("packages/client/src/components/*.svelte").scanSync({ cwd: root })];
const svelteFiles = [
  ...new Bun.Glob("apps/ios/src/**/*.svelte").scanSync({ cwd: root }),
  ...new Bun.Glob("apps/web/src/**/*.svelte").scanSync({ cwd: root }),
  ...new Bun.Glob("packages/client/src/**/*.svelte").scanSync({ cwd: root }),
];
const cssFiles = [...new Bun.Glob("packages/client/src/**/*.css").scanSync({ cwd: root })];

const sharedProductFonts = [
  "packages/client/src/assets/fonts/product/untitled-sans-vf-roman.woff2",
  "packages/client/src/assets/fonts/product/untitled-sans-vf-italic.woff2",
  "packages/client/src/assets/fonts/product/founders-grotesk-semibold.woff2",
];
for (const path of sharedProductFonts) {
  if (!await Bun.file(resolve(root, path)).exists()) {
    failures.push(`${path} is missing from the tracked shared font source`);
  }
}

const frontendAuthoredFiles = [
  "apps/ios/index.html",
  "apps/ios/vite.config.ts",
  "apps/web/src/app.html",
  "apps/web/vite.config.ts",
  ...new Bun.Glob("apps/{ios,web}/src/**/*.{css,svelte,ts}").scanSync({ cwd: root }),
  ...new Bun.Glob("packages/client/src/**/*.{css,svelte,ts}").scanSync({ cwd: root }),
];
for (const path of frontendAuthoredFiles) {
  const source = await read(path);
  if (/local-preview|test-[^\s"')]+\.woff2|apps\/(?:ios|web)\/src\/fonts/.test(source)) {
    failures.push(`${path} references an ignored preview or bundle-local font`);
  }
}

for (const path of pageFiles) {
  if (path in reviewThresholds) continue;
  const lines = lineCount(await read(path));
  if (lines > 500) warnings.push(`${path} is ${lines} lines (page review threshold 500)`);
}

for (const path of componentFiles) {
  if (path in reviewThresholds) continue;
  const source = await read(path);
  const lines = lineCount(source);
  if (lines > 300) warnings.push(`${path} is ${lines} lines (component review threshold 300)`);
  const styles = source.match(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g) ?? [];
  const styleLines = styles.reduce((total, block) => total + lineCount(block), 0);
  if (styleLines > 200) warnings.push(`${path} owns ${styleLines} style lines (review threshold 200)`);
}

let authoredStyleLines = 0;
for (const path of cssFiles) authoredStyleLines += lineCount(await read(path));
for (const path of svelteFiles) {
  const source = await read(path);
  for (const match of source.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)) {
    authoredStyleLines += lineCount(match[1] ?? "");
  }
}
if (authoredStyleLines > 6000) {
  warnings.push(`authored frontend CSS is ${authoredStyleLines} lines (review threshold 6000)`);
}

const catalog = await read("packages/client/src/components/COMPONENTS.md");
for (const path of componentFiles) {
  const name = basename(path, ".svelte");
  if (!catalog.includes(name)) failures.push(`${basename(path)} is missing from COMPONENTS.md`);
}

const clientFiles = [
  ...new Bun.Glob("packages/client/src/**/*.{css,svelte,ts}").scanSync({ cwd: root }),
];
const allowedPlatformFiles = new Set([
  "packages/client/src/app/AppSession.svelte",
  "packages/client/src/app/RouteView.svelte",
  "packages/client/src/components/CompanyLogo.svelte",
  "packages/client/src/components/JobRow.svelte",
  "packages/client/src/components/Modal.svelte",
  "packages/client/src/components/ScreenNav.svelte",
  "packages/client/src/components/SearchProfileFields.svelte",
  "packages/client/src/components/TabBar.svelte",
  "packages/client/src/components/Toast.svelte",
  "packages/client/src/lib/application-intent.svelte.ts",
  "packages/client/src/lib/drag-dismiss.ts",
  "packages/client/src/lib/feedback.svelte.ts",
  "packages/client/src/lib/native-push.ts",
  "packages/client/src/lib/platform.ts",
  "packages/client/src/pages/Admin.svelte",
  "packages/client/src/pages/Companies.svelte",
  "packages/client/src/pages/Feed.svelte",
  "packages/client/src/pages/JobDetail.svelte",
  "packages/client/src/pages/JobLibrary.svelte",
  "packages/client/src/pages/Profile.svelte",
  "packages/client/src/pages/ResumeProfile.svelte",
  "packages/client/src/pages/Tailor.svelte",
  "packages/client/src/pages/profile/TailorSection.svelte",
  "packages/client/src/styles/ios.css",
]);

let iosChecks = 0;
let nativeSelectors = 0;
for (const path of clientFiles) {
  const source = await read(path);
  const checks = source.match(/\bisIosApp\(/g)?.length ?? 0;
  const selectors = source.match(/html\.native-ios/g)?.length ?? 0;
  iosChecks += checks;
  nativeSelectors += selectors;
  if ((checks || selectors) && !allowedPlatformFiles.has(path)) {
    failures.push(`${path} introduces a new shared platform branch; use a shell, token, or adaptive component`);
  }
}
if (iosChecks > 40) warnings.push(`shared isIosApp() calls reached ${iosChecks} (review threshold 40)`);
if (nativeSelectors > 45) warnings.push(`html.native-ios selectors reached ${nativeSelectors} (review threshold 45)`);

const frameworkFiles = [
  "apps/ios/package.json",
  "apps/ios/vite.config.ts",
  "apps/web/package.json",
  "apps/web/vite.config.ts",
  ...cssFiles,
];
for (const path of frameworkFiles) {
  if (/tailwindcss|@theme|@apply|@tailwind/.test(await read(path))) {
    failures.push(`${path} reintroduces the removed utility-CSS framework`);
  }
}

// ------------------------------------------------- React design system
// packages/ui owns every visual decision for the React apps: tokens in
// theme.css, paint in skin.css, motion in motion.css, components in src/.
// These checks keep the apps from growing a second, inline design system.

const uiStyleDir = "packages/ui/src/styles";
const uiModules = [...new Bun.Glob("packages/ui/src/**/*.{ts,tsx}").scanSync({ cwd: root })];
const uiComponents = [...new Bun.Glob("packages/ui/src/*.tsx").scanSync({ cwd: root })];
const uiCss = [...new Bun.Glob(`${uiStyleDir}/*.css`).scanSync({ cwd: root })];
const reactAppModules = [...new Bun.Glob("apps/web-react/src/**/*.{ts,tsx}").scanSync({ cwd: root })];
const reactAppCss = [...new Bun.Glob("apps/web-react/src/**/*.css").scanSync({ cwd: root })];
const playgroundDir = "apps/web-react/src/playground/";

const quotedStrings = (source: string) =>
  [...source.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((match) => match[1] ?? match[2] ?? "");
const colorLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/i;
// A raw number of milliseconds, or a Tailwind duration/delay, instead of a --dur-* token.
const rawDurationClass = /(?:^|:)(?:duration|delay)-(?:\d|\[)/;
// Arbitrary values for things the theme already decides. Layout values
// (widths, grid tracks, viewport math) stay allowed.
const offSystemArbitrary = /(?:^|:)(?:bg|text|border|outline|ring|shadow|fill|stroke|from|via|to|rounded|font|leading|tracking|ease|duration|delay|blur|backdrop-blur|opacity|z)-\[/;
const skinClass = /^ps-(?:btn|field|track|seg|toggle|bar|mark|switch|thumb|slider|gauge|surface|sheet|tooltip|item|chip|avatar|pill|card|choice)/;
const paintUtility = /(?:^|:)(?:bg|shadow|from|via|to)-|(?:^|:)border-(?:line|ink|accent|bad|good|warn|transparent|control)/;

for (const path of [...uiModules, ...reactAppModules]) {
  const source = await read(path);
  const inPlayground = path.startsWith(playgroundDir);
  if (colorLiteral.test(source)) failures.push(`${path} has a color literal; colors live in ${uiStyleDir}/theme.css`);
  for (const literal of quotedStrings(source)) {
    const tokens = literal.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (rawDurationClass.test(token)) failures.push(`${path} uses ${token}; use a dur-* token or a motion-* class`);
      if (offSystemArbitrary.test(token)) failures.push(`${path} uses ${token}; use the theme's token for it`);
    }
    if (path.startsWith("packages/ui/") && tokens.some((token) => skinClass.test(token))) {
      for (const token of tokens.filter((token) => paintUtility.test(token))) {
        failures.push(`${path} paints a skinned element with ${token}; paint belongs in skin.css`);
      }
    }
  }
  if (!inPlayground && path.startsWith("apps/web-react/") && /from "@base-ui\/react/.test(source)) {
    failures.push(`${path} imports Base UI directly; use or extend @pinkslip/ui`);
  }
  if (path.startsWith("packages/ui/")) {
    for (const [, specifier] of source.matchAll(/from "([^"]+)"/g)) {
      if (!/^(?:react|react-dom|clsx|@base-ui\/react\/[\w-]+|\.\.?\/.*)$/.test(specifier!)) {
        failures.push(`${path} imports ${specifier}; packages/ui stays free of app, API, and domain code`);
      }
    }
  }
}

const motionScaled = /calc\(\d+m?s \* var\(--motion-scale\)\)/g;
for (const path of [...uiCss, ...reactAppCss]) {
  const source = await read(path);
  const name = basename(path);
  if (/@theme\b/.test(source) && path !== `${uiStyleDir}/theme.css`) {
    failures.push(`${path} declares @theme; tokens live only in ${uiStyleDir}/theme.css`);
  }
  if (path === `${uiStyleDir}/theme.css`) continue;
  if (name !== "skin.css" && colorLiteral.test(source.replace(/\/\*[\s\S]*?\*\//g, ""))) {
    failures.push(`${path} has a color literal; colors live in theme.css, paint in skin.css`);
  }
  const durations = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(motionScaled, "").match(/(?<![\w.-])\d*\.?\d+m?s\b/g) ?? [];
  for (const value of durations.filter((value) => !/^(?:0m?s|1ms)$/.test(value))) {
    failures.push(`${path} has a raw duration ${value}; use a --dur-* token`);
  }
}

const uiCatalog = await read("packages/ui/README.md");
for (const path of uiComponents) {
  const name = basename(path, ".tsx");
  if (!uiCatalog.includes(`${name}.tsx`)) failures.push(`packages/ui/src/${name}.tsx is missing from packages/ui/README.md`);
}

if (failures.length) {
  console.error(`Frontend governance failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (warnings.length) console.warn(`Frontend governance review:\n- ${warnings.join("\n- ")}`);

console.log(
  `Frontend governance passed: ${componentFiles.length} cataloged components; `
  + `${authoredStyleLines} authored CSS lines; ${allowedPlatformFiles.size} platform-debt files contained; `
  + `${uiComponents.length} React design-system modules cataloged.`,
);
