import { Redirect } from "expo-router";
import { TrackerMoveSample } from "../../../../features/kit/TrackerMoveSample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** Paper "Tracker moves, first load, link card · Nov 8", board 1, on samples. */
export default function TrackerMovesScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <TrackerMoveSample />;
}
