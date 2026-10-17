import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, AppState, Pressable, StyleSheet as RNStyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing, useAnimatedKeyboard, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import Svg, { Circle, Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "../platform/haptics";
import { Icon, type IconName } from "./Icon";
import { motion, rubberBand, timing } from "./motion";
import { Text } from "./Text";

/**
 * The toast (Paper "Toast · Oct 14", T1): a capsule in the tab bar's glass,
 * hugging its words, 12 above whatever is pinned at the bottom. It says only
 * what the screen can't show: something left the screen (with Undo), it
 * happened somewhere else, or it didn't work (with Try again). Up to three
 * stack like Sonner's and Base UI's: the newest in front, two peeking
 * behind; tap the stack to spread it. Swipe one down or aside to clear it.
 */

export type ToastTone = "success" | "warning" | "error" | "info" | "loading";

export interface ToastAction {
  label: string;
  /** Undo and Try again pick their own icons. */
  icon?: IconName;
  run: () => void | Promise<void>;
}

export interface ToastInput {
  message: string;
  /** success: a pink check; error and warning: the red mark; loading: a
   * spinner that stays until the same key shows its result. */
  tone?: ToastTone;
  /** The action's icon, for something that left the screen (hidden, removed). */
  icon?: IconName;
  /** Milliseconds; `null` keeps it until it's cleared or replaced. */
  duration?: number | null;
  action?: ToastAction;
  /** A toast with the same key updates in place instead of stacking. */
  dedupeKey?: string;
}

interface ShownToast extends ToastInput {
  id: string;
  /** Its whole time and what was left when its clock last started. */
  total: number | null;
  remaining: number | null;
  startedAt: number;
  /** On its way out: the glass dissolves before it's dropped. */
  leaving?: boolean;
}

interface Snapshot { toasts: readonly ShownToast[]; running: boolean }

const DEFAULT_DURATION = 4_000;
export const UNDO_TOAST_DURATION = 6_000;
const MAX_SHOWN = 3;
const HEIGHT = 48;
/** Between toasts, and between a toast and what's pinned under it. */
const GAP = 12;
const SPREAD_GAP = 8;
/** How far each older toast peeks out above the one in front. */
const PEEK = 8;
/** Where toasts sit when nothing pinned has said how tall it is: today's
 * screens, with the system tab bar. */
const FALLBACK_LIFT = 52;
const ENTER = timing({ duration: 320, curve: motion.sheet.open.curve });
const LEAVE_MS = 200;
const SETTLE = { duration: 260, easing: Easing.bezier(0.23, 1, 0.32, 1) };
const GLASS = isLiquidGlassAvailable();

let toasts: ShownToast[] = [];
let snapshot: Snapshot = { toasts, running: true };
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const removals = new Map<string, ReturnType<typeof setTimeout>>();
/** Why the clocks are stopped: a finger on a toast, the stack spread, the app away. */
const holds = new Set<string>();
let counter = 0;

function emit() {
  snapshot = { toasts: toasts.map((item) => ({ ...item })), running: holds.size === 0 };
  for (const listener of listeners) listener();
}

function stopClock(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

function startClock(item: ShownToast) {
  stopClock(item.id);
  if (item.leaving || item.remaining === null || holds.size > 0) return;
  item.startedAt = Date.now();
  const id = item.id;
  timers.set(id, setTimeout(() => dismiss(id), item.remaining));
}

function hold(reason: string) {
  if (holds.has(reason)) return;
  if (holds.size === 0) {
    const now = Date.now();
    for (const item of toasts) {
      stopClock(item.id);
      if (item.remaining !== null) item.remaining = Math.max(0, item.remaining - (now - item.startedAt));
    }
  }
  holds.add(reason);
  emit();
}

function release(reason: string) {
  if (!holds.delete(reason)) return;
  if (holds.size === 0) for (const item of toasts) startClock(item);
  emit();
}

/** It leaves first (Liquid Glass can't fade with its parent, so its glass
 * dissolves on its own), then it's dropped. */
function dismiss(id: string) {
  if (!toasts.some((item) => item.id === id && !item.leaving)) return;
  stopClock(id);
  toasts = toasts.map((item) => item.id === id ? { ...item, leaving: true } : item);
  removals.set(id, setTimeout(() => {
    removals.delete(id);
    toasts = toasts.filter((item) => item.id !== id);
    emit();
  }, LEAVE_MS + 50));
  emit();
}

function show(input: ToastInput): string {
  // A plain message shown again updates itself; one with an action is its own
  // toast, so two hidden jobs each keep their Undo.
  const id = input.dedupeKey ?? (input.action ? `toast-${counter += 1}` : `message:${input.message}`);
  const total = input.duration !== undefined ? input.duration
    : input.tone === "loading" ? null
    : input.action ? UNDO_TOAST_DURATION : DEFAULT_DURATION;
  const next: ShownToast = { ...input, id, total, remaining: total, startedAt: Date.now() };
  clearTimeout(removals.get(id));
  removals.delete(id);
  if (toasts.some((item) => item.id === id)) {
    toasts = toasts.map((item) => item.id === id ? next : item);
  } else {
    toasts = [...toasts, next];
    const staying = toasts.filter((item) => !item.leaving);
    for (const oldest of staying.slice(0, Math.max(0, staying.length - MAX_SHOWN))) dismiss(oldest.id);
  }
  startClock(next);
  if (input.tone === "error") haptics.error();
  AccessibilityInfo.announceForAccessibility(input.message);
  emit();
  return id;
}

type ToneInput = Omit<ToastInput, "message" | "tone">;

/** The web kit's toast API, so feature code reads the same on both. */
export const toast = {
  show,
  success: (message: string, input: ToneInput = {}) => show({ ...input, message, tone: "success" }),
  warning: (message: string, input: ToneInput = {}) => show({ ...input, message, tone: "warning" }),
  error: (message: string, input: ToneInput = {}) => show({ ...input, message, tone: "error" }),
  loading: (message: string, input: ToneInput = {}) => show({ ...input, message, tone: "loading" }),
  dismiss,
};

let lifts: { key: number; height: number }[] = [];
const liftListeners = new Set<() => void>();
let liftCounter = 0;

function emitLifts() { for (const listener of liftListeners) listener(); }

/** Something pinned to the bottom (the tab bar, a page's buttons) says how
 * far up from the screen's bottom edge it reaches, so toasts sit 12 above it.
 * The latest one showing wins; `null` while it isn't showing. */
export function useToastLift(height: number | null) {
  useEffect(() => {
    if (height === null) return;
    const key = liftCounter += 1;
    lifts = [...lifts, { key, height }];
    emitLifts();
    return () => {
      lifts = lifts.filter((lift) => lift.key !== key);
      emitLifts();
    };
  }, [height]);
}

function useLift() {
  return useSyncExternalStore((listener) => { liftListeners.add(listener); return () => liftListeners.delete(listener); },
    () => lifts.at(-1)?.height ?? null);
}

/** Renders the toasts in a full-window overlay, so native screens and sheets
 * don't cover them. Mount once at the root. */
export function ToastHost() {
  const { toasts: shown, running } = useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => snapshot);
  const insets = useSafeAreaInsets();
  const lift = (useLift() ?? insets.bottom + FALLBACK_LIFT) + GAP;
  const keyboard = useAnimatedKeyboard();
  const [spread, setSpread] = useState(false);
  const [widths, setWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => state === "active" ? release("away") : hold("away"));
    return () => subscription.remove();
  }, []);
  const staying = shown.filter((item) => !item.leaving);
  useEffect(() => { if (staying.length < 2) setSpread(false); }, [staying.length]);
  useEffect(() => {
    if (!spread) return;
    hold("spread");
    return () => release("spread");
  }, [spread]);
  useEffect(() => () => { for (const id of timers.keys()) stopClock(id); }, []);

  // With the keyboard up, the toasts ride 12 above it.
  const raise = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(0, keyboard.height.value + GAP - lift) }] }));
  if (shown.length === 0) return null;
  const front = staying.at(-1);
  return <FullWindowOverlay><View pointerEvents="box-none" style={RNStyleSheet.absoluteFill}>
    {/* Gestures inside the overlay need their own root; it lets touches
        outside the toasts through to the app. */}
    <GestureHandlerRootView pointerEvents="box-none" style={RNStyleSheet.absoluteFill}>
      {/* Tapping away closes a spread stack. It stays mounted under the lane
          (one mounted on demand landed above it and took the toasts' touches). */}
      <Pressable style={RNStyleSheet.absoluteFill} pointerEvents={spread ? "auto" : "none"} onPress={() => setSpread(false)}
        accessible={spread} accessibilityRole="button" accessibilityLabel="Close notifications" />
      <Animated.View pointerEvents="box-none" style={[styles.lane, { bottom: lift }, raise]}>
        {shown.map((item) => <ToastView key={item.id} item={item} running={running}
          index={item.leaving ? -1 : staying.length - 1 - staying.indexOf(item)} spread={spread} stacked={staying.length > 1}
          frontWidth={front ? widths[front.id] ?? 0 : 0}
          onWidth={(width) => setWidths((current) => current[item.id] === width ? current : { ...current, [item.id]: width })}
          onSpread={() => setSpread(true)} />)}
      </Animated.View>
    </GestureHandlerRootView>
  </View></FullWindowOverlay>;
}

