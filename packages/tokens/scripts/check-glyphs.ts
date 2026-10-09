import { auditFonts, checkGlyphs, describeAudit } from "./glyphs";

const strict = process.argv.includes("--strict");
for (const audit of auditFonts()) console.log(describeAudit(audit));
const failures = checkGlyphs({ strict });
if (failures.length > 0) {
  console.error(`\nFont glyph check failed${strict ? " (strict)" : ""}:`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("\nThe bought Klim files replace the trials; see packages/tokens/README.md.");
  process.exit(1);
}
console.log(strict ? "\nFont glyph check passed (strict)." : "\nFont glyph check passed.");
