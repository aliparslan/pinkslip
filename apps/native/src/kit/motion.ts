import { duration, ease } from "@pinkslip/tokens/native";
import { Easing } from "react-native-reanimated";

/** The tokens' motion values for Reanimated. Presses and things that enter
 * use the strong ease-out; anything a finger let go of settles on a spring
 * that starts from the finger's speed. */
export const easeOut = Easing.bezier(...ease.out);

export const durations = duration;

/** A drag released short of its target: settles home without overshooting,
 * so the other side's action never peeks out. Pass the release velocity. */
export const settleSpring = { duration: 380, dampingRatio: 1, overshootClamping: true } as const;

/** Resistance past an edge: the further the drag, the less it follows. */
export function resist(distance: number, dimension: number, constant = 0.08) {
  "worklet";
  return (distance * dimension * constant) / (dimension + constant * Math.abs(distance));
}
