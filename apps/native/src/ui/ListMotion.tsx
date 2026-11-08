import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { View, ViewProps } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { motion, spring } from "./motion";

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

export const ListMotionProvider = ({ value, children }: { value: Change; children: ReactNode }) =>
  <ListChange.Provider value={value}>{children}</ListChange.Provider>;

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
  return <Animated.View ref={ref} {...rest} style={[style, playing && styles.playing, playing && (comesOrGoes ? styles.under : styles.over)]}
    layout={playing ? ROW_MOVE : undefined}
    entering={playing ? ROW_ARRIVE : undefined}
    exiting={comesOrGoes ? ROW_LEAVE : undefined}>
    {children}
  </Animated.View>;
});

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