interface ToastViewProps {
  item: ShownToast;
  running: boolean;
  /** 0 is the newest, in front. */
  index: number;
  spread: boolean;
  stacked: boolean;
  frontWidth: number;
  onWidth: (width: number) => void;
  onSpread: () => void;
}

function ToastView({ item, running, index, spread, stacked, frontWidth, onWidth, onSpread }: ToastViewProps) {
  const { theme, rt } = useUnistyles();
  const glassScheme = rt.themeName?.startsWith("light") ? "light" : "dark";
  // Over light content (a board's page) the glass would lighten under the dark theme's words.
  const glassTint = glassScheme === "dark" ? theme.ui.color["bg-elev"] : undefined;
  const { width: screen } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [ownWidth, setOwnWidth] = useState(0);
  const leaving = Boolean(item.leaving);
  const behind = !leaving && !spread && index > 0;
  const id = item.id;
  // Liquid Glass materializes and dissolves on its own; fading a parent of
  // it would leave the glass undrawn, so only the words fade.
  const [glass, setGlass] = useState(false);

  // Where it sits in the stack; it arrives 12 low and rises.
  const y = useSharedValue(reduceMotion ? 0 : GAP);
  const scale = useSharedValue(reduceMotion ? 1 : 0.96);
  const words = useSharedValue(0);
  /** The paper capsule's opacity, before iOS 26 (no glass to dissolve). */
  const paper = useSharedValue(0);
  const surface = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  /** The one way a drag moves the toast, picked as it starts: sideways or down. */
  const sideways = useSharedValue(false);
  const pressed = useSharedValue(0);

  useEffect(() => {
    setGlass(!leaving);
    if (leaving) {
      // It leaves the way it came: down a little as it dissolves.
      const out = { duration: LEAVE_MS, easing: Easing.out(Easing.quad) };
      y.value = withTiming(y.value + GAP, out);
      words.value = withTiming(0, { duration: LEAVE_MS * 0.6 });
      paper.value = withTiming(0, out);
      return;
    }
    const size = spread || index === 0 ? 1 : 1 - 0.05 * index;
    // An older one sits PEEK higher per step, measured at its top edge.
    const target = spread ? -index * (HEIGHT + SPREAD_GAP) : index === 0 ? 0 : -PEEK * index - (HEIGHT * (1 - size)) / 2;
    y.value = withTiming(target, ENTER);
    scale.value = withTiming(size, ENTER);
    paper.value = withTiming(1, ENTER);
    // Behind another, only its edge shows; its words would show through the glass.
    words.value = withTiming(behind ? 0 : 1, { duration: 200 });
  }, [leaving, index, spread, behind, y, scale, paper, words]);

  useEffect(() => {
    if (!ownWidth) return;
    // Behind, it takes the front one's shape, so the stack reads as one.
    const target = behind && frontWidth ? frontWidth : ownWidth;
    surface.value = surface.value === 0 ? target : withTiming(target, ENTER);
  }, [ownWidth, frontWidth, behind, surface]);

  const runAction = () => {
    dismiss(id);
    void item.action?.run();
  };
  const actionIcon = item.action ? item.action.icon ?? actionIconFor(item.action.label) : undefined;

  const gestures = useMemo(() => {
    const action = Gesture.Tap()
      .onBegin(() => { pressed.value = withTiming(1, { duration: 80 }); })
      .onFinalize(() => { pressed.value = withTiming(0, { duration: 160 }); })
      .onEnd((_event, success) => { if (success) scheduleOnRN(runAction); });
    const open = Gesture.Tap().enabled(stacked && !spread && index === 0).requireExternalGestureToFail(action)
      .onEnd((_event, success) => { if (success) scheduleOnRN(onSpread); });
    const width = Math.max(ownWidth, 120);
    const swipe = Gesture.Pan().enabled(!behind).activeOffsetX([-12, 12]).activeOffsetY([-8, 8])
      .onBegin(() => { scheduleOnRN(hold, "touch"); })
      .onStart((event) => { sideways.value = Math.abs(event.translationX) > Math.abs(event.translationY); })
      .onUpdate((event) => {
        // It moves one way only (owner, 2026-10-16: it wandered too freely).
        if (sideways.value) dragX.value = event.translationX;
        else dragY.value = event.translationY > 0 ? event.translationY : -rubberBand(-event.translationY, HEIGHT);
      })
      .onEnd((event) => {
        // A flick is enough; the toast keeps the finger's speed as it goes.
        if (sideways.value && (Math.abs(dragX.value) > 80 || Math.abs(event.velocityX) > 600)) {
          const to = Math.sign(dragX.value || event.velocityX) * (screen / 2 + width / 2);
          dragX.value = withTiming(to, { duration: travel(to - dragX.value, event.velocityX), easing: Easing.out(Easing.quad) },
            (finished) => { if (finished) scheduleOnRN(dismiss, id); });
        } else if (!sideways.value && (dragY.value > 24 || event.velocityY > 500)) {
          const to = HEIGHT + GAP * 4;
          dragY.value = withTiming(to, { duration: travel(to - dragY.value, event.velocityY), easing: Easing.out(Easing.quad) },
            (finished) => { if (finished) scheduleOnRN(dismiss, id); });
        } else {
          dragX.value = withTiming(0, SETTLE);
          dragY.value = withTiming(0, SETTLE);
        }
      })
      .onFinalize(() => { scheduleOnRN(release, "touch"); });
    return { action, toast: Gesture.Race(swipe, open) };
    // runAction and onSpread only close over this toast's id and its action.
  }, [stacked, spread, index, behind, screen, ownWidth, id]);

  const place = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: scale.value }] }));
  const drag = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value }, { translateY: dragY.value }] }));
  const shape = useAnimatedStyle(() => ({ width: surface.value, opacity: GLASS ? 1 : paper.value }));
  const fade = useAnimatedStyle(() => ({ opacity: words.value }));
  const press = useAnimatedStyle(() => ({ opacity: 1 - pressed.value * 0.4, transform: [{ scale: 1 - pressed.value * 0.06 }] }));

  // The slot itself moves, so a raised toast stays inside the lane and takes touches.
  return <Animated.View pointerEvents="box-none" style={[styles.slot, place]}>
    <GestureDetector gesture={gestures.toast}>
      <Animated.View pointerEvents={behind || leaving ? "none" : "auto"} style={drag}
        accessibilityLiveRegion="polite">
        <Animated.View pointerEvents="none" style={[styles.surface, shape]}>
          {/* The app's scheme, so the words stay readable over a light page in dark mode. */}
          {GLASS ? <GlassView style={styles.glass} colorScheme={glassScheme} tintColor={glassTint}
            glassEffectStyle={{ style: glass ? "regular" : "none", animate: true, animationDuration: glass ? 0.32 : LEAVE_MS / 1000 }} /> : null}
        </Animated.View>
        <Animated.View style={[styles.content, { maxWidth: screen - theme.ui.size.gutter * 2 }, item.action && styles.withAction, fade]}
          onLayout={(event) => {
            const width = Math.round(event.nativeEvent.layout.width);
            setOwnWidth(width);
            onWidth(width);
          }}>
          <Mark item={item} />
          <View style={styles.message}><Text role="subhead" lines={1}>{item.message}</Text></View>
          {item.action && actionIcon ? <GestureDetector gesture={gestures.action}>
            <Animated.View style={[styles.action, press]} accessible accessibilityRole="button"
              accessibilityLabel={item.action.label} onAccessibilityTap={runAction}>
              <Icon name={actionIcon} size={18} />
              {item.total !== null && item.remaining !== null
                ? <Countdown total={item.total} remaining={item.remaining} running={running} startedAt={item.startedAt} />
                : null}
            </Animated.View>
          </GestureDetector> : null}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  </Animated.View>;
}

