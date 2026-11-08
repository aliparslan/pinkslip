import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";

const dir = new URL("../../worker/adapters/", import.meta.url).pathname;
const UPDATED = /\b(?:t_update|updated_?(?:at|date|on|ts|time)|modified_?(?:at|date|on|ts)?|last_?(?:mod|modified|updated)\w*)\b/i;
const POSTED = /\bposted(?:at|ts|_ts|on|_at)\b/i;

// Greenhouse only publishes updated_at, and the apps label that date "Updated".
const ALLOWED = new Set(["greenhouse.ts"]);

function offendingLines(source: string): string[] {
  const lines = source.split("\n").map((line) => line.replace(/\/\/.*$/, ""));
  return lines.filter((line, index) =>
    !/^\s*(?:\/?\*|\w+\??:\s*(?:string|number))/.test(line)
    && UPDATED.test(line)
    && lines.slice(Math.max(0, index - 3), index + 1).some((nearby) => POSTED.test(nearby)));
}

describe("posted dates", () => {
  it("are never taken from a last-updated field", async () => {
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts") && !ALLOWED.has(name))) {
      expect({ file, lines: offendingLines(await Bun.file(`${dir}${file}`).text()) }).toEqual({ file, lines: [] });
    }
  });

  it("would catch a fallback to one", () => {
    expect(offendingLines("const value = position.postedTs\n  ?? position.t_update;")).toHaveLength(1);
    expect(offendingLines("postedAt: job.updated_at,")).toHaveLength(1);
    expect(offendingLines("postedAt: job.published_at,")).toHaveLength(0);
  });
});
