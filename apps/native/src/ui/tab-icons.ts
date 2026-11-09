/**
 * A selected tab is its resting icon with the ink poured in (owner,
 * 2026-11-08: the two states have to be the same icon). Each `solid` starts
 * with the outer edge of the Phosphor icon the tab shows at rest, so the
 * shape can't change between states (tests/tab-icons.test.ts holds them to
 * it). What was a line inside the icon becomes a gap: the calendar's rule,
 * the briefcase's handle, waist and clasp, the person in the circle.
 *
 * Search has no inside worth filling, so it stays the same line, in ink. The
 * Tracker's back bookmark is a tone lighter (`behind`): as a line beside a
 * solid front it read as a leftover stroke (owner, 2026-11-08).
 */
export type TabIconName = "today" | "jobs" | "tracker" | "search" | "you";

export interface TabIconFill {
  solid: string;
  behind?: string;
}

export const TAB_ICON_FILLS: Partial<Record<TabIconName, TabIconFill>> = {
  today: {
    solid: "M208 32h-24v-8a8 8 0 0 0-16 0v8H88v-8a8 8 0 0 0-16 0v8H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16Z"
      + "M48 77H208V99H48Z",
  },
  jobs: {
    solid: "M216 56h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a16 16 0 0 0-16 16v128a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V72a16 16 0 0 0-16-16Z"
      + "M96 56h64v-8a8 8 0 0 0-8-8h-48a8 8 0 0 0-8 8Z"
      + "M216 111.6A184 184 0 0 1 128 134a184.1 184.1 0 0 1-88-22.38v22A200.2 200.2 0 0 0 128 154a200.25 200.25 0 0 0 88-20.37Z"
      + "M112 100h32a10 10 0 0 1 0 20h-32a10 10 0 0 1 0-20Z",
  },
  tracker: {
    solid: "M160 56H64a16 16 0 0 0-16 16v152a8 8 0 0 0 12.65 6.51L112 193.83l51.36 36.68A8 8 0 0 0 176 224V72a16 16 0 0 0-16-16Z",
    behind: "M88 24H192a16 16 0 0 1 16 16V192a16 16 0 0 1-32 0V72a16 16 0 0 0-16-16H88a16 16 0 0 1 0-32Z",
  },
  you: {
    solid: "M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Z"
      + "M193.76 186.41a79.66 79.66 0 0 0-36.06-28.75 48 48 0 1 0-59.4 0 79.66 79.66 0 0 0-36.06 28.75A88 88 0 0 0 193.76 186.41Z",
  },
};
