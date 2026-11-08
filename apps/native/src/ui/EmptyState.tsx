import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, type ButtonVariant } from "./Button";
import type { IconName } from "./Icon";
import { Text } from "./Text";

export interface EmptyStateProps {
  title: string;
  message?: string;
  /** The two stacked slips above the title, for a list with nothing in it
   * yet; "smile" when having nothing is good news (Today, all caught up).
   * Leave them off when something went wrong. */
  slips?: boolean | "smile";
  /** In the slips' place: a rare error's stamped slip. */
  art?: ReactNode;
  /** The one thing to do: pink when it's the way forward (Browse jobs), grey
   * for a retry. */
  action?: { label: string; onPress: () => void; pending?: boolean; variant?: ButtonVariant; icon?: IconName };
  /** A quieter way out under it, as a text button. */
  secondary?: { label: string; onPress: () => void };
}

/**
 * What a list says when it has nothing to show (Paper "Parts · Empty
 * state"): Title 2, one Body line in ink-2, then the button and an optional
 * text button, all on one centre line, 16 apart, 32 in from the edges.
 */
/** Where a tab's empty state starts under its title, as a share of the
 * screen's height: the same on every tab, so switching tabs doesn't move the
 * picture (2026-11-04 polish pass). */
export const EMPTY_TOP = 0.14;

export function EmptyState({ title, message, slips, art, action, secondary }: EmptyStateProps) {
  return <View style={styles.root}>
    {art}
    {slips && !art ? <View style={styles.slips} accessible={false}>
      <View style={[styles.slip, styles.back]} />
      {slips === "smile"
        ? <View style={[styles.slip, styles.front, styles.smiling]}><Smile /></View>
        : <View style={[styles.slip, styles.front]}>
          <View style={[styles.line, styles.lineTitle]} />
          <View style={[styles.line, styles.lineLong]} />
          <View style={[styles.line, styles.lineShort]} />
        </View>}
    </View> : null}
    <Text role="title2" align="center" accessibilityRole="header">{title}</Text>
    {message ? <View style={styles.message}><Text tone="ink-2" align="center">{message}</Text></View> : null}
    {/* Each button in its own box: a hugging button aligns itself to the
        start, so the box is what the column centres. */}
    {action || secondary ? <View style={styles.actions}>
      {action ? <View><Button variant={action.variant ?? "primary"} icon={action.icon} pending={action.pending}
        onPress={action.onPress}>{action.label}</Button></View> : null}
      {secondary ? <View><Button variant="plain" onPress={secondary.onPress}>{secondary.label}</Button></View> : null}
    </View> : null}
  </View>;
}

/** Two ink eyes and a pink smile, printed where a slip's lines go (Paper
 * "Nothing today · A smiling slip"). */
function Smile() {
  const { theme } = useUnistyles();
  return <Svg width={44} height={28} viewBox="0 0 44 28" fill="none">
    <Circle cx={11} cy={6} r={3.25} fill={theme.ui.color.ink} />
    <Circle cx={33} cy={6} r={3.25} fill={theme.ui.color.ink} />
    <Path d="M9 16C13 25 31 25 35 16" stroke={theme.ui.color["accent-fill"]} strokeWidth={3.5} strokeLinecap="round" />
  </Svg>;
}

const SLIP = { width: 96, height: 64 };

const styles = StyleSheet.create((theme) => ({
  root: { alignItems: "center", gap: theme.ui.space["4"], padding: theme.ui.space["8"] },
  message: { maxWidth: 300 },
  actions: { alignItems: "center", gap: theme.ui.space["3"], paddingTop: theme.ui.space["2"] },
  slips: { width: 120, height: 96 },
  slip: { position: "absolute", ...SLIP, borderRadius: theme.ui.radius.md, borderCurve: "continuous", transformOrigin: "0% 0%" },
  back: { left: 10, top: 12, backgroundColor: theme.ui.color.fill, transform: [{ rotate: "-10deg" }] },
  front: {
    left: 18, top: 22, gap: theme.ui.space["2"], padding: theme.ui.space["4"],
    backgroundColor: theme.ui.color["bg-grouped"], transform: [{ rotate: "5deg" }],
    boxShadow: theme.ui.shadow.card,
  },
  smiling: { alignItems: "center", justifyContent: "center", padding: 0 },
  line: { borderRadius: 3 },
  lineTitle: { width: 44, height: 6, backgroundColor: theme.ui.color["ink-4"] },
  lineLong: { width: 62, height: 5, backgroundColor: theme.ui.color.separator },
  lineShort: { width: 54, height: 5, backgroundColor: theme.ui.color.separator },
}));