/** How long a swiped-away toast takes to leave if it keeps the finger's speed
 * (an ease-out starts at about twice its average speed). */
function travel(distance: number, velocity: number) {
  "worklet";
  const speed = Math.abs(velocity);
  if (speed < 1) return LEAVE_MS;
  return Math.min(Math.max((Math.abs(distance) / speed) * 1000 * 2, 120), 280);
}

function actionIconFor(label: string): IconName | undefined {
  if (/^undo$/i.test(label)) return "undo";
  if (/^(retry|try again)$/i.test(label)) return "refresh";
  return undefined;
}

/** What leads the toast: a pink check, the red mark, a spinner, or the action's icon. */
function Mark({ item }: { item: ShownToast }) {
  if (item.tone === "success") return <Icon name="done" size={20} tone="accent" />;
  if (item.tone === "error" || item.tone === "warning") return <Icon name="warning" size={20} tone="bad" />;
  if (item.tone === "loading") return <Spinner />;
  return item.icon ? <Icon name={item.icon} size={20} tone="ink-2" /> : null;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 32;
const RING_STROKE = 2;
const RING_RADIUS = (RING - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Undo's ring runs down with the time left (owner, 2026-10-14: 2pt, light
 * gray, no track); it stops while the clock does. */
function Countdown({ total, remaining, running, startedAt }: { total: number; remaining: number; running: boolean; startedAt: number }) {
  const { theme } = useUnistyles();
  const left = useSharedValue(total > 0 ? remaining / total : 0);
  useEffect(() => {
    left.value = total > 0 ? remaining / total : 0;
    if (running) left.value = withTiming(0, { duration: remaining, easing: Easing.linear });
  }, [total, remaining, running, startedAt, left]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: RING_LENGTH * (1 - left.value) }));
  return <Svg width={RING} height={RING} style={styles.ring} pointerEvents="none">
    <AnimatedCircle cx={RING / 2} cy={RING / 2} r={RING_RADIUS} fill="none" stroke={theme.ui.color["ink-3"]}
      strokeWidth={RING_STROKE} strokeLinecap="round" strokeDasharray={RING_LENGTH} animatedProps={props} />
  </Svg>;
}

