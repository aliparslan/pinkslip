import { compareEquivalence } from "./equivalence";

const result = compareEquivalence();
if (result.status === "failed") {
  console.error(`Token equivalence failed (${result.problems.length} problems):`);
  for (const problem of result.problems.slice(0, 40)) console.error(`  ${problem}`);
  process.exit(1);
}
if (result.status === "skipped") {
  console.log(`Token equivalence skipped: ${result.reason}.`);
} else {
  console.log(`Token equivalence passed: ${result.tokens} values across ${result.contexts} contexts match the frozen Svelte styles.`);
}
