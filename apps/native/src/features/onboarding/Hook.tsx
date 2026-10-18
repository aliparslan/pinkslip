import { ui } from "@pinkslip/tokens/native";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Text as RNText, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ScopedTheme, StyleSheet, useUnistyles } from "react-native-unistyles";
import { haptics } from "../../platform/haptics";
import { Button, Text } from "../../ui";
import { faces } from "../../ui/fonts";
import { motion, spring } from "../../ui/motion";

const { land: LAND, words: WORDS, throw: THROW } = motion.onboarding;
const LAND_SPRING = spring(LAND);
const WORDS_SPRING = spring(WORDS);

/** How long one of Apple's springs takes to settle, in ms. */
export function settleTime({ response, damping }: { response: number; damping: number }): number {
  return (Math.log(1000) / (damping * ((2 * Math.PI) / response))) * 1000;
}

/** The hook is dark in either appearance: the mess is the night before. */
const D = ui.color.dark;
/** The mess's own colors: other apps' sheets, tabs and notes, not ours. */
const MESS = {
  card: "#1F1F22",
  head: "#28282C",
  rule: "#323236",
  ruleSoft: "#2D2D31",
  field: "#161619",
  sheetGreen: "#429C5A",
  cellHi: "#EAD166",
  cellHiInk: "#372C15",
  ghosted: "#C13C3B",
  ghostedInk: "#FFF6F5",
  tabOn: "#37383B",
  tab: "#2B2B2E",
  tabLineOn: "#636367",
  tabLine: "#4D4D50",
  blue: "#4D84DF",
  orange: "#DD8736",
  green: "#53A367",
  violet: "#9065D0",
  amber: "#F0A646",
  stickyTop: "#F4E074",
  stickyBottom: "#EDD05A",
  stickyInk: "#3B2B0D",
  stickyInk2: "#5E4925",
  tape: "rgba(255, 255, 255, 0.3)",
} as const;

export interface ButtonRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HookProps {
  /** Leave it to Pinkslip: where the button is, so page two can grow out of it. */
  onLeave: (button: ButtonRect) => void;
  onAccount: () => void;
}

/**
 * The hook (Paper "Onboarding · the build · Oct 18", 1): the job hunt's mess
 * lands card by card, faster and faster, each one falling, hitting and
 * settling with a light tap; then "Job hunting shouldn't be another job."
 * rises with the answer under it. Leave it to Pinkslip throws the mess off,
 * nearest the button first, as the button grows into page two.
 */
