/**
 * What a job row's swipes do, chosen in You → Swipe actions (owner,
 * 2026-11-08, Paper "Choosing swipe actions · Nov 8", B). Each side has two
 * buttons; the outer one, at the screen's edge, runs on a full swipe. Queue
 * (Apply for me) is never the outer one: from a row it sends a real
 * application at once, so it always takes a tap. The rules only; the
 * choice is kept by swipe-choices.ts.
 */
export type SwipeChoice = "save" | "read" | "applied" | "hide" | "queue";
export type SwipeSide = "right" | "left";
/** Outer first; the inner one can be none. */
export type SwipeSlots = readonly [SwipeChoice, SwipeChoice | null];
export interface SwipeChoices {
  right: SwipeSlots;
  left: SwipeSlots;
}

/** As the rows were before there was a choice. */
export const DEFAULT_SWIPES: SwipeChoices = { right: ["save", "read"], left: ["hide", "applied"] };

/** Every choice, in the menu's order. */
export const SWIPE_CHOICES: readonly SwipeChoice[] = ["save", "read", "applied", "hide", "queue"];
/** The ones a full swipe may run. */
export const OUTER_CHOICES: readonly SwipeChoice[] = ["save", "read", "applied", "hide"];

function isChoice(value: unknown): value is SwipeChoice {
  return typeof value === "string" && (SWIPE_CHOICES as readonly string[]).includes(value);
}

/** A valid set from anything: no choice twice, and an outer one on each
 * side that a full swipe may run. Queue found outside moves in; a side
 * left without an outer one takes the first free choice. */
export function repairSwipes(given: { right: readonly unknown[]; left: readonly unknown[] }): SwipeChoices {
  const used = new Set<SwipeChoice>();
  const take = (value: unknown): SwipeChoice | null => {
    if (!isChoice(value) || used.has(value)) return null;
    used.add(value);
    return value;
  };
  const taken = { right: [take(given.right[0]), take(given.right[1])], left: [take(given.left[0]), take(given.left[1])] };
  const side = (name: SwipeSide): SwipeSlots => {
    let [outer, inner] = taken[name];
    if (outer === "queue") [outer, inner] = [inner, "queue"];
    if (!outer) {
      // Four slots and four outer choices: with this one empty, one is free.
      outer = OUTER_CHOICES.find((choice) => !used.has(choice))!;
      used.add(outer);
    }
    return [outer, inner];
  };
  return { right: side("right"), left: side("left") };
}

/** `current` with `choice` in a slot. One already in another slot trades
 * places with what was here. The outer slot takes neither none nor Queue. */
export function withSwipe(current: SwipeChoices, side: SwipeSide, slot: 0 | 1, choice: SwipeChoice | null): SwipeChoices {
  if (slot === 0 && (choice === null || choice === "queue")) return current;
  const next = { right: [...current.right] as (SwipeChoice | null)[], left: [...current.left] as (SwipeChoice | null)[] };
  const was = next[side][slot] ?? null;
  if (choice) {
    for (const other of ["right", "left"] as const) {
      next[other].forEach((value, index) => {
        if (value === choice && !(other === side && index === slot)) next[other][index] = was;
      });
    }
  }
  next[side][slot] = choice;
  return repairSwipes(next);
}

export function sameSwipes(a: SwipeChoices, b: SwipeChoices): boolean {
  return a.right[0] === b.right[0] && a.right[1] === b.right[1] && a.left[0] === b.left[0] && a.left[1] === b.left[1];
}
