import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CompanyLogo, type CompanyLogoProps } from "./CompanyLogo";
import { StageMark } from "./StageMark";
import { Text } from "./Text";

export type JobStage = "saved" | "applied";

export interface JobRowProps {
  title: string;
  company: string;
  /** Line three: level, place and pay (the level only when the title doesn't say it). */
  facts?: string;
  /** How old the posting is: 2h, 3d. */
  age?: string;
  /** Where the job is in your pipeline, at the end of line three. */
  stage?: JobStage;
  /** You haven't opened it yet. */
  unread?: boolean;
  /** Tracker's row (TR2b): the company is the one dark line, in Body Medium,
   * with the title and facts in ink-2 and a quiet time. Nothing changes for
   * being new. */
  headline?: "company";
  logo: Omit<CompanyLogoProps, "size">;
  onPress?: () => void;
  onLongPress?: () => void;
  /** The row's menu again, for VoiceOver's actions rotor. */
  actions?: { id: string; label: string; run: () => void }[];
}

const stageLabels: Record<JobStage, string> = { saved: "Saved", applied: "Applied" };

/**
 * The three-line job row, laid out and read the way Gmail shows mail: the
 * company and the age, then the title, then the facts with the stage at the
 * end. Until you open a job the company and title are Medium and a pink dot
 * follows the age; once opened they're Regular and the dot goes. The logo is
 * the height of the first two lines, on the 16 margin. Each line is one line
 * long, so every row is the same 84pt; text and separators start on the 68
 * line. Tracker's row makes the company the headline instead.
 */
export function JobRow({ title, company, facts, age, stage, unread: newToYou, headline, logo, onPress, onLongPress, actions }: JobRowProps) {
  const tracker = headline === "company";
  const unread = newToYou && !tracker;
  const label = [unread ? "Unread" : null, company, title, stage ? stageLabels[stage] : null, facts, age].filter(Boolean).join(", ");
  const weight = unread ? "medium" : "regular";
  // Never flattened: a link's native preview trigger needs exactly one child view.
  return <Pressable collapsable={false} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress}
    accessibilityActions={actions?.map((action) => ({ name: action.id, label: action.label }))}
    onAccessibilityAction={(event) => actions?.find((action) => action.id === event.nativeEvent.actionName)?.run()}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.logo}><CompanyLogo {...logo} /></View>
    <View style={styles.text}>
      <View style={styles.line}>
        <Text role={tracker ? "body" : "subhead"} weight={tracker ? "medium" : weight} lines={1} flex>{company}</Text>
        {age || unread ? <View style={styles.age}>
          {age ? <Text role="subhead" tone={unread ? "ink" : "ink-3"}>{age}</Text> : null}
          {unread ? <View style={styles.dot} /> : null}
        </View> : null}
      </View>
      <Text role="subhead" weight={weight} tone={tracker ? "ink-2" : "ink"} lines={1}>{title}</Text>
      <View style={styles.line}>
        <Text role="subhead" tone="ink-2" lines={1} flex>{facts ?? ""}</Text>
        {stage ? <View style={styles.stage}>
          <StageMark stage={stage} tone="ink-3" />
          <Text role="subhead" tone="ink-3">{stageLabels[stage]}</Text>
        </View> : null}
      </View>
    </View>
  </Pressable>;
}

const DOT = 8;

const styles = StyleSheet.create((theme) => {
  const block = theme.ui.type.subhead.line * 3;
  return {
    // At least 84: larger Dynamic Type sizes grow the row instead of clipping it.
    row: { flexDirection: "row", alignItems: "flex-start", minHeight: theme.ui.size.jobRow, backgroundColor: theme.ui.color.bg },
    pressed: { backgroundColor: theme.ui.color.fill },
    // Centred on the digits' height rather than the line box, which sits a point higher.
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: 2, backgroundColor: theme.ui.color.accent },
    // Level with the first line: the logo spans lines one and two.
    logo: { width: theme.ui.size.keyline, paddingLeft: theme.ui.size.gutter, paddingTop: (theme.ui.size.jobRow - block) / 2 },
    age: { flexDirection: "row", alignItems: "center", gap: 6 },
    text: {
      flex: 1,
      minWidth: 0,
      alignSelf: "stretch",
      justifyContent: "center",
      paddingVertical: (theme.ui.size.jobRow - block) / 2,
      paddingRight: theme.ui.space["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.ui.color.separator,
    },
    line: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["2"] },
    stage: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"] },
  };
});