export function Hook({ onLeave, onAccount }: HookProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  // Reduce Motion: the cards fade in where they lie and fade away.
  const reduced = useReducedMotion();
  const thrown = useSharedValue(0);
  const words = useSharedValue(0);
  const answers = useSharedValue(0);
  const gone = useSharedValue(1);
  const pileY = useSharedValue(0);
  const [ready, setReady] = useState(false);
  const button = useRef<View>(null);

  // The cards, placed as drawn on a 390pt screen: across in proportion,
  // down from under the status bar.
  const across = width / 390;
  const down = insets.top - 47;
  const cards = CARDS.map((card) => ({ ...card, x: card.left * across, y: card.top + down }));
  // Faster and faster: each gap is 0.8 of the one before.
  const gaps = cards.map((_, index) => 0.8 ** index);
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  const delays = gaps.reduce<number[]>((list, gap, index) => [...list, index === 0 ? 80 : list[index - 1]! + (gaps[index - 1]! / total) * LAND.spread], []);
  const landed = delays[delays.length - 1]! + (gaps[gaps.length - 1]! / total) * LAND.spread;
  const settle = settleTime(LAND);

  useEffect(() => {
    const timers = delays.map((delay) => setTimeout(() => {
      if (reduced) return;
      haptics.tap();
      pileY.value = withSequence(withTiming(2, { duration: 60 }), withTiming(0, { duration: 60 }));
    }, delay + settle * 0.28));
    timers.push(setTimeout(() => {
      words.value = withSpring(1, WORDS_SPRING);
      answers.value = withDelay(WORDS.stagger, withSpring(1, WORDS_SPRING));
      setReady(true);
    }, landed + settle * 0.5));
    return () => timers.forEach(clearTimeout);
    // Plays once, on arrival.
  }, []);

  // Nearest the button first; each card flies off away from it.
  const origin = { x: width / 2, y: height - insets.bottom - 50 - theme.ui.space["2"] - 25 };
  const order = cards.map((card, index) => ({ index, distance: Math.hypot(card.x + card.width / 2 - origin.x, card.y + card.height / 2 - origin.y) }))
    .sort((a, b) => a.distance - b.distance).map((entry) => entry.index);

  const leave = () => {
    if (!ready) return;
    setReady(false);
    haptics.tap();
    const span = THROW.duration + THROW.stagger * cards.length;
    thrown.value = withTiming(span, { duration: span, easing: Easing.linear });
    gone.value = withTiming(0, { duration: 140 });
    button.current?.measureInWindow((x, y, measuredWidth, height) => onLeave({ x, y, width: measuredWidth, height }));
  };

  const pile = useAnimatedStyle(() => ({ transform: [{ translateY: pileY.value }] }));
  const headline = useAnimatedStyle(() => ({ opacity: words.value * gone.value, transform: [{ translateY: WORDS.rise * (1 - words.value) }] }));
  const buttons = useAnimatedStyle(() => ({ opacity: answers.value * gone.value, transform: [{ translateY: WORDS.rise * (1 - answers.value) }] }));

  return <ScopedTheme name="dark">
    <StatusBar style="light" />
    <View style={styles.root}>
      <Animated.View style={[styles.fill, pile]} pointerEvents="none">
        {cards.map((card, index) => {
          const rank = order.indexOf(index);
          const centre = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
          const dx = centre.x - origin.x;
          const dy = centre.y - origin.y - 140;
          const length = Math.hypot(dx, dy) || 1;
          const speed = THROW.speed + (rank % 3) * 180;
          const vx = (dx / length) * speed;
          return <MessCard key={card.key} x={card.x} y={card.y} turn={card.turn} delay={delays[index]!} reduced={reduced}
            from={(index % 2 ? 1 : -1) * (20 + index * 6)} spin={(index % 2 ? 1 : -1) * LAND.spin}
            thrown={thrown} rank={rank} vx={vx} vy={(dy / length) * speed} throwSpin={(vx >= 0 ? 1 : -1) * (40 + (rank % 4) * 12)}>
            {card.render()}
          </MessCard>;
        })}
      </Animated.View>
      <View style={[styles.words, { paddingBottom: insets.bottom }]} pointerEvents={ready ? "box-none" : "none"}>
        <Fade />
        <Animated.View style={[styles.headline, headline]}>
          <Text role="title1" accessibilityRole="header">Job hunting shouldn't be another job.</Text>
        </Animated.View>
        <Animated.View style={[styles.answers, buttons]}>
          <View ref={button} collapsable={false}>
            <Button variant="primary" fullWidth onPress={leave}>Leave it to Pinkslip</Button>
          </View>
          <Button variant="text" fullWidth onPress={onAccount}>I have an account</Button>
        </Animated.View>
      </View>
    </View>
  </ScopedTheme>;
}

interface MessCardProps {
  x: number;
  y: number;
  /** How the card lies, about its top left corner, as drawn. */
  turn: number;
  delay: number;
  reduced: boolean;
  /** Where it falls from, sideways, and how it's turned as it falls. */
  from: number;
  spin: number;
  thrown: SharedValue<number>;
  /** Its place in the throw: nearest the button goes first. */
  rank: number;
  vx: number;
  vy: number;
  throwSpin: number;
  children: ReactNode;
}

/** One piece of the mess: it falls in larger and turned, hits and settles;
 * thrown, it carries on at its speed under gravity, spinning as it goes. */
