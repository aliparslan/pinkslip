import { Redirect } from "expo-router";
import { NewJobsSample } from "../../../../features/kit/NewJobsSample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** Paper "Tracker moves, first load, link card · Nov 8", board 2, on samples. */
export default function NewJobsScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <NewJobsSample />;
}
