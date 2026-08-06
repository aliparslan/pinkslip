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
  "packages/client/src/lib/api.ts": 850,
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

if (failures.length) {
  console.error(`Frontend governance failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (warnings.length) console.warn(`Frontend governance review:\n- ${warnings.join("\n- ")}`);

console.log(
  `Frontend governance passed: ${componentFiles.length} cataloged components; `
  + `${authoredStyleLines} authored CSS lines; ${allowedPlatformFiles.size} platform-debt files contained.`,
);
