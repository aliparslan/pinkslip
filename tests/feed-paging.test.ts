import { describe, expect, it } from "bun:test";
import { rowsHeld, withoutRepeats } from "../packages/data/src/feed-pages";

const page = (ids: string[]) => ({ jobs: ids.map((id) => ({ id })) });

describe("the feed's next page", () => {
  it("starts after the rows still held, so hiding one doesn't skip one", () => {
    expect(rowsHeld([page(["a", "c", "d"]), page(["e", "f"])])).toBe(5);
  });
});

describe("joining the feed's pages", () => {
  it("shows a job once, keeping its first place", () => {
    const joined = withoutRepeats({ pages: [page(["a", "b"]), page(["b", "c"])], pageParams: [0, 2] });
    expect(joined.pages.map((p) => p.jobs.map((j) => j.id))).toEqual([["a", "b"], ["c"]]);
  });
});
