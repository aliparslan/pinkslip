import { useSyncExternalStore } from "react";
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
  /** Line two after the company: place and pay, plus the level only when the
   * title doesn't already say it. */
  facts?: string;
  /** How old the posting is (2h, 3d), unless you've saved or applied: then the
   * stage takes the age's place. */
  age?: string;
  stage?: JobStage;
  unread?: boolean;
  /** You've opened this job before. */
  seen?: boolean;
  logo: Omit<CompanyLogoProps, "size">;
  onPress?: () => void;
  onLongPress?: () => void;
  /** The row's menu again, for VoiceOver's actions rotor. */
  actions?: { id: string; label: string; run: () => void }[];
}

const stageLabels: Record<JobStage, string> = { saved: "Saved", applied: "Applied" };

/** How a new job you haven't opened is marked, while the options are
 * compared in the redesign kit. `dot`: Mail's dot in a gutter before the logo.
 * `quiet`: no mark; jobs you've opened step back to regular weight and
 * lighter ink. `badge`: a dot on the logo's corner. `age`: a dot beside the
 * age. All but `dot` keep the logo on the 16 margin. */
export type UnreadStyle = "dot" | "quiet" | "badge" | "age";
let unreadStyle: UnreadStyle = "dot";
const listeners = new Set<() => void>();
export function setUnreadStyle(next: UnreadStyle) {
  unreadStyle = next;
  for (const listener of listeners) listener();
}
export function useUnreadStyle(): UnreadStyle {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => unreadStyle);
}

/** The two-line job row: title and age, then company and facts, each one line
 * so every row is the same 64pt. The unread dot starts on the 16 margin, level
 * with the logo's centre, and the logo (exactly the two lines' height) follows
 * it, so nothing crosses the margin; text and separator start on the 84 line. */
export function JobRow({ title, company, facts, age, stage, unread, seen = false, logo, onPress, onLongPress, actions }: JobRowProps) {
  const { theme } = useUnistyles();
  const style = useUnreadStyle();
  const dim = style === "quiet" && seen;
  const trailing = stage ? stageLabels[stage] : age;
  const label = [unread ? "New" : null, title, company, facts, trailing].filter(Boolean).join(", ");
  // Never flattened: a link's native preview trigger needs exactly one child view.
  return <Pressable collapsable={false} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress}
    accessibilityActions={actions?.map((action) => ({ name: action.id, label: action.label }))}
    onAccessibilityAction={(event) => actions?.find((action) => action.id === event.nativeEvent.actionName)?.run()}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    {style === "dot" ? <View style={styles.gutter}>{unread ? <View style={styles.dot} /> : null}</View> : <View style={styles.margin} />}
    <View style={styles.logo}>
      <CompanyLogo {...logo} />
      {style === "badge" && unread ? <View style={styles.badge} /> : null}
    </View>
    <View style={styles.text}>
      <View style={[styles.line, styles.first]}>
        <Text role="subhead" weight={dim ? "regular" : "medium"} tone={dim ? "ink-2" : "ink"} lines={1} flex>{title}</Text>
        {stage ? <View style={styles.stage}>
          <StageIcon stage={stage} color={theme.ui.color["ink-3"]} />
          <Text role="subhead" tone="ink-3">{stageLabels[stage]}</Text>
        </View> : age ? <View style={styles.age}>
          {/* Text first, so the row's baseline comes from it; row-reverse puts the dot before it. */}
          <Text role="subhead" tone={style === "age" && unread ? "ink" : "ink-3"}>{age}</Text>
          {style === "age" && unread ? <View style={styles.ageDot} /> : null}
        </View> : null}
      </View>
      <View style={styles.line}>
        <Text role="subhead" tone={dim ? "ink-2" : "ink"}>{company}</Text>
        {facts ? <Text role="subhead" tone={dim ? "ink-3" : "ink-2"} lines={1} flex>· {facts}</Text> : null}
      </View>
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
    gutter: { width: theme.ui.size.gutter + theme.ui.size.unreadSlot, paddingLeft: theme.ui.size.gutter },
    margin: { width: theme.ui.size.gutter },
    // Like an app icon's badge: on the logo's top-right corner, ringed in the page colour.
    badge: {
      position: "absolute", top: -4, right: 8, width: 14, height: 14, borderRadius: 7,
      borderWidth: 2.5, borderColor: theme.ui.color.bg, backgroundColor: theme.ui.color.ink,
    },
    age: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
    ageDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: theme.ui.color.ink },
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: theme.ui.color.ink },
    logo: { width: theme.ui.size.keyline - theme.ui.size.gutter - theme.ui.size.unreadSlot },
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
