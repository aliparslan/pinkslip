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

/** Past an edge a drag stretches less the further you pull (Apple's rubber
 * band): `distance` past the edge, within a `dimension` that sets the give. */
export function rubberBand(distance: number, dimension: number) {
  "worklet";
  const constant = 0.55;
  return (distance * dimension * constant) / (dimension + constant * Math.abs(distance));
}

/** Where a flick would come to rest, from its speed in points a second
 * (Apple's projection, at the snappier 0.99 rate). */
export function project(velocity: number) {
  "worklet";
  const rate = 0.99;
  return ((velocity / 1000) * rate) / (1 - rate);
}

/** The motion tokens (Paper "Motion and icons · Oct 12"). */
export const motion = ui.motion;
