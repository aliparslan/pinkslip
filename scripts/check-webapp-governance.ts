/**
 * Governance for the React webapp. Four rules from the port plan's styling
 * contract are mechanical enough to enforce:
 *   1. `@base-ui/react` is imported only under `src/kit/`.
 *   2. `className` is never a string literal.
 *   3. Inline `style` carries dynamic custom properties only.
 *   4. No Tailwind/NativeWind dependency or import.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const sourceRoot = resolve(repoRoot, "apps/webapp/src");
const kitRoot = resolve(sourceRoot, "kit");

const TAILWIND_IMPORT = /(?:from\s+["']|import\(\s*["']|import\s+["'])((?:tailwindcss|@tailwindcss\/|nativewind)[^"']*)["']/;

function attributeExpressions(source: string, attribute: string): string[] {
  const expressions: string[] = [];
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*`, "g");
  for (const match of source.matchAll(pattern)) {
    let cursor = match.index + match[0].length;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
    if (source[cursor] !== "{") {
      expressions.push(source.slice(cursor, cursor + 40).split("\n")[0]);
      continue;
    }
    let depth = 0;
    const start = cursor;
    while (cursor < source.length) {
      if (source[cursor] === "{") depth++;
      else if (source[cursor] === "}") {
        depth--;
        if (depth === 0) {
          cursor++;
          break;
        }
      }
      cursor++;
    }
    expressions.push(source.slice(start, cursor));
  }
  return expressions;
}

function isStringLiteral(expression: string): boolean {
  const trimmed = expression.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return true;
  if (!trimmed.startsWith("{")) return false;
  const inner = trimmed.slice(1, -1).trim();
  if (inner.startsWith('"') || inner.startsWith("'")) return true;
  if (inner.startsWith("`") && !inner.includes("${")) return true;
  return false;
}

/** Advances past one value expression, stopping at a top-level comma or the object's close. */
function skipValue(objectText: string, index: number): number {
  let depth = 0;
  while (index < objectText.length) {
    const char = objectText[index];
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      index++;
      while (index < objectText.length && objectText[index] !== quote) {
        if (objectText[index] === "\\") index++;
        index++;
      }
      index++;
      continue;
    }
    if ("{([".includes(char)) depth++;
    else if ("})]".includes(char)) {
      if (depth === 0) return index;
      depth--;
    } else if (char === "," && depth === 0) return index;
    index++;
  }
  return index;
}

/** Property names at the top level of a JSX style object literal. */
export function topLevelKeys(objectText: string): string[] {
  const keys: string[] = [];
  const open = objectText.indexOf("{");
  if (open < 0) return keys;
  let index = open + 1;
  while (index < objectText.length) {
    const char = objectText[index];
    if (/\s|,/.test(char)) {
      index++;
      continue;
    }
    if (char === "}") break;
    if (objectText.startsWith("...", index)) {
      index = skipValue(objectText, index + 3);
      continue;
    }
    let key: string | null = null;
    if (char === '"' || char === "'") {
      let cursor = index + 1;
      key = "";
      while (cursor < objectText.length && objectText[cursor] !== char) key += objectText[cursor++];
      index = cursor + 1;
    } else {
      const match = /^[A-Za-z_$][\w$]*/.exec(objectText.slice(index));
      if (match) {
        key = match[0];
        index += key.length;
      }
    }
    if (key === null) {
      index++;
      continue;
    }
    while (/\s/.test(objectText[index] ?? "")) index++;
    if (objectText[index] === ":") {
      keys.push(key);
      index = skipValue(objectText, index + 1);
      continue;
    }
    if (objectText[index] === "," || objectText[index] === "}" || objectText[index] === undefined) {
      keys.push(key);
      continue;
    }
    index = skipValue(objectText, index);
  }
  return keys;
}

function isStyleObject(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed.startsWith("{")) return false;
  return trimmed.slice(1).trim().startsWith("{");
}

export function checkWebappSource(path: string, source: string): string[] {
  const label = relative(repoRoot, path);
  const violations: string[] = [];

  if (!path.startsWith(`${kitRoot}/`)) {
    for (const match of source.matchAll(/from\s+["'](@base-ui\/react[^"']*)["']|import\(\s*["'](@base-ui\/react[^"']*)["']|import\s+["'](@base-ui\/react[^"']*)["']/g)) {
      violations.push(`${label}: imports ${match[1] ?? match[2] ?? match[3]} outside src/kit/`);
    }
  }

  for (const expression of attributeExpressions(source, "className")) {
    if (isStringLiteral(expression)) violations.push(`${label}: className must be a CSS module reference, not a string literal`);
  }

  for (const expression of attributeExpressions(source, "style")) {
    if (isStringLiteral(expression)) {
      violations.push(`${label}: inline style must be an object of dynamic custom properties`);
      continue;
    }
    if (!isStyleObject(expression)) continue;
    const inner = expression.trim().slice(1, -1);
    for (const key of topLevelKeys(inner)) {
      if (!key.startsWith("--")) violations.push(`${label}: inline style property ${JSON.stringify(key)} is not a custom property`);
    }
  }

  const tailwind = TAILWIND_IMPORT.exec(source);
  if (tailwind) violations.push(`${label}: imports ${tailwind[1]}; the webapp is CSS Modules plus tokens`);

  return violations;
}

export function checkWebappDependencies(path: string, contents: string): string[] {
  const manifest = JSON.parse(contents) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  return Object.keys(dependencies)
    .filter((name) => /tailwind|nativewind/.test(name))
    .map((name) => `${relative(repoRoot, path)}: depends on ${name}; the webapp is CSS Modules plus tokens`);
}

function findSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findSources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

if (import.meta.main) {
  const failures: string[] = [];
  for (const path of findSources(sourceRoot)) failures.push(...checkWebappSource(path, readFileSync(path, "utf8")));
  for (const manifest of [join(repoRoot, "package.json"), join(repoRoot, "apps/webapp/package.json")]) {
    failures.push(...checkWebappDependencies(manifest, readFileSync(manifest, "utf8")));
  }
  if (failures.length > 0) {
    console.error(`Webapp governance failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Webapp governance passed: kit-only Base UI imports, module class names, custom-property styles, no Tailwind.");
}
