/**
 * Keeps the iOS screens on the kit (direction D2 in docs/research/
 * directions.md, owner 2026-11-08), as `scripts/check-webapp-governance.ts`
 * does for the web. Outside `src/ui` and `src/kit` (and the kit's own sample
 * pages), a screen draws with kit parts and kit values:
 *
 *   raw-pressable  `<Pressable>` from react-native (use Button, ListItem, IconButton, PressableScale)
 *   raw-textinput  `<TextInput>` from react-native (use TextField, SearchField, Form parts)
 *   raw-text       react-native's `Text` (use the kit's Text, which sets type and Dynamic Type)
 *   font-size      a numeric fontSize (use a type role)
 *   font-weight    a numeric fontWeight (use the Text weight prop)
 *   spacing        a numeric padding, margin or gap (use theme.ui.space or theme.ui.size)
 *   hex            a hex colour (use theme.ui.color)
 *
 * What's there today is the baseline (`kit-baseline.json`); only new cases
 * fail, so the list can only shrink. A deliberate one carries an
 * `// intentional: why` comment on its line or the line above.
 *
 *   bun scripts/check-kit.ts           check
 *   bun scripts/check-kit.ts --update  write today's counts as the baseline
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

type Rule = "raw-pressable" | "raw-textinput" | "raw-text" | "font-size" | "font-weight" | "spacing" | "hex";
type Counts = Partial<Record<Rule, number>>;

const appRoot = resolve(import.meta.dir, "..");
const sourceRoot = join(appRoot, "src");
const baselinePath = join(import.meta.dir, "kit-baseline.json");

/** The kit itself, and its sample pages, which show parts on purpose. */
function exempt(path: string): boolean {
  const rel = relative(sourceRoot, path);
  return rel.startsWith("ui/") || rel.startsWith("kit/") || rel.startsWith("features/kit/") || /app\/\(tabs\)\/\(you\)\/you\/kit[^/]*\.tsx$/.test(rel);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

/** Names a file imports from react-native, with their local aliases. */
function reactNativeImports(source: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']react-native["']/g)) {
    for (const part of match[1]!.split(",")) {
      const [name, alias] = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      if (name) names.set(name.trim(), (alias ?? name).trim());
    }
  }
  return names;
}

const SPACING = /\b(?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?\s*:\s*-?(?!0\b)\d|\b(?:gap|rowGap|columnGap)\s*:\s*(?!0\b)\d/;

function findings(path: string): { rule: Rule; line: number; text: string }[] {
  const source = readFileSync(path, "utf8");
  const lines = source.split("\n");
  const rn = reactNativeImports(source);
  const tag = (name: string) => (rn.has(name) ? new RegExp(`<${rn.get(name)}\\b`) : null);
  const checks: [Rule, RegExp | null][] = [
    ["raw-pressable", tag("Pressable")],
    ["raw-textinput", tag("TextInput")],
    ["raw-text", tag("Text")],
    ["font-size", /\bfontSize\s*:\s*\d/],
    ["font-weight", /\bfontWeight\s*:\s*["']?\d/],
    ["spacing", SPACING],
    ["hex", /["'`]#[0-9a-fA-F]{3,8}\b/],
  ];
  const out: { rule: Rule; line: number; text: string }[] = [];
  lines.forEach((text, index) => {
    if (/intentional:/.test(text) || (index > 0 && /intentional:/.test(lines[index - 1]!))) return;
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) return;
    for (const [rule, pattern] of checks) if (pattern?.test(text)) out.push({ rule, line: index + 1, text: text.trim() });
  });
  return out;
}

const current = new Map<string, { counts: Counts; found: ReturnType<typeof findings> }>();
for (const path of files(sourceRoot)) {
  if (exempt(path)) continue;
  const found = findings(path);
  if (found.length === 0) continue;
  const counts: Counts = {};
  for (const { rule } of found) counts[rule] = (counts[rule] ?? 0) + 1;
  current.set(relative(appRoot, path), { counts, found });
}

if (process.argv.includes("--update")) {
  const baseline = Object.fromEntries([...current].sort(([a], [b]) => a.localeCompare(b)).map(([file, { counts }]) => [file, counts]));
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  const total = [...current.values()].reduce((sum, { found }) => sum + found.length, 0);
  console.log(`Kit baseline written: ${total} cases in ${current.size} files.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Record<string, Counts>;
const failures: string[] = [];
let shrinkable = 0;
for (const [file, { counts, found }] of current) {
  for (const [rule, count] of Object.entries(counts) as [Rule, number][]) {
    const allowed = baseline[file]?.[rule] ?? 0;
    if (count > allowed) {
      const lines = found.filter((entry) => entry.rule === rule).map((entry) => `    ${file}:${entry.line}  ${entry.text}`);
      failures.push(`  ${rule} in ${file}: ${count}, baseline ${allowed}\n${lines.join("\n")}`);
    }
  }
}
for (const [file, counts] of Object.entries(baseline)) {
  for (const [rule, allowed] of Object.entries(counts) as [Rule, number][]) {
    const count = current.get(file)?.counts[rule] ?? 0;
    if (count < allowed) shrinkable += allowed - count;
  }
}

if (failures.length > 0) {
  console.error("Screens off the kit (scripts/check-kit.ts). Use a kit part or value, or mark a deliberate one `// intentional: why`:");
  console.error(failures.join("\n"));
  process.exit(1);
}
const total = [...current.values()].reduce((sum, { found }) => sum + found.length, 0);
console.log(`Kit check passed: ${total} known cases${shrinkable > 0 ? `; ${shrinkable} fixed since the baseline, so run --update to lock that in` : ""}.`);
