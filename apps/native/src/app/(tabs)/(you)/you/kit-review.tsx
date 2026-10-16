import { Redirect, useLocalSearchParams } from "expo-router";
import { ASK_SAMPLE, ReviewPage } from "../../../../features/redesign/apply-flow/AskFirst";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** Ask first's review on a sample (3.2), or on Free with 3 left (M1). */
export default function ReviewSampleScreen() {
  const { free } = useLocalSearchParams<{ free?: string }>();
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <ReviewPage jobs={ASK_SAMPLE} free={free ? { left: 3, resets: "Monday" } : undefined} />;
}
