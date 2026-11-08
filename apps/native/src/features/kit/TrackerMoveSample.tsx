import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, FadeOut, Keyframe, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { Button, JobRow, SectionHeader, StageMark, Text } from "../../ui";
import { KitPage } from "./KitPage";

/**
 * A mock-up of Paper "Tracker moves, first load, link card · Nov 8", board 1:
 * a moved application glides to its new stage while the rows between make
 * room, each stage's count rolls the way it changed, and the next row under
 * All rises into the place it left. On sample rows; the real Tracker is
 * unchanged until the owner picks it.
 */

/** 320ms on the app's ease-out: every moving row on one curve. */
const GLIDE = LinearTransition.duration(320).easing(Easing.bezier(0.23, 1, 0.32, 1));
/** The app's one entrance for a row: in and up 8pt over 200ms, from 120ms. */
const RISE = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 8 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: Easing.out(Easing.cubic) },
}).duration(200).delay(120);
const LEAVE = FadeOut.duration(120);
/** Under All, each stage shows this many. */
const PER_STAGE = 3;
/** When the moved row has landed: its new stage's count and its time
 * change then, so you see them change (owner, Nov 8). */
const LANDS_MS = 280;

interface Sample { id: string; company: string; title: string; facts: string; age: string }
const MERCURY: Sample = { id: "mercury", company: "Mercury", title: "Software Engineer, New Grad", facts: "San Francisco · applied Nov 4", age: "Nov 4" };
const APPLIED: Sample[] = [
  { id: "ramp", company: "Ramp", title: "Software Engineer, New Grad", facts: "New York · applied Nov 6", age: "Nov 6" },
  MERCURY,
  { id: "plaid", company: "Plaid", title: "Software Engineer I", facts: "San Francisco · applied Nov 2", age: "Nov 2" },
  { id: "notion", company: "Notion", title: "Software Engineer, New Grad", facts: "New York · applied Nov 1", age: "Nov 1" },
  { id: "figma", company: "Figma", title: "Backend Engineer, Early Career", facts: "San Francisco · applied Oct 30", age: "Oct 30" },
];
const STRIPE: Sample = { id: "stripe", company: "Stripe", title: "Software Engineer, New Grad", facts: "Seattle · applied Oct 21", age: "Oct 30" };

type Item = { key: string; kind: "header"; stage: "applied" | "interview"; title: string; count: number } | { key: string; kind: "row"; row: Sample };

export function TrackerMoveSample() {
  const [moved, setMoved] = useState(false);
  // The stage it has landed in: the one it left counts down at once, the
  // one it arrives in counts up as it lands.
  const [landed, setLanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // The fill Mercury had in its menu, fading as it lands (200 to 320ms).
  const fill = useSharedValue(0);
  const move = (next: boolean) => {
    fill.value = 1;
    fill.value = withDelay(200, withTiming(0, { duration: 120 }));
    setMoved(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLanded(next), LANDS_MS);
  };
  const applied = moved ? APPLIED.filter((row) => row.id !== "mercury") : APPLIED;
  const interviewing = moved ? [{ ...MERCURY, age: landed ? "Now" : MERCURY.age }, STRIPE] : [STRIPE];
  // Until it lands, the stage it's heading for still counts one fewer.
  const appliedCount = !moved && landed ? applied.length - 1 : applied.length;
  const interviewCount = moved && !landed ? interviewing.length - 1 : interviewing.length;
  const items: Item[] = [
    { key: "applied", kind: "header", stage: "applied", title: "Applied", count: appliedCount },
    ...applied.slice(0, PER_STAGE).map((row): Item => ({ key: row.id, kind: "row", row })),
    { key: "interview", kind: "header", stage: "interview", title: "Interviewing", count: interviewCount },
    ...interviewing.slice(0, PER_STAGE).map((row): Item => ({ key: row.id, kind: "row", row })),
  ];
  const highlight = useAnimatedStyle(() => ({ opacity: fill.value }));

  return <KitPage title="Tracker moves">
    <View style={styles.intro}>
      <Text role="subhead" tone="ink-2">Long-press a row and pick a stage: it glides there, and the counts roll. Here, the buttons stand in for the menu.</Text>
      <View style={styles.buttons}>
        <Button variant="primary" disabled={moved} onPress={() => move(true)}>Move Mercury to Interviewing</Button>
        <Button variant="secondary" disabled={!moved} onPress={() => move(false)}>Move it back</Button>
      </View>
    </View>
    <View style={styles.list}>
      {items.map((item, index) => <Animated.View key={item.key} layout={GLIDE} entering={item.key === "notion" ? RISE : undefined} exiting={LEAVE}
        style={[styles.item, item.key === "mercury" && styles.moving]}>
        {item.kind === "header"
          ? <SectionHeader title={item.title} count={item.count} rolls leading={<StageMark stage={item.stage} />} onPress={() => undefined} first={index === 0} />
          : <View style={styles.row}>
            <JobRow headline="company" company={item.row.company} title={item.row.title} facts={item.row.facts} age={item.row.age}
              logo={{ name: item.row.company, uri: null }} />
            {item.key === "mercury" ? <Animated.View pointerEvents="none" style={[styles.fill, highlight]} /> : null}
          </View>}
      </Animated.View>)}
    </View>
  </KitPage>;
}

const styles = StyleSheet.create((theme) => ({
  intro: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, paddingBottom: theme.ui.space["2"] },
  buttons: { gap: theme.ui.space["2"] },
  list: {},
  // Opaque, so a row passing over the others covers them.
  item: { backgroundColor: theme.ui.color.bg },
  moving: { zIndex: 1 },
  row: {},
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.ui.color.fill },
}));
