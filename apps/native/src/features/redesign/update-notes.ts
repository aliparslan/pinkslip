import type { ReleaseItem } from "./whats-new";

/** What changed in one over-the-air update, said once at launch. */
export interface UpdateNotes {
  /** Each set's own id, so a phone shows it once: "2026-10-23". */
  id: string;
  /** The big release it came in ("1.3"), where You's What's new lists it. */
  version: string;
  notes: ReleaseItem[];
}

/**
 * Notes for updates that change something you'd notice, newest first (owner,
 * 2026-10-23, Paper "Update note · Oct 23", A). An update that only fixes
 * things adds nothing here and stays silent. Each line is the owner's to
 * approve before it's published.
 */
export const UPDATE_NOTES: readonly UpdateNotes[] = [
  {
    id: "2026-10-23",
    version: "1.3",
    notes: [
      // The owner's words (2026-10-23).
      { icon: "search", meaning: "find", title: "Search has been improved" },
      { icon: "resume", meaning: "apply", title: "Fixed a bug with PDF import" },
    ],
  },
];

/** The notes to show at this launch: the newest set, once, for someone who
 * had the app before it. A phone that missed several sees only the newest. */
export function notesToShow(seen: string | undefined, hadAppBefore: boolean, sets: readonly UpdateNotes[] = UPDATE_NOTES): UpdateNotes | null {
  const newest = sets[0];
  if (!newest || !hadAppBefore || seen === newest.id) return null;
  return newest;
}

/** Every note that came in this big release, newest first. */
export function notesIn(version: string, sets: readonly UpdateNotes[] = UPDATE_NOTES): ReleaseItem[] {
  return sets.filter((set) => set.version === version).flatMap((set) => set.notes);
}
