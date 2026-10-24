import { describe, expect, test } from "bun:test";
import { notesIn, notesToShow, UPDATE_NOTES, type UpdateNotes } from "../apps/native/src/features/redesign/update-notes";

const note = { icon: "search", meaning: "find", title: "A", line: "B" } as const;
const SETS: UpdateNotes[] = [
  { id: "2026-11-02", version: "1.4", notes: [note] },
  { id: "2026-10-23", version: "1.3", notes: [note, { ...note, title: "C" }] },
];

describe("an update's notes at launch", () => {
  test("show once for someone who had the app before", () => {
    expect(notesToShow(undefined, true, SETS)?.id).toBe("2026-11-02");
    expect(notesToShow("2026-11-02", true, SETS)).toBeNull();
  });

  test("a phone that missed some sees only the newest", () => {
    expect(notesToShow("2026-10-01", true, SETS)?.id).toBe("2026-11-02");
  });

  test("a new install sees none", () => {
    expect(notesToShow(undefined, false, SETS)).toBeNull();
  });

  test("no notes, nothing to show", () => {
    expect(notesToShow(undefined, true, [])).toBeNull();
  });
});

describe("notes in You's What's new", () => {
  test("sit with the big release they came in", () => {
    expect(notesIn("1.3", SETS).map((item) => item.title)).toEqual(["A", "C"]);
    expect(notesIn("1.2", SETS)).toEqual([]);
  });

  test("each set has its own id and a big-release version", () => {
    const ids = UPDATE_NOTES.map((set) => set.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const set of UPDATE_NOTES) {
      expect(set.version).toMatch(/^\d+\.\d+$/);
      expect(set.notes.length).toBeGreaterThan(0);
    }
  });
});
