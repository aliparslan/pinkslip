import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Svg, { Circle, Path } from "react-native-svg";
import { CompanyLogo, type CompanyLogoProps } from "./CompanyLogo";
import { Text } from "./Text";

export type JobStage = "saved" | "applied";

export interface JobRowProps {
  title: string;
  company: string;
  /** Line two after the company: place and pay, plus the level only when the
   * title doesn't already say it. */
  facts?: string;
  /** How old the posting is (2h, 3d), unless you've saved or applied: then the
   * stage takes the age's place. */
  age?: string;
  stage?: JobStage;
  unread?: boolean;
  logo: Omit<CompanyLogoProps, "size">;
  onPress?: () => void;
  onLongPress?: () => void;
  /** The row's menu again, for VoiceOver's actions rotor. */
  actions?: { id: string; label: string; run: () => void }[];
}

const stageLabels: Record<JobStage, string> = { saved: "Saved", applied: "Applied" };

/** The two-line job row: title and age, then company and facts, each one line
 * so every row is the same 64pt. The logo is exactly the two lines' height and
 * the unread dot sits on its centre; text and separator start on the 68 line. */
export function JobRow({ title, company, facts, age, stage, unread, logo, onPress, onLongPress, actions }: JobRowProps) {
  const { theme } = useUnistyles();
  const trailing = stage ? stageLabels[stage] : age;
  const label = [unread ? "New" : null, title, company, facts, trailing].filter(Boolean).join(", ");
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress}
    accessibilityActions={actions?.map((action) => ({ name: action.id, label: action.label }))}
    onAccessibilityAction={(event) => actions?.find((action) => action.id === event.nativeEvent.actionName)?.run()}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.gutter}>{unread ? <View style={styles.dot} /> : null}</View>
    <View style={styles.logo}><CompanyLogo {...logo} /></View>
    <View style={styles.text}>
      <View style={[styles.line, styles.first]}>
        <Text role="subhead" weight="medium" lines={1} flex>{title}</Text>
        {stage ? <View style={styles.stage}>
          <StageIcon stage={stage} color={theme.ui.color["ink-3"]} />
          <Text role="subhead" tone="ink-3">{stageLabels[stage]}</Text>
        </View> : age ? <Text role="subhead" tone="ink-3">{age}</Text> : null}
      </View>
      <View style={styles.line}>
        <Text role="subhead">{company}</Text>
        {facts ? <Text role="subhead" tone="ink-2" lines={1} flex>· {facts}</Text> : null}
      </View>
    </View>
  </Pressable>;
}

/** Saved is a dashed ring; applied is a ring with its first quarter filled. */
function StageIcon({ stage, color }: { stage: JobStage; color: string }) {
  return <Svg width={14} height={14} viewBox="0 0 14 14">
    {stage === "saved"
      ? <Circle cx={7} cy={7} r={5.5} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="2.2 2" />
      : <>
        <Circle cx={7} cy={7} r={5.5} fill="none" stroke={color} strokeWidth={1.5} />
        <Path d="M7 7V3.2A3.8 3.8 0 0 1 10.8 7Z" fill={color} />
      </>}
  </Svg>;
}

// The two lines are the logo's height, and the row's padding makes up the
// rest of 64, so the dot, the logo and the text block share one centre line.
const DOT = 8;

const styles = StyleSheet.create((theme) => {
  const block = theme.ui.type.subhead.line * 2;
  const pad = (theme.ui.size.jobRow - block) / 2;
  return {
    // At least 64: larger Dynamic Type sizes grow the row instead of clipping it.
    row: { flexDirection: "row", alignItems: "center", minHeight: theme.ui.size.jobRow, backgroundColor: theme.ui.color.bg },
    pressed: { backgroundColor: theme.ui.color.fill },
    gutter: { width: theme.ui.size.gutter, alignItems: "center" },
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: theme.ui.color.ink },
    logo: { width: theme.ui.size.keyline - theme.ui.size.gutter },
    text: {
      flex: 1,
      minWidth: 0,
      alignSelf: "stretch",
      justifyContent: "center",
      paddingVertical: pad,
      paddingRight: theme.ui.space["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.ui.color.separator,
    },
    line: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["1"] },
    first: { gap: theme.ui.space["2"] },
    stage: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"] },
  };
});
