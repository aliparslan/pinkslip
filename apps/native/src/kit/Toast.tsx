import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AccessibilityInfo, Pressable, StyleSheet as RNStyleSheet, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeInDown, FadeOutDown, interpolate, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { durations, easeOut, resist, settleSpring } from "./motion";
import { Text } from "./Text";

export type ToastTone = "success" | "warning" | "error" | "info";

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  /** Milliseconds; `null` keeps it until dismissed. */
  duration?: number | null;
  action?: { label: string; run: () => void | Promise<void> };
  /** A toast with the same key replaces the earlier one. */
  dedupeKey?: string;
}

interface ShownToast extends ToastInput { id: string }

const DEFAULT_DURATION = 3_500;
export const UNDO_TOAST_DURATION = 7_000;
const MAX_VISIBLE = 2;

let toasts: ShownToast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let counter = 0;

function emit() { for (const listener of listeners) listener(); }

function dismiss(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

function show(input: ToastInput): string {
  const id = input.dedupeKey ?? `toast-${counter += 1}`;
  const next = { ...input, id };
  toasts = [...toasts.filter((toast) => toast.id !== id), next].slice(-MAX_VISIBLE);
  clearTimeout(timers.get(id));
  const duration = input.duration === undefined ? (input.action ? UNDO_TOAST_DURATION : DEFAULT_DURATION) : input.duration;
  if (duration !== null) timers.set(id, setTimeout(() => dismiss(id), duration));
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
  dismiss,
};

/** Renders the toasts above the tab bar, in a full-window overlay so native
 * screens and sheets don't cover them. Mount once at the root. */
export function ToastHost() {
  const shown = useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => toasts);
  const insets = useSafeAreaInsets();
  useEffect(() => () => { for (const timer of timers.values()) clearTimeout(timer); }, []);
  if (shown.length === 0) return null;
  // Gestures inside the overlay need their own root. It covers only the
  // stack, so touches elsewhere still reach the app.
  return <FullWindowOverlay><View pointerEvents="box-none" style={RNStyleSheet.absoluteFill}>
    <GestureHandlerRootView pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 64 }]}>
      {shown.map((item) => <Animated.View key={item.id} entering={FadeInDown.duration(durations.fast).easing(easeOut)} exiting={FadeOutDown.duration(durations.instant)}>
        <ToastCard item={item} />
      </Animated.View>)}
    </GestureHandlerRootView>
  </View></FullWindowOverlay>;
}

/** One toast. Swipe it down to dismiss it early; it leaves the way it came. */
function ToastCard({ item }: { item: ShownToast }) {
  const y = useSharedValue(0);
  const id = item.id;
  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    .onUpdate((event) => { y.value = event.translationY > 0 ? event.translationY : resist(event.translationY, 120); })
    .onEnd((event) => {
      if (y.value > 36 || event.velocityY > 500) {
        y.value = withSpring(160, { ...settleSpring, duration: 240, velocity: event.velocityY }, (finished) => {
          if (finished) scheduleOnRN(dismiss, id);
        });
      } else {
        y.value = withSpring(0, { ...settleSpring, velocity: event.velocityY });
      }
    }), [id, y]);
  const drag = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: interpolate(y.value, [0, 120], [1, 0], "clamp"),
  }));
  return <GestureDetector gesture={pan}>
    <Animated.View style={[styles.toast, drag]} accessibilityLiveRegion="polite">
      <View style={[styles.dot, styles.tone(item.tone ?? "info")]} />
      <View style={styles.message}><Text size="sm" tone="ink">{item.message}</Text></View>
      {item.action ? <Pressable accessibilityRole="button" hitSlop={8}
        onPress={() => { dismiss(item.id); void item.action?.run(); }}>
        <Text size="sm" weight="semibold" tone="accent">{item.action.label}</Text>
      </Pressable> : null}
    </Animated.View>
  </GestureDetector>;
}

const styles = StyleSheet.create((theme) => ({
  host: { position: "absolute", left: theme.gutter, right: theme.gutter, gap: theme.space["2"] },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["3"],
    paddingHorizontal: theme.space["4"],
    paddingVertical: theme.space["3"],
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors["bg-elev"],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors["message-border"],
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  message: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tone: (tone: ToastTone) => ({
    backgroundColor: tone === "success" ? theme.colors.good : tone === "warning" ? theme.colors.warn : tone === "error" ? theme.colors.bad : theme.colors["ink-3"],
  }),
}));
