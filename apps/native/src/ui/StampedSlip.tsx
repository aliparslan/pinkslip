import type { ReactNode } from "react";
import { Text as RNText, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { faces } from "./fonts";
import { Grain } from "./Grain";

export interface StampedSlipProps {
  /** The stamp's two lines: "CLOSED" over "OCT 12". */
  stamp: string;
  detail: string;
  /** What's printed on the slip. Without it, the slip is blank: three grey
   * lines, as for a broken link, Pinkslip being down or a version too old. */
  children?: ReactNode;
  /** A second slip tilted behind it (down, too old). */
  stacked?: boolean;
}

/**
 * The rare errors' slip (owner, 2026-10-15, Paper "Errors · Oct 15", System
 * "Part · Errors"): a slip of `paper`, radius 16, 16 padding, tilted a few
 * degrees, with a rubber stamp over it: Founders Grotesk Mono 18/22 over
 * 12/16, a 2pt ink border, radius 8, at 88%. Common errors stay plain.
 */
export function StampedSlip({ stamp, detail, children, stacked = false }: StampedSlipProps) {
  return <View style={styles.stage} accessible accessibilityLabel={`${stamp.toLowerCase()}, ${detail.toLowerCase()}`}>
    {stacked ? <View style={[styles.slip, styles.behind]} /> : null}
    <View style={[styles.slip, styles.front]}>
      <Grain radius={16} />
      {children ?? <View style={styles.lines}>
        <View style={[styles.line, styles.lineTitle]} />
        <View style={[styles.line, styles.lineLong]} />
        <View style={[styles.line, styles.lineShort]} />
      </View>}
    </View>
    <View style={styles.stamp}>
      <RNText style={styles.stampLabel} maxFontSizeMultiplier={1.2}>{stamp}</RNText>
      <RNText style={styles.stampDetail} maxFontSizeMultiplier={1.2}>{detail}</RNText>
    </View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  stage: { width: 326, maxWidth: "100%", height: 200, alignItems: "center", justifyContent: "center" },
  slip: {
    width: 220,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color.paper,
    boxShadow: theme.ui.shadow.card,
  },
  behind: { position: "absolute", left: 58, top: 40, height: 118, transformOrigin: "0% 0%", transform: [{ rotate: "7deg" }] },
  front: { padding: 16, overflow: "hidden", transform: [{ rotate: "-4deg" }] },
  lines: { gap: 10, paddingVertical: 6 },
  line: { borderRadius: 4 },
  lineTitle: { width: 96, height: 8, backgroundColor: theme.ui.color["ink-4"] },
  lineLong: { width: 188, height: 7, backgroundColor: theme.ui.color.separator },
  lineShort: { width: 160, height: 7, backgroundColor: theme.ui.color.separator },
  stamp: {
    position: "absolute",
    right: 62,
    top: 84,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderRadius: 8,
    borderColor: theme.ui.color.ink,
    opacity: 0.88,
    transformOrigin: "0% 0%",
    transform: [{ rotate: "-10deg" }],
  },
  stampLabel: { fontFamily: faces.stamp, fontSize: 18, lineHeight: 22, letterSpacing: 1.08, color: theme.ui.color.ink },
  stampDetail: { fontFamily: faces.stampDetail, fontSize: 12, lineHeight: 16, letterSpacing: 0.72, color: theme.ui.color.ink },
}));