function MessCard({ x, y, turn, delay, reduced, from, spin, thrown, rank, vx, vy, throwSpin, children }: MessCardProps) {
  const fall = useSharedValue(reduced ? 1 : 0);
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withDelay(delay, withTiming(1, { duration: reduced ? 200 : 90 }));
    if (!reduced) fall.value = withDelay(delay, withSpring(1, LAND_SPRING));
    // Lands once, on arrival.
  }, []);
  const style = useAnimatedStyle(() => {
    const off = 1 - fall.value;
    const time = Math.min(Math.max(thrown.value - rank * THROW.stagger, 0), THROW.duration) / 1000;
    const flight = time / (THROW.duration / 1000);
    if (reduced) return { opacity: shown.value * (1 - flight) };
    return {
      opacity: shown.value,
      transform: [
        { translateX: from * off + vx * time },
        { translateY: LAND.from * off + vy * time + 0.5 * THROW.gravity * time * time },
        { rotate: `${spin * off + throwSpin * flight}deg` },
        { scale: 1 + (LAND.scale - 1) * off + THROW.scale * flight },
      ],
    };
  });
  return <Animated.View style={[styles.card, { left: x, top: y }, style]}>
    <View style={{ transform: [{ rotate: `${turn}deg` }], transformOrigin: "left top" }}>{children}</View>
  </Animated.View>;
}

/** The page darkens under the words, so the mess fades out behind them. */
function Fade() {
  return <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
    <Defs>
      <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={D.bg} stopOpacity={0} />
        <Stop offset="0.32" stopColor={D.bg} stopOpacity={1} />
      </LinearGradient>
    </Defs>
    <Rect x="0" y="0" width="1" height="1" fill="url(#fade)" />
  </Svg>;
}

// The mess (Paper, 1 · The hook): seven cards, in the order they land.

function Small({ children, tone = D["ink-2"], medium = false, size = 12, line = false }: { children: ReactNode; tone?: string; medium?: boolean; size?: 12 | 13; line?: boolean }) {
  return <RNText allowFontScaling={false} numberOfLines={line ? 1 : undefined}
    style={[size === 12 ? styles.small : styles.note, line && styles.shrink, { color: tone, fontFamily: medium ? faces.textMedium : faces.text }]}>
    {children}
  </RNText>;
}

function Spreadsheet() {
  const rows: [string, string, string, "hi" | "ghosted" | null][] = [
    ["Stripe", "Applied?", "??", "hi"],
    ["Notion", "Ghosted", "Mon?", "ghosted"],
    ["Ramp", "Not yet", "", null],
  ];
  return <View style={[styles.panel, styles.sheet]}>
    <View style={styles.sheetHead}>
      <View style={styles.sheetIcon} />
      <Small medium>job_search_FINAL_v3</Small>
    </View>
    <View style={[styles.sheetRow, styles.sheetRule]}>
      {["Company", "Status", "Follow up"].map((label, index) => <View key={label} style={[styles.cell, index < 2 ? styles.cellFixed : styles.cellRest]}>
        <Small medium tone={D["ink-3"]}>{label}</Small>
      </View>)}
    </View>
    {rows.map(([company, status, follow, mark], index) => <View key={company} style={[styles.sheetRow, index < rows.length - 1 && styles.sheetRuleSoft]}>
      <View style={[styles.cell, styles.cellFixed]}><Small>{company}</Small></View>
      <View style={[styles.cell, styles.cellFixed, mark === "ghosted" && styles.ghosted]}>
        {mark === "ghosted" ? <Small medium tone={MESS.ghostedInk}>{status}</Small> : <Small>{status}</Small>}
      </View>
      <View style={[styles.cell, styles.cellRest, mark === "hi" && styles.cellHi]}>
        {mark === "hi" ? <Small medium tone={MESS.cellHiInk}>{follow}</Small> : <Small>{follow}</Small>}
      </View>
    </View>)}
  </View>;
}

function Tabs() {
  const tabs = [MESS.blue, MESS.orange, MESS.green, MESS.violet];
  return <View style={[styles.panel, styles.tabs]}>
    <View style={styles.tabRow}>
      {tabs.map((dot, index) => <View key={dot} style={[styles.tab, index === 0 ? styles.tabOn : null]}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <View style={[styles.tabLine, { backgroundColor: index === 0 ? MESS.tabLineOn : MESS.tabLine }]} />
      </View>)}
      <View style={styles.more}><Small medium tone={D["ink-3"]}>+38</Small></View>
    </View>
    <View style={styles.url}><Small tone={D["ink-3"]}>careers…/jobs?page=4 of 31</Small></View>
  </View>;
}

