import { ui } from "@pinkslip/tokens/native";
import { Easing } from "react-native-reanimated";

type Curve = readonly [number, number, number, number];

/** A token's duration and Bézier curve, as Reanimated's timing config. */
export function timing({ duration, curve }: { duration: number; curve: Curve }) {
  return { duration, easing: Easing.bezier(curve[0], curve[1], curve[2], curve[3]) };
}

/**
 * A token's spring, given as Apple's response (seconds) and damping
 * (1 never overshoots), as Reanimated's physics: unit mass, stiffness from
 * the response, friction from the damping.
 */
export function spring({ response, damping }: { response: number; damping: number }) {
  const omega = (2 * Math.PI) / response;
  return { mass: 1, stiffness: omega * omega, damping: 2 * damping * omega };
}

/** The motion tokens (Paper "Motion and icons · Oct 12"). */
export const motion = ui.motion;
