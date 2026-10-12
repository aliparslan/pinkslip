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
}

const stageLabels: Record<JobStage, string> = { saved: "Saved", applied: "Applied" };

/** The two-line job row: title and age, then company and facts. At least 64pt,
 * with the text on the 60 line and the separator starting there. */
export function JobRow({ title, company, facts, age, stage, unread, logo, onPress, onLongPress }: JobRowProps) {
  const { theme } = useUnistyles();
  const trailing = stage ? stageLabels[stage] : age;
  const label = [unread ? "New" : null, title, company, facts, trailing].filter(Boolean).join(", ");
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.gutter}>{unread ? <View style={styles.dot} /> : null}</View>
    <View style={styles.logo}><CompanyLogo {...logo} /></View>
    <View style={styles.text}>
      <View style={[styles.line, styles.first]}>
        <Text weight="medium" flex>{title}</Text>
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

// The dot and the logo line up with the title's first line and the two-line
// block, so their offsets come from the type, not from hand-set spacing.
const PAD = 10;
const LINE_GAP = 1;

const styles = StyleSheet.create((theme) => {
  const title = theme.ui.type.body.line;
  const block = title + LINE_GAP + theme.ui.type.subhead.line;
  return {
    row: { flexDirection: "row", alignItems: "flex-start", minHeight: theme.ui.size.jobRow, backgroundColor: theme.ui.color.bg },
    pressed: { backgroundColor: theme.ui.color.fill },
    gutter: { width: theme.ui.size.gutter, alignItems: "center", paddingTop: PAD + (title - 8) / 2 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.ui.color.ink },
    logo: { width: theme.ui.size.keyline - theme.ui.size.gutter, paddingTop: PAD + (block - theme.ui.size.logo) / 2 },
    text: {
      flex: 1,
      minWidth: 0,
      gap: LINE_GAP,
      paddingVertical: PAD,
      paddingRight: theme.ui.space["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.ui.color.separator,
    },
    line: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["1"] },
    first: { gap: theme.ui.space["2"] },
    stage: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"] },
  };
});
