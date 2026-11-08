import { useState } from "react";
import { View } from "react-native";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { Button, JobRow, SectionHeader, Segmented, StageMark, Text } from "../../ui";
import { KitPage } from "./KitPage";
import { ROW_ARRIVE, ROW_LEAVE, ROW_MOVE } from "./list-motion";

/**
 * A move to a new stage, the two ways iOS moves a row (owner, Nov 8: the
 * first mock-up had too much going on, and its slide looked wrong frame by
 * frame). Both are one beat on Reminders' list spring, starting at once,
 * with nothing else happening: no fill, no rising row, no rolling counts.
 * - Glide: the row slides straight to its new place over the others, as a
 *   re-sorted reminder does.
 * - In place: its old place closes, the rows below sliding up over it, and
 *   it's uncovered in the new stage as the rows there make room, as
 *   Reminders removes and adds.
 * On sample rows; the real Tracker is unchanged until the owner picks one.
 */

type Kind = "glide" | "place";
const KINDS = [{ value: "glide", label: "Glide" }, { value: "place", label: "In place" }] as const;
/** Under All, each stage shows this many. */
const PER_STAGE = 3;

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

type Item =
  | { key: string; kind: "header"; stage: "applied" | "interview"; title: string; count: number }
  | { key: string; kind: "row"; row: Sample; comes: boolean };

export function TrackerMoveSample() {
  const [kind, setKind] = useState<Kind>("glide");
  const [moved, setMoved] = useState(false);
  const applied = moved ? APPLIED.filter((row) => row.id !== "mercury") : APPLIED;
  const interviewing = moved ? [{ ...MERCURY, age: "Now" }, STRIPE] : [STRIPE];
  // Gliding, Mercury is one row that travels. In place, it's a row that
  // leaves Applied and another that arrives in Interviewing.
  const keyOf = (row: Sample, stage: string) => row.id === "mercury" && kind === "place" ? `mercury@${stage}` : row.id;
  // Rows that come and go sit under the rows that move over them.
  const comes = (row: Sample) => row.id === "notion" || (row.id === "mercury" && kind === "place");
  const items: Item[] = [
    { key: "applied", kind: "header", stage: "applied", title: "Applied", count: applied.length },
    ...applied.slice(0, PER_STAGE).map((row): Item => ({ key: keyOf(row, "applied"), kind: "row", row, comes: comes(row) })),
    { key: "interview", kind: "header", stage: "interview", title: "Interviewing", count: interviewing.length },
    ...interviewing.slice(0, PER_STAGE).map((row): Item => ({ key: keyOf(row, "interview"), kind: "row", row, comes: comes(row) })),
  ];

  return <KitPage title="Tracker moves">
    <View style={styles.intro}>
      <Text role="subhead" tone="ink-2">Pick a stage and the row goes there at once, on iOS's own list spring. The buttons stand in for the menu.</Text>
      <Segmented value={kind} segments={KINDS} onChange={(next) => { setKind(next); setMoved(false); }} />
      <View style={styles.buttons}>
        <Button variant="primary" disabled={moved} onPress={() => setMoved(true)}>Move Mercury to Interviewing</Button>
        <Button variant="secondary" disabled={!moved} onPress={() => setMoved(false)}>Move it back</Button>
      </View>
    </View>
    {/* A new way starts from the list as it stands, with nothing arriving. */}
    <LayoutAnimationConfig key={kind} skipEntering>
      <View>
        {items.map((item, index) => <Animated.View key={item.key} layout={ROW_MOVE}
          entering={item.kind === "row" && item.comes ? ROW_ARRIVE : undefined}
          exiting={item.kind === "row" && item.comes ? ROW_LEAVE : undefined}
          style={[styles.item, item.kind === "header" ? styles.header : item.comes ? styles.under : item.key === "mercury" ? styles.travelling : styles.over]}>
          {item.kind === "header"
            ? <SectionHeader title={item.title} count={item.count} leading={<StageMark stage={item.stage} />} onPress={() => undefined} first={index === 0} />
            : <JobRow headline="company" company={item.row.company} title={item.row.title} facts={item.row.facts} age={item.row.age}
              logo={{ name: item.row.company, uri: null }} />}
        </Animated.View>)}
      </View>
    </LayoutAnimationConfig>
  </KitPage>;
}

const styles = StyleSheet.create((theme) => ({
  intro: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, paddingBottom: theme.ui.space["2"] },
  buttons: { gap: theme.ui.space["2"] },
  // Opaque, so a row passing over another covers it.
  item: { backgroundColor: theme.ui.color.bg },
  under: { zIndex: 0 },
  over: { zIndex: 1 },
  // The gliding row passes over the rows it crosses, and under the stage
  // headers, as rows pass under section headers on iOS.
  travelling: { zIndex: 2 },
  header: { zIndex: 3 },
}));
