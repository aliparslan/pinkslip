import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Svg, { Circle, Path } from "react-native-svg";
import { CompanyLogo, type CompanyLogoProps } from "./CompanyLogo";
import { Icon } from "./Icon";
import { Text } from "./Text";

export type JobStage = "saved" | "applied";

export interface JobRowProps {
  title: string;
  company: string;
  /** Line three: level, place and pay (the level only when the title doesn't say it). */
  facts?: string;
  /** How old the posting is: 2h, 3d. */
  age?: string;
  /** Where the job is in your pipeline, beside the company. */
  stage?: JobStage;
  /** New, and you haven't opened it. */
  unread?: boolean;
  logo: Omit<CompanyLogoProps, "size">;
  onPress?: () => void;
  onLongPress?: () => void;
  /** The row's menu again, for VoiceOver's actions rotor. */
  actions?: { id: string; label: string; run: () => void }[];
}

const stageLabels: Record<JobStage, string> = { saved: "Saved", applied: "Applied" };

/**
 * The three-line job row, as Messages lays out a conversation: the unread dot
 * in its own slot at the left edge, the logo, then the title and age, the
 * company and its stage, and the facts. Each line is one line long, so every
 * row is the same 84pt; text and separators start on the 88 line.
 */
export function JobRow({ title, company, facts, age, stage, unread, logo, onPress, onLongPress, actions }: JobRowProps) {
  const { theme } = useUnistyles();
  const label = [unread ? "New" : null, title, company, stage ? stageLabels[stage] : null, facts, age].filter(Boolean).join(", ");
  // Never flattened: a link's native preview trigger needs exactly one child view.
  return <Pressable collapsable={false} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress}
    accessibilityActions={actions?.map((action) => ({ name: action.id, label: action.label }))}
    onAccessibilityAction={(event) => actions?.find((action) => action.id === event.nativeEvent.actionName)?.run()}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.unread}>{unread ? <View style={styles.dot} /> : null}</View>
    <View style={styles.logo}><CompanyLogo {...logo} /></View>
    <View style={styles.text}>
      <View style={styles.line}>
        <Text role="subhead" weight="medium" lines={1} flex>{title}</Text>
        {age ? <Text role="subhead" tone="ink-3">{age}</Text> : null}
      </View>
      <View style={styles.line}>
        <Text role="subhead" lines={1} flex>{company}</Text>
        {stage ? <View style={styles.stage}>
          <StageIcon stage={stage} color={theme.ui.color["ink-3"]} />
          <Text role="subhead" tone="ink-3">{stageLabels[stage]}</Text>
        </View> : null}
      </View>
      {facts ? <Text role="subhead" tone="ink-2" lines={1}>{facts}</Text> : null}
    </View>
  </Pressable>;
}

/** Saved is the bookmark (saving isn't a stage); applied is the stage ring
 * with its first quarter filled, the ring that fills as an application advances. */
function StageIcon({ stage, color }: { stage: JobStage; color: string }) {
  if (stage === "saved") return <Icon name="saved" size={13} tone="ink-3" />;
  return <Svg width={14} height={14} viewBox="0 0 14 14">
    <Circle cx={7} cy={7} r={5.5} fill="none" stroke={color} strokeWidth={1.5} />
    <Path d="M7 7V3.2A3.8 3.8 0 0 1 10.8 7Z" fill={color} />
  </Svg>;
}

const DOT = 10;

const styles = StyleSheet.create((theme) => {
  const block = theme.ui.type.subhead.line * 3;
  return {
    // At least 84: larger Dynamic Type sizes grow the row instead of clipping it.
    row: { flexDirection: "row", alignItems: "center", minHeight: theme.ui.size.jobRow, backgroundColor: theme.ui.color.bg },
    pressed: { backgroundColor: theme.ui.color.fill },
    unread: { width: theme.ui.size.unreadSlot, alignItems: "center" },
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: theme.ui.color.ink },
    logo: { width: theme.ui.size.keyline - theme.ui.size.unreadSlot },
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
