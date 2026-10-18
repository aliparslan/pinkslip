import Svg, { Rect } from "react-native-svg";
import { StyleSheet } from "react-native-unistyles";

/** A stamp's line, and its corner. */
const STAMP_LINE = 1.5;
const STAMP_RADIUS = 6;

/**
 * A stamp's frame, drawn rather than bordered (owner, 2026-10-18, Paper
 * "Stamp ink", A): a turned view's own border is stair-stepped on iOS, a
 * drawn line stays smooth at any angle. It overhangs the stamp by a point,
 * so the line's edge never sits on the layer's.
 */
export function StampFrame({ width, height, color, line = STAMP_LINE, radius = STAMP_RADIUS, dashed = false }: {
  width: number;
  height: number;
  color: string;
  line?: number;
  radius?: number;
  dashed?: boolean;
}) {
  return <Svg width={width + 2} height={height + 2} style={styles.frame} pointerEvents="none">
    <Rect x={1 + line / 2} y={1 + line / 2} width={width - line} height={height - line} rx={radius - line / 2}
      fill="none" stroke={color} strokeWidth={line} strokeDasharray={dashed ? [line * 3, line * 2] : undefined} />
  </Svg>;
}

const styles = StyleSheet.create({
  frame: { position: "absolute", left: -1, top: -1 },
});
