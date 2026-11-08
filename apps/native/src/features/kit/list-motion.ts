import { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { spring } from "../../ui/motion";

/**
 * iOS's own list motion, fitted frame by frame to Reminders in the
 * simulator (Nov 8): a row re-sorted to a new place, and one removed with
 * the rows below closing up. Rows start moving within a frame and settle
 * on a spring that never overshoots, response 0.25s: quick, then a long
 * soft landing, with no lurch at the start. A row that leaves stays where
 * it was while the rows next to it slide over it; one that arrives is
 * uncovered as they make room. Nothing rises, staggers or waits. Kit
 * mock-ups only; it becomes a token when Tracker or Jobs takes it.
 */
const ROWS = spring({ response: 0.25, damping: 1 });

/** Every row that changes place, on the one spring. */
export const ROW_MOVE = LinearTransition.springify().mass(ROWS.mass).stiffness(ROWS.stiffness).damping(ROWS.damping);
/** A row arriving, under the rows making room for it. */
export const ROW_ARRIVE = FadeIn.duration(200);
/** A row leaving, under the rows closing over it. */
export const ROW_LEAVE = FadeOut.duration(200);
