import { useLocalSearchParams } from "expo-router";
import { SampleYouScreen } from "../../../../features/kit/you-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { YouScreen } from "../../../../features/redesign/you/YouScreen";

/** You. The kit opens it on sample data with `?sample=on`. */
export default function YouTab() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  if (redesignKitAvailable && sample === "on") return <SampleYouScreen />;
  return <YouScreen />;
}
