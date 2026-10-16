import { Redirect, useLocalSearchParams } from "expo-router";
import { SampleAutoApplyPage } from "../../../../features/redesign/apply-flow/AutoApplyPage";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** Auto-apply settings on a sample (O12), or paused (A2). */
export default function AutoApplySampleScreen() {
  const { paused } = useLocalSearchParams<{ paused?: string }>();
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <SampleAutoApplyPage paused={Boolean(paused)} free />;
}