function Sticky() {
  return <View style={styles.sticky}>
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
      <Defs>
        <LinearGradient id="sticky" x1="0" y1="0" x2="0.2" y2="1">
          <Stop offset="0" stopColor={MESS.stickyTop} />
          <Stop offset="1" stopColor={MESS.stickyBottom} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="1" height="1" fill="url(#sticky)" />
    </Svg>
    <RNText allowFontScaling={false} style={styles.stickyText}>follow up with the recruiter??</RNText>
    <Small size={13} tone={MESS.stickyInk2}>which one</Small>
    <View style={styles.tape} />
  </View>;
}

function ColdEmail() {
  return <View style={[styles.panel, styles.email]}>
    <View style={[styles.sheetHead, styles.between]}>
      <Small medium>New message</Small>
      <Small medium tone={D["ink-4"]}>Send</Small>
    </View>
    <View style={[styles.to, styles.sheetRuleSoft]}>
      <Small size={13} tone={D["ink-4"]}>To:</Small>
      <Small size={13} medium>???</Small>
    </View>
    <View style={styles.message}>
      <Small size={13} medium tone={D.ink}>Quick question about the role</Small>
      <Small size={13} tone={D["ink-3"]}>Hi! I hope this finds you well…</Small>
    </View>
  </View>;
}

function WhyHere() {
  return <View style={[styles.panel, styles.why]}>
    <Small size={13} medium tone={D.ink}>Why do you want to work here? *</Small>
    <View style={styles.field}>
      <View style={styles.typing}>
        <Small size={13} line>I've always been passionate about</Small>
        <View style={styles.caret} />
      </View>
      <View style={styles.count}><Small tone={D["ink-4"]}>33 / 500</Small></View>
    </View>
  </View>;
}

function OldPost() {
  return <View style={[styles.panel, styles.post]}>
    <View style={styles.postLine}>
      <View style={[styles.dot, { backgroundColor: MESS.amber }]} />
      <Small size={13} medium>Posted 30+ days ago</Small>
    </View>
    <View style={styles.postDetail}><Small tone={D["ink-3"]}>200+ applicants</Small></View>
  </View>;
}

function Odds() {
  return <View style={[styles.panel, styles.odds]}>
    <View>
      <RNText allowFontScaling={false} style={[styles.stat, { color: D.ink }]}>47</RNText>
      <Small tone={D["ink-3"]}>applied</Small>
    </View>
    <View>
      <RNText allowFontScaling={false} style={[styles.stat, { color: D.bad }]}>2</RNText>
      <Small tone={D["ink-3"]}>replies</Small>
    </View>
  </View>;
}

/** Where each card lies on a 390pt screen (Paper), roughly how big it is
 * (for which way it's thrown), and how it's turned. */
const CARDS: { key: string; left: number; top: number; width: number; height: number; turn: number; render: () => ReactNode }[] = [
  { key: "sheet", left: -18, top: 88, width: 252, height: 150, turn: -8, render: () => <Spreadsheet /> },
  { key: "tabs", left: 200, top: 72, width: 232, height: 76, turn: 8, render: () => <Tabs /> },
  { key: "sticky", left: 236, top: 206, width: 148, height: 144, turn: -7, render: () => <Sticky /> },
  { key: "email", left: 8, top: 258, width: 236, height: 116, turn: 4, render: () => <ColdEmail /> },
  { key: "why", left: 112, top: 392, width: 270, height: 112, turn: -5, render: () => <WhyHere /> },
  { key: "post", left: 8, top: 530, width: 176, height: 58, turn: -8, render: () => <OldPost /> },
  { key: "odds", left: 250, top: 528, width: 124, height: 70, turn: 7, render: () => <Odds /> },
];

