/**
 * One idea, one icon (shared/icons.ts), on iOS and the web. Fails on:
 *
 *   off-table    a Phosphor icon a screen imports that isn't in the table
 *   sf-symbol    one of Apple's SF Symbols on iOS, in a screen, a menu or an alert button
 *   menu-image   an iOS menu image that isn't its Phosphor glyph
 *   missing      an alert button naming an image the app doesn't ship
 *
 * Kit pages are exempt: they show options side by side on purpose. A
 * deliberate exception carries `intentional: why` on its line or the line above.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { ICONS } from "../shared/icons";

const repo = resolve(import.meta.dir, "..");
const nativeRoot = join(repo, "apps/native");
const webRoot = join(repo, "apps/webapp");
const catalog = join(nativeRoot, "ios/Pinkslip/Images.xcassets");
const phosphorDefs = join(webRoot, "node_modules/@phosphor-icons/react/dist/defs");

const table = new Set<string>(Object.values(ICONS));
/** Types the Phosphor packages export next to the icons. */
const NOT_ICONS = new Set(["Icon", "IconProps", "IconWeight", "IconContext"]);
/** Drawn for Pinkslip on Phosphor's grid (shared/icons.ts). */
const DRAWN = new Set(["bot"]);

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "Pods" || name === "build") return [];
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|swift)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

const isKitPage = (path: string) => /apps\/native\/src\/features\/kit\/|apps\/native\/src\/app\/.*\/you\/kit[^/]*\.tsx$|apps\/webapp\/src\/routes\/\[_\]kit\.tsx$/.test(path);
const SF_SYMBOL = /\bsystemName\s*[=:]|\bsystemImage\b|systemImageName|SymbolView|from ["']expo-symbols["']/;
const intentional = (lines: string[], index: number) => /intentional:/.test(lines[index] ?? "") || /intentional:/.test(lines[index - 1] ?? "");

const failures: string[] = [];
const fail = (rule: string, where: string, detail: string) => failures.push(`  ${rule}  ${where}  ${detail}`);

const sources = [...files(join(nativeRoot, "src")), ...files(join(nativeRoot, "modules")), ...files(join(webRoot, "src"))];
for (const path of sources) {
  if (isKitPage(path)) continue;
  const rel = relative(repo, path);
  const source = readFileSync(path, "utf8");
  const lines = source.split("\n");
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](?:phosphor-react-native|@phosphor-icons\/react)["']/g)) {
    const line = source.slice(0, match.index).split("\n").length - 1;
    if (intentional(lines, line)) continue;
    for (const part of match[1]!.split(",")) {
      const name = part.trim();
      if (!name || name.startsWith("type ")) continue;
      // The native package exports Path as PathIcon (Path would clash with SVG's).
      const imported = name.split(/\s+as\s+/)[0]!.trim().replace(/^PathIcon$/, "Path");
      if (!NOT_ICONS.has(imported) && !table.has(imported)) fail("off-table", `${rel}:${line + 1}`, imported);
    }
  }
  lines.forEach((text, index) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(text) || intentional(lines, index)) return;
    if (rel.startsWith("apps/native/") && SF_SYMBOL.test(text)) fail("sf-symbol", `${rel}:${index + 1}`, text.trim().slice(0, 90));
    for (const named of text.matchAll(/templateImageName:\s*"([^"]+)"/g)) {
      if (!existsSync(join(catalog, `${named[1]}.imageset`))) fail("missing", `${rel}:${index + 1}`, named[1]!);
    }
  });
}

// Every menu image is the regular (or, for Saved, filled) drawing of an icon in the table.
const glyphPaths = new Map<string, string>();
for (const name of table) {
  const def = join(phosphorDefs, `${name}.es.js`);
  if (!existsSync(def)) { fail("off-table", "shared/icons.ts", `${name} is not a Phosphor icon`); continue; }
  const source = readFileSync(def, "utf8");
  for (const weight of ["regular", "fill"]) {
    const block = source.split(`"${weight}",`)[1]?.split(/\n\s*\],?\n/)[0] ?? "";
    for (const path of block.matchAll(/\bd:\s*"([^"]+)"/g)) glyphPaths.set(path[1]!, name);
  }
}
for (const entry of readdirSync(catalog).filter((name) => /^menu-.*\.imageset$/.test(name))) {
  const name = basename(entry, ".imageset").slice("menu-".length);
  if (DRAWN.has(name)) continue;
  const svg = readFileSync(join(catalog, entry, `menu-${name}.svg`), "utf8");
  const paths = [...svg.matchAll(/\bd="([^"]+)"/g)].map((match) => match[1]!);
  if (paths.length === 0 || !paths.every((path) => glyphPaths.has(path))) fail("menu-image", `Images.xcassets/${entry}`, "not a Phosphor icon from the table");
}

if (failures.length > 0) {
  console.error("Icons off the shared table (scripts/check-icons.ts). Use an icon from shared/icons.ts, add the idea there, or mark a deliberate one `intentional: why`:");
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Icon check passed: ${table.size} icons in the table, ${sources.length} files.`);
