import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { Button, JobRow, ROW_ARRIVE, ROW_LEAVE, ROW_MOVE, SectionHeader, Text } from "../../ui";
import { KitPage } from "./KitPage";

/**
 * Paper "Tracker moves, first load, link card · Nov 8", board 2, made calmer
 * (owner, Nov 8: the postings sliding in looked wrong). Postings new since
 * you last looked are uncovered at the top as the rows you've seen make
 * room, all at once on Reminders' list spring: no rise, no stagger, nothing
 * waiting. A first launch shows placeholders in the rows' own shape and
 * fades the rows in together. On sample rows; Jobs is unchanged until the
 * owner picks it.
 */

/** A first launch: the rows arrive together, plainly. */
const ARRIVE = FadeIn.duration(150);
/** Placeholders go quickly as the rows come, so the two aren't read at once. */
const GIVE_WAY = FadeOut.duration(100);
const LOADING_MS = 1400;

interface Sample { id: string; title: string; company: string; facts: string; age: string }
const SEEN: Sample[] = [
  { id: "ramp", title: "Software Engineer, New Grad", company: "Ramp", facts: "New York · $150–180K", age: "2h" },
  { id: "figma", title: "Backend Engineer, Early Career", company: "Figma", facts: "San Francisco · $140–175K", age: "3h" },
  { id: "datadog", title: "Software Engineer I, Platform", company: "Datadog", facts: "New York · $130–160K", age: "4h" },
  { id: "vercel", title: "Frontend Engineer, New Grad", company: "Vercel", facts: "Remote", age: "5h" },
];
const NEW: Sample[] = [
  { id: "linear", title: "Software Engineer, Product", company: "Linear", facts: "Remote · $150–190K", age: "Now" },
  { id: "notion", title: "Software Engineer, New Grad", company: "Notion", facts: "New York · $155–185K", age: "Now" },
  { id: "asana", title: "Associate Software Engineer", company: "Asana", facts: "San Francisco", age: "8m" },
];

const NEW_IDS = new Set(NEW.map((row) => row.id));

type Phase = "seen" | "new" | "loading" | "launched";

export function NewJobsSample() {
  const [phase, setPhase] = useState<Phase>("seen");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const launch = () => {
    setPhase("loading");
    timer.current = setTimeout(() => setPhase("launched"), LOADING_MS);
  };
  const rows = phase === "new" ? [...NEW, ...SEEN] : phase === "loading" ? [] : SEEN;

  return <KitPage title="New jobs arrive">
    <View style={styles.intro}>
      <Text role="subhead" tone="ink-2">Opening Pinkslip shows the list it kept; what's new since you looked is uncovered at the top as the rest make room. A first launch has nothing kept, so it shows the rows' shape and fades them in.</Text>
      <View style={styles.buttons}>
        <Button variant="primary" disabled={phase === "new" || phase === "loading"} onPress={() => setPhase("new")}>Three new postings arrive</Button>
        <Button variant="secondary" disabled={phase === "loading"} onPress={launch}>First launch</Button>
        <Button variant="secondary" disabled={phase === "seen"} onPress={() => setPhase("seen")}>Reset</Button>
      </View>
    </View>
    {phase === "loading"
      ? <Animated.View key="placeholders" exiting={GIVE_WAY}><JobPlaceholders /></Animated.View>
      : <Animated.View key={phase === "launched" ? "launched" : "list"} entering={phase === "launched" ? ARRIVE : undefined}>
        <SectionHeader title="New today" count={rows.length} first />
        {rows.map((row) => {
          const fresh = NEW_IDS.has(row.id);
          // New rows sit under the ones you've seen, which slide off them.
          return <Animated.View key={row.id} layout={ROW_MOVE} entering={fresh ? ROW_ARRIVE : undefined} exiting={fresh ? ROW_LEAVE : undefined}
            style={[styles.row, fresh ? styles.under : styles.over]}>
            <JobRow title={row.title} company={row.company} facts={row.facts} age={row.age} unread={fresh}
              logo={{ name: row.company, uri: null }} />
          </Animated.View>;
        })}
      </Animated.View>}
  </KitPage>;
}

/** Each placeholder's two bars, so the list doesn't read as a grid. */
const BARS = [[200, 150], [176, 128], [222, 164], [190, 112], [208, 146]] as const;

/** Placeholders in Jobs' own shape (the board's fix): a bar where the
 * header goes, then 64pt rows with the real tile, empty, and two lines,
 * pulsing as the app's do. Today's are 84pt and three lines. */
function JobPlaceholders() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.5, { duration: 900 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const fade = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <View accessible accessibilityLabel="Loading">
    <View style={styles.headerBar}><Animated.View style={[styles.bar, styles.headerBarFill, fade]} /></View>
    {BARS.map(([title, facts], index) => <View key={index} style={styles.placeholder}>
      <View style={styles.tileSlot}><View style={styles.tile} /></View>
      <View style={styles.lines}>
        <Animated.View style={[styles.bar, { width: title }, fade]} />
        <Animated.View style={[styles.bar, { width: facts }, fade]} />
      </View>
    </View>)}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  intro: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, paddingBottom: theme.ui.space["2"] },
  buttons: { gap: theme.ui.space["2"] },
  // Opaque, so a row sliding over another covers it.
  row: { backgroundColor: theme.ui.color.bg },
  under: { zIndex: 0 },
  over: { zIndex: 1 },
  headerBar: { paddingTop: theme.ui.space["4"], paddingBottom: theme.ui.space["1"], paddingHorizontal: theme.ui.size.gutter, height: theme.ui.type.footnote.line + theme.ui.space["4"] + theme.ui.space["1"], justifyContent: "center" },
  headerBarFill: { width: 84, height: 10, borderRadius: 5 },
  placeholder: { flexDirection: "row", alignItems: "flex-start", minHeight: 64 },
  tileSlot: { width: theme.ui.size.keyline, paddingLeft: theme.ui.size.gutter, paddingTop: theme.ui.space["3"] },
  // The real tile, empty: white with its hairline, so only the logo arrives.
  tile: {
    width: theme.ui.size.logo, height: theme.ui.size.logo, borderRadius: theme.ui.size.logo / 4, borderCurve: "continuous",
    backgroundColor: theme.ui.color["bg-elev"], borderWidth: StyleSheet.hairlineWidth, borderColor: theme.ui.color.separator,
  },
  lines: {
    flex: 1, gap: 8, paddingTop: theme.ui.space["4"], paddingBottom: 15, paddingRight: theme.ui.size.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.ui.color.separator,
  },
  bar: { height: 12, borderRadius: 6, backgroundColor: theme.ui.color.fill },
}));
