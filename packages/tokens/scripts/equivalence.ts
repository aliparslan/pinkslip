/**
 * Compares every resolved token value with the frozen Svelte stylesheet.
 *
 * The browser resolves `var()` at use time, so equality is checked per cascade
 * context (mode, contrast, reduced motion, wide layout) after resolving every
 * reference. This runs as a test and as `bun run check:equivalence`. The
 * Svelte app was deleted in chunk 3.4; `reference/` keeps a verbatim copy of its
 * two stylesheets from the `svelte-final` tag, so the comparison still runs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { breakpoints, intentionalDivergences } from "../src/tokens";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const generatedPath = join(repoRoot, "packages/tokens/src/tokens.css");
const referencePaths = [
  join(repoRoot, "packages/tokens/reference/svelte-tokens.css"),
  join(repoRoot, "packages/tokens/reference/svelte-typography.css"),
];

interface Context {
  light: boolean;
  contrastAttribute: boolean;
  contrastMedia: boolean;
  reducedMotion: boolean;
  wide: boolean;
}

interface Rule {
  conditions: string[];
  selector: string;
  declarations: Map<string, string>;
}

export type EquivalenceResult =
  | { status: "compared"; contexts: number; tokens: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; problems: string[] };

const CONTEXT_COMBINATIONS: Context[] = [];
for (const light of [false, true]) {
  for (const contrastAttribute of [false, true]) {
    for (const contrastMedia of [false, true]) {
      for (const reducedMotion of [false, true]) {
        for (const wide of [false, true]) {
          CONTEXT_COMBINATIONS.push({ light, contrastAttribute, contrastMedia, reducedMotion, wide });
        }
      }
    }
  }
}

function parseCss(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");

  function readDeclarations(body: string): Map<string, string> {
    const declarations = new Map<string, string>();
    for (const part of body.split(";")) {
      const declaration = part.trim();
      if (!declaration) continue;
      const separator = declaration.indexOf(":");
      if (separator < 0) throw new Error(`Malformed declaration: ${declaration}`);
      declarations.set(declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim());
    }
    return declarations;
  }

  function parseRules(source: string, conditions: string[]): Rule[] {
    const rules: Rule[] = [];
    let position = 0;
    while (position < source.length) {
      while (position < source.length && /\s/.test(source[position])) position++;
      if (position >= source.length) break;
      const start = position;
      while (position < source.length && source[position] !== "{" && source[position] !== ";") position++;
      if (position >= source.length) break;
      if (source[position] === ";") {
        position++;
        continue;
      }
      const header = source.slice(start, position).trim();
      let depth = 1;
      const bodyStart = ++position;
      while (position < source.length && depth > 0) {
        if (source[position] === "{") depth++;
        else if (source[position] === "}") depth--;
        position++;
      }
      if (depth !== 0) throw new Error(`Unbalanced braces after: ${header}`);
      const body = source.slice(bodyStart, position - 1);
      if (header.startsWith("@media")) {
        rules.push(...parseRules(body, [...conditions, header.slice("@media".length).trim()]));
      } else if (header.startsWith("@layer")) {
        rules.push(...parseRules(body, conditions));
      } else if (header.startsWith("@")) {
        continue;
      } else {
        for (const selector of header.split(",")) {
          rules.push({ conditions, selector: selector.trim(), declarations: readDeclarations(body) });
        }
      }
    }
    return rules;
  }

  return parseRules(text, []);
}

function selectorMatches(selector: string, context: Context): boolean {
  const normalized = selector.replace(/\s+/g, "");
  switch (normalized) {
    case ":root":
      return true;
    case '[data-mode="light"]':
    case ':root[data-mode="light"]':
      return context.light;
    case ':root[data-ios-contrast="more"]':
      return context.contrastAttribute;
    case ':root[data-mode="light"][data-ios-contrast="more"]':
      return context.light && context.contrastAttribute;
    default:
      throw new Error(`Unhandled selector in a token stylesheet: ${selector}`);
  }
}

function mediaMatches(condition: string, context: Context): boolean {
  const normalized = condition.replace(/\s+/g, " ").trim();
  if (normalized === `(min-width: ${breakpoints.wide}px)`) return context.wide;
  if (normalized === "(prefers-contrast: more)") return context.contrastMedia;
  if (normalized === "(prefers-reduced-motion: reduce)") return context.reducedMotion;
  throw new Error(`Unhandled media query in a token stylesheet: ${condition}`);
}

function declarationsFor(rules: Rule[], context: Context): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const rule of rules) {
    if (!rule.conditions.every((condition) => mediaMatches(condition, context))) continue;
    if (!selectorMatches(rule.selector, context)) continue;
    for (const [name, value] of rule.declarations) declarations.set(name, value);
  }
  return declarations;
}

function resolveAll(declarations: Map<string, string>): Map<string, string> {
  const resolved = new Map<string, string>();
  const resolve = (name: string, seen: string[]): string => {
    const cached = resolved.get(name);
    if (cached !== undefined) return cached;
    const raw = declarations.get(name);
    if (raw === undefined) throw new Error(`Unresolved variable ${name}`);
    if (seen.includes(name)) throw new Error(`Circular reference: ${[...seen, name].join(" -> ")}`);
    const value = raw.replace(/var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/g, (_match, reference: string, fallback?: string) => {
      if (declarations.has(reference)) return resolve(reference, [...seen, name]);
      if (fallback !== undefined) return fallback.trim();
      throw new Error(`Unresolved variable ${reference} referenced by ${name}`);
    });
    resolved.set(name, value);
    return value;
  };
  for (const name of declarations.keys()) resolve(name, []);
  return resolved;
}

export function compareEquivalence(): EquivalenceResult {
  const missing = referencePaths.filter((path) => !existsSync(path));
  if (!existsSync(generatedPath) || missing.length > 0) {
    return { status: "skipped", reason: "the frozen Svelte styles were removed with chunk 3.4" };
  }

  // The frozen typography file also owns font faces and body rules; only its
  // token block participates in the comparison.
  const referenceRules = [
    ...parseCss(readFileSync(referencePaths[0], "utf8")),
    ...parseCss(readFileSync(referencePaths[1], "utf8")).filter((rule) => rule.selector === ":root"),
  ];
  const generatedRules = parseCss(readFileSync(generatedPath, "utf8"));

  const problems: string[] = [];
  let tokens = 0;
  for (const context of CONTEXT_COMBINATIONS) {
    const reference = resolveAll(declarationsFor(referenceRules, context));
    const generated = resolveAll(declarationsFor(generatedRules, context));
    if (tokens === 0) tokens = reference.size;
    const names = new Set([...reference.keys(), ...generated.keys()]);
    const label = [
      context.light ? "light" : "dark",
      context.contrastAttribute ? "contrast-attribute" : null,
      context.contrastMedia ? "contrast-media" : null,
      context.reducedMotion ? "reduced-motion" : null,
      context.wide ? "wide" : null,
    ].filter(Boolean).join("/");
    for (const name of names) {
      const expected = reference.get(name);
      const actual = generated.get(name);
      if (expected === actual || name in intentionalDivergences) continue;
      if (expected === undefined) problems.push(`${label}: ${name} only exists in the generated stylesheet`);
      else if (actual === undefined) problems.push(`${label}: ${name} is missing from the generated stylesheet`);
      else problems.push(`${label}: ${name} is ${actual}, expected ${expected}`);
    }
  }

  if (problems.length > 0) return { status: "failed", problems };
  return { status: "compared", contexts: CONTEXT_COMBINATIONS.length, tokens };
}
