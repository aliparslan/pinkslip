import { Redirect } from "expo-router";
import { useMemo } from "react";
import { trackerSample } from "../../../../features/kit/tracker-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { TrackerScreen } from "../../../../features/redesign/TrackerScreen";

export default function TrackerSampleScreen() {
  const sample = useMemo(() => trackerSample(), []);
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <TrackerScreen sample={sample} />;
}