/** A quarter arc turning on a faint track, at the line icons' weight. */
function Spinner() {
  const { theme } = useUnistyles();
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1, false);
  }, [turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return <Animated.View style={spin}>
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={7.5} fill="none" stroke={theme.ui.color.fill} strokeWidth={1.75} />
      <Path d="M10 2.5 A7.5 7.5 0 0 1 17.5 10" fill="none" stroke={theme.ui.color["ink-2"]} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  </Animated.View>;
}

const styles = StyleSheet.create((theme) => ({
  // Tall enough for a spread stack, so its toasts stay inside and touchable.
  lane: { position: "absolute", left: 0, right: 0, height: MAX_SHOWN * (HEIGHT + SPREAD_GAP), zIndex: 1 },
  slot: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  surface: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignSelf: "center",
    borderRadius: HEIGHT / 2,
    borderCurve: "continuous",
    ...(GLASS ? {} : { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill }),
  },
  glass: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: HEIGHT / 2 },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: HEIGHT,
    paddingLeft: theme.ui.space["4"],
    paddingRight: theme.ui.space["5"],
  },
  withAction: { paddingRight: theme.ui.space["2"] },
  // Hugs its words, and shrinks to an ellipsis only past the screen's width.
  message: { flexShrink: 1 },
  action: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.ui.color.pill,
  },
  ring: { position: "absolute", top: 0, left: 0, transform: [{ rotate: "-90deg" }] },
}));
