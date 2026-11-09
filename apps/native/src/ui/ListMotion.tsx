import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { View, ViewProps } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { motion, spring, timing } from "./motion";
import { useMotionTrial } from "./motion-trial";

/**
 * A list changing under you, the way iOS's do (`motion.list`, fitted to
 * Reminders): the rows that stay move on one spring from the first frame,
 * and a row coming or going sits under them and fades, so the rows beside it
 * slide over its place and no hole opens. One beat: nothing rises, staggers
 * or waits.
 */
const ROWS = spring(motion.list.move);

/** Every row that changes place, on the one spring. */
export const ROW_MOVE = LinearTransition.springify().mass(ROWS.mass).stiffness(ROWS.stiffness).damping(ROWS.damping);
/** A row arriving, under the rows making room for it. */
export const ROW_ARRIVE = FadeIn.duration(motion.list.fade);
/** A row leaving, under the rows closing over it. */
export const ROW_LEAVE = FadeOut.duration(motion.list.fade);

/** Long enough for the spring's soft landing. */
const SETTLES_MS = 500;

interface Change {
  /** The list's keys in order, to tell a cell which row it holds. */
  keys: readonly string[];
  /** While a change plays, the rows coming or going; otherwise null. */
  under: ReadonlySet<string> | null;
}

const ListChange = createContext<Change>({ keys: [], under: null });

const RowsFade = createContext<SharedValue<number> | null>(null);

/** `fade` is `useRowsSwap`'s, for a list a chip can change. */
export const ListMotionProvider = ({ value, fade, children }: { value: Change; fade?: SharedValue<number>; children: ReactNode }) =>
  <ListChange.Provider value={value}><RowsFade.Provider value={fade ?? null}>{children}</RowsFade.Provider></ListChange.Provider>;

/**
 * FlashList's `CellRendererComponent`. Cells only animate while a change
 * plays: the rest of the time FlashList moves them about as you scroll, and
 * those moves mustn't show.
 */
export const ListMotionCell = forwardRef<View, ViewProps & { index: number }>(function ListMotionCell({ index, style, children, ...rest }, ref) {
  const { keys, under } = useContext(ListChange);
  const playing = under !== null;
  const key = keys[index];
  const comesOrGoes = playing && key !== undefined && under.has(key);
  const fade = useContext(RowsFade);
  const faded = useAnimatedStyle(() => ({ opacity: fade ? fade.value : 1 }), [fade]);
  // Each row draws over the one above it. FlashList reuses cells in any order,
  // so without this a swiped row's cover over the line above could end up
  // beneath that line (owner, 2026-11-08: the hairline came back).
  return <Animated.View ref={ref} {...rest} style={[style, { zIndex: index }, playing && styles.playing, playing && (comesOrGoes ? styles.under : styles.over), faded]}
    layout={playing ? ROW_MOVE : undefined}
    entering={playing ? ROW_ARRIVE : undefined}
    exiting={comesOrGoes ? ROW_LEAVE : undefined}>
    {children}
  </Animated.View>;
});

const ROWS_DIM = timing({ duration: 90, curve: [0.23, 1, 0.32, 1] });
const ROWS_IN = timing({ duration: 130, curve: [0.33, 1, 0.68, 1] });
/** While the server finds the new rows, the old ones say they're on their way out. */
const ROWS_WAITING = 0.4;

/**
 * Swaps a list for a different one (a chip, the filters), with the cost of a
 * chip in mind: tens of times a day, so nothing slides and nothing waits on an
 * animation. The rows dim, and the new ones take their place while dim and
 * come up, so the screen is never empty. When the new rows are still on their
 * way (`waiting`), the old ones stay dim until they land.
 *
 * `list` says which list `latest` is: while it stays the same, new rows go
 * straight through, so paging, a new posting or a stage move plays as before.
 *
 * `slide`, when given, plays the swap instead: it's handed the rows on screen,
 * the rows coming, and the change to make once the cells are ready.
 */
export function useRowsSwap<T, L>(latest: T, list: L, waiting = false, slide?: (from: T, to: T, change: () => void) => void): { rows: T; list: L; fade: SharedValue<number> } {
  const on = useMotionTrial("chipFade");
  const slideNow = useRef(slide);
  slideNow.current = slide;
  const fade = useSharedValue(1);
  const [, render] = useReducer((count: number) => count + 1, 0);
  const settled = useRef({ rows: latest, list });
  const newest = useRef({ rows: latest, list });
  newest.current = { rows: latest, list };
  if (!on || settled.current.list === list) settled.current = newest.current;
  const changing = settled.current.list !== list;
  useEffect(() => {
    let frame = 0;
    if (!changing) {
      // Two frames on, so the new rows are drawn before they start to show.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { fade.value = withTiming(1, ROWS_IN); });
      });
    } else {
      const change = () => {
        settled.current = newest.current;
        render();
      };
      if (waiting || !slideNow.current) fade.value = withTiming(ROWS_WAITING, ROWS_DIM);
      if (!waiting) {
        if (slideNow.current) slideNow.current(settled.current.rows, newest.current.rows, change);
        else frame = requestAnimationFrame(change);
      }
    }
    return () => cancelAnimationFrame(frame);
  }, [changing, waiting, list, fade]);
  return { rows: settled.current.rows, list: settled.current.list, fade };
}

/** The rows that come or go between two lists, by key. */
export function changedKeys(before: readonly string[], after: readonly string[]): ReadonlySet<string> {
  const had = new Set(before);
  const has = new Set(after);
  return new Set([...before.filter((key) => !has.has(key)), ...after.filter((key) => !had.has(key))]);
}

/**
 * Plays a change to a FlashList. `play` first tells the cells what's about
 * to happen, then makes the change a frame later, so each cell has its
 * animations before its place changes. `change` should call the list's
 * `prepareForLayoutAnimationRender` first: without it FlashList reuses the
 * row that left for the row that arrived, and one row glides across.
 */
export function useListMotion(keys: readonly string[]) {
  const reduced = useReducedMotion();
  const [under, setUnder] = useState<ReadonlySet<string> | null>(null);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => clear, []);
  const play = useCallback((changing: ReadonlySet<string>, change: () => void) => {
    if (reduced) { change(); return; }
    clear();
    setUnder(changing);
    frame.current = requestAnimationFrame(() => {
      change();
      timer.current = setTimeout(() => setUnder(null), SETTLES_MS);
    });
  }, [reduced]);
  const value = useMemo(() => ({ keys, under }), [keys, under]);
  return { play, value };
}

const styles = StyleSheet.create((theme) => ({
  // Opaque, so a row sliding over another covers it.
  playing: { backgroundColor: theme.ui.color.bg },
  under: { zIndex: 0 },
  over: { zIndex: 1 },
}));
