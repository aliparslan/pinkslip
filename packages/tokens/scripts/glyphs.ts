/**
 * Font coverage contract.
 *
 * The current Klim files are trials cut down to ~67 characters, so nearly all
 * punctuation falls back to Helvetica. This check records exactly which
 * punctuation those trials cover; replacing a file with the bought font
 * automatically switches that file to full-coverage mode, where any missing
 * required glyph fails `bun run check`.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fontCodepoints } from "./woff2";

/** ASCII punctuation plus the typographic set the product actually renders. */
export const REQUIRED_PUNCTUATION =
  "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~" +
  "…‘’“”–—•·°§¶†‡€£¥¢©®™←→↑↓×÷±≤≥≠≈∞";

/**
 * sha256 and required-punctuation coverage for each trial file. A hash change
 * means the file was replaced, so the replacement must cover everything.
 */
export const TRIAL_FONTS: Record<string, { sha256: string; covered: string }> = {
  "founders-grotesk-semibold.woff2": {
    sha256: "3a69cf63384b51cc780363820c71a2928c87bf6ff0afdd28779bcf09385f472f",
    covered: ",-.",
  },
  "untitled-sans-vf-italic.woff2": {
    sha256: "7a5143df9d5cee4975d83ed1f9f2d0f7a5d56e20b809e4ee85fcffd3367f72b0",
    covered: ",-.",
  },
  "untitled-sans-vf-roman.woff2": {
    sha256: "b70ae9943ea6091d09d1065ccbda8dfca232fe75058e227515c9352bc7373883",
    covered: ",-.",
  },
};

export const defaultFontsDir = join(import.meta.dir, "..", "fonts");

export interface FontAudit {
  file: string;
  sha256: string;
  codepoints: number;
  /** Required punctuation the font does contain. */
  covered: string;
  /** Required punctuation the font does not contain. */
  missing: string;
  /** Recorded trial coverage when the file is an unchanged trial. */
  trialCoverage: string | null;
}

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

export function auditFonts(fontsDir = defaultFontsDir): FontAudit[] {
  return readdirSync(fontsDir)
    .filter((file) => file.endsWith(".woff2"))
    .sort()
    .map((file) => {
      const points = fontCodepoints(join(fontsDir, file));
      const hash = sha256(join(fontsDir, file));
      const required = [...REQUIRED_PUNCTUATION].map((character) => character.codePointAt(0)!);
      return {
        file,
        sha256: hash,
        codepoints: points.size,
        covered: [...REQUIRED_PUNCTUATION].filter((_, index) => points.has(required[index])).join(""),
        missing: [...REQUIRED_PUNCTUATION].filter((_, index) => !points.has(required[index])).join(""),
        trialCoverage: TRIAL_FONTS[file]?.sha256 === hash ? TRIAL_FONTS[file].covered : null,
      };
    });
}

export function checkGlyphs(options: { strict?: boolean; fontsDir?: string } = {}): string[] {
  const failures: string[] = [];
  for (const audit of auditFonts(options.fontsDir)) {
    const strict = options.strict || audit.trialCoverage === null;
    if (strict) {
      if (audit.missing.length > 0) {
        failures.push(`${audit.file} is missing ${audit.missing.length} required glyphs: ${audit.missing}`);
      }
    } else if (audit.covered !== audit.trialCoverage) {
      failures.push(
        `${audit.file} is the recorded trial but its coverage changed: expected ${JSON.stringify(audit.trialCoverage)}, got ${JSON.stringify(audit.covered)}`,
      );
    }
  }
  return failures;
}

export function describeAudit(audit: FontAudit): string {
  const mode = audit.trialCoverage === null ? "full coverage required" : `trial, punctuation limited to ${JSON.stringify(audit.trialCoverage)}`;
  return `${audit.file}: ${audit.codepoints} code points (${mode})`;
}