const styles = StyleSheet.create((theme) => ({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.ui.color.bg, overflow: "hidden" },
  fill: { ...StyleSheet.absoluteFillObject },
  card: { position: "absolute" },
  words: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    gap: theme.ui.space["8"], paddingTop: 48, paddingHorizontal: theme.ui.size.gutter,
  },
  headline: { paddingHorizontal: theme.ui.space["2"] },
  answers: { gap: theme.ui.space["2"] },
  // The mess.
  panel: {
    borderRadius: theme.ui.radius.md, backgroundColor: MESS.card, overflow: "hidden",
    boxShadow: "inset 0px 0px 0px 0.5px rgba(255, 255, 255, 0.08), 0px 18px 36px -10px rgba(0, 0, 0, 0.7)",
  },
  small: { fontSize: 12, lineHeight: 16 },
  note: { fontSize: 13, lineHeight: 18 },
  sheet: { width: 252 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"], paddingVertical: theme.ui.space["2"], paddingHorizontal: theme.ui.space["3"], backgroundColor: MESS.head },
  between: { justifyContent: "space-between" },
  sheetIcon: { width: 12, height: 12, borderRadius: 3, backgroundColor: MESS.sheetGreen },
  sheetRow: { flexDirection: "row" },
  sheetRule: { borderBottomWidth: 1, borderBottomColor: MESS.rule },
  sheetRuleSoft: { borderBottomWidth: 1, borderBottomColor: MESS.ruleSoft },
  cell: { paddingVertical: 6, paddingHorizontal: theme.ui.space["3"] },
  cellFixed: { width: 84, borderRightWidth: 1, borderRightColor: MESS.ruleSoft },
  cellRest: { flex: 1 },
  cellHi: { backgroundColor: MESS.cellHi },
  ghosted: { backgroundColor: MESS.ghosted },
  tabs: { width: 232, gap: theme.ui.space["2"], paddingTop: theme.ui.space["2"], paddingHorizontal: theme.ui.space["2"], paddingBottom: theme.ui.space["3"] },
  tabRow: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"] },
  tab: { width: 36, height: 22, flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"], paddingHorizontal: 6, borderRadius: 6, backgroundColor: MESS.tab },
  tabOn: { width: 44, backgroundColor: MESS.tabOn },
  tabLine: { flex: 1, height: 4, borderRadius: theme.ui.radius.full },
  dot: { width: 8, height: 8, borderRadius: theme.ui.radius.full },
  more: { paddingLeft: theme.ui.space["1"] },
  url: { height: 26, justifyContent: "center", paddingHorizontal: 10, borderRadius: theme.ui.radius.full, backgroundColor: MESS.field },
  sticky: {
    width: 148, height: 144, gap: theme.ui.space["1"], paddingTop: theme.ui.space["5"], paddingHorizontal: theme.ui.space["4"], paddingBottom: theme.ui.space["4"],
    borderRadius: 4, overflow: "visible", boxShadow: "0px 20px 30px -12px rgba(0, 0, 0, 0.7)",
  },
  stickyText: { fontFamily: faces.textMedium, fontSize: 17, lineHeight: 22, color: MESS.stickyInk },
  tape: { position: "absolute", left: 44, top: -8, width: 60, height: 18, backgroundColor: MESS.tape, transform: [{ rotate: "4deg" }] },
  email: { width: 236 },
  to: { flexDirection: "row", gap: theme.ui.space["2"], paddingVertical: theme.ui.space["2"], paddingHorizontal: theme.ui.space["3"] },
  message: { gap: 2, paddingTop: theme.ui.space["2"], paddingHorizontal: theme.ui.space["3"], paddingBottom: theme.ui.space["3"] },
  why: { width: 270, gap: theme.ui.space["2"], padding: theme.ui.space["4"] },
  field: {
    gap: theme.ui.space["2"], paddingVertical: theme.ui.space["2"], paddingHorizontal: theme.ui.space["3"],
    borderRadius: theme.ui.radius.sm, backgroundColor: MESS.field, boxShadow: `inset 0px 0px 0px 1px ${MESS.blue}`,
  },
  typing: { flexDirection: "row", alignItems: "center", gap: 1 },
  shrink: { flexShrink: 1 },
  caret: { width: 1.5, height: 16, backgroundColor: MESS.blue },
  count: { alignSelf: "flex-end" },
  post: { gap: 2, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: MESS.head, boxShadow: "inset 0px 0px 0px 0.5px rgba(255, 255, 255, 0.08), 0px 12px 24px -8px rgba(0, 0, 0, 0.7)" },
  postLine: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  postDetail: { paddingLeft: theme.ui.space["4"] },
  odds: { flexDirection: "row", gap: theme.ui.space["4"], paddingVertical: theme.ui.space["3"], paddingHorizontal: theme.ui.space["4"] },
  stat: { fontFamily: faces.display, fontSize: 28, lineHeight: 30 },
}));
