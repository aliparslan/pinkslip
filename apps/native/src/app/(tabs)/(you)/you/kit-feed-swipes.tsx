import { Redirect } from "expo-router";
import { SwipeFeedLab } from "../../../../features/kit/SwipeFeedLab";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** The feed's rows on sample jobs, to swipe all the way through. */
export default function SwipeFeedLabScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <SwipeFeedLab />;
}
