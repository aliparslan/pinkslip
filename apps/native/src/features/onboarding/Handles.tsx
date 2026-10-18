import { useEffect, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "../../platform/haptics";
import { Button, Icon, Text, type IconName, type TileMeaning } from "../../ui";
import { motion, spring, timing } from "../../ui/motion";
import { settleTime } from "./Hook";

const { rows: ROWS, leave: LEAVE } = motion.onboarding;
const RISE = timing(ROWS);

interface Handled {
  icon: IconName;
  meaning: Exclude<TileMeaning, "app">;
  title: string;
  line: string;
  pro?: boolean;
}

/** What Pinkslip handles, in the kit's meanings: blue finds, green is what
 * you apply with, pink is Pro (owner, 2026-10-18). */
const HANDLED: readonly Handled[] = [
  { icon: "jobs", meaning: "find", title: "Every job, found for you", line: "Every career page, every hour" },
  { icon: "notifications", meaning: "find", title: "You see them first", line: "As soon as they're posted" },
  { icon: "autoApply", meaning: "pro", title: "Applications, sent for you", line: "You say yes, it's sent", pro: true },
  { icon: "tracker", meaning: "apply", title: "Every application, tracked", line: "Replies update it for you" },
  { icon: "followUp", meaning: "apply", title: "A nudge to follow up", line: "And who to write to" },
  { icon: "email", meaning: "pro", title: "Cold emails, written for you", line: "To the right recruiter", pro: true },
];

export interface HandlesProps {
  /** I'm ready, as page two starts to slide away: the questions come up. */
  onReady: () => void;
  /** Page two is off the screen. */
  onGone: () => void;
}

/**
 * Page two (Paper "Onboarding · the build · Oct 18", 2): "What Pinkslip
 * handles", six rows straight on the page, each the kit's icon in its
 * meaning's colour, a title and one line. The rows rise in one at a time,
 * calm and straight where the mess fell crooked; I'm ready slides the page
 * away to the feed.
 */
export function Handles({ onReady, onGone }: HandlesProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const away = useSharedValue(0);
  const last = ROWS.delay + HANDLED.length * ROWS.stagger;

  useEffect(() => {
    if (reduced) return;
    // A soft tick as each row arrives.
    const timers = HANDLED.map((_, index) => setTimeout(haptics.tick, ROWS.delay + (index + 1) * ROWS.stagger));
    return () => timers.forEach(clearTimeout);
    // Plays once, on arrival.
  }, []);

  const ready = () => {
    haptics.tap();
    const leave = spring(LEAVE);
    away.value = withSpring(1, leave, (done) => {
      if (done) scheduleOnRN(onGone);
    });
    setTimeout(onReady, settleTime(LEAVE) * 0.45);
  };

  const page = useAnimatedStyle(() => ({ transform: [{ translateX: -width * away.value }] }));

  return <Animated.View style={[styles.page, { paddingTop: insets.top + 57, paddingBottom: insets.bottom + 8 }, page]}>
    <View style={styles.top}>
      <Rise delay={0} reduced={reduced}>
        <Text role="largeTitle" accessibilityRole="header">What Pinkslip handles</Text>
      </Rise>
      <View style={styles.list}>
        {HANDLED.map((item, index) => <Rise key={item.title} delay={ROWS.delay + (index + 1) * ROWS.stagger} reduced={reduced}>
          <Row item={item} />
        </Rise>)}
      </View>
    </View>
    <Rise delay={last + ROWS.delay} reduced={reduced}>
      <Button variant="primary" fullWidth onPress={ready}>I'm ready</Button>
    </Rise>
  </Animated.View>;
}

function Row({ item }: { item: Handled }) {
  const { theme } = useUnistyles();
  return <View style={styles.row}>
    <View style={styles.icon}><Icon name={item.icon} size={24} color={theme.ui.color[`tile-${item.meaning}-ink`]} /></View>
    <View style={styles.text}>
      <Text weight="medium">{item.title}</Text>
      <Text role="subhead" tone="ink-2">{item.line}</Text>
    </View>
    {item.pro ? <Text role="footnote" weight="medium" tone="ink-3">Pro</Text> : null}
  </View>;
}

/** Fades in rising a few points, on the ease-out, with no overshoot. */
function Rise({ delay, reduced, children }: { delay: number; reduced: boolean; children: ReactNode }) {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withDelay(delay, withTiming(1, RISE));
    // Plays once, on arrival.
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: reduced ? 0 : ROWS.rise * (1 - shown.value) }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create((theme) => ({
  page: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: theme.ui.size.gutter,
    backgroundColor: theme.ui.color.bg,
  },
  top: { gap: theme.ui.space["6"] },
  list: { gap: theme.ui.space["1"] },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14 },
  icon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
}));
