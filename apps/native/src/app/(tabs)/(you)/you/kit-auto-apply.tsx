import { Redirect, useLocalSearchParams } from "expo-router";
import { SampleAutoApplyPage } from "../../../../features/redesign/apply-flow/AutoApplyPage";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** Auto-apply settings on a sample (Paper "Auto-apply settings · Oct 29"):
 * Free (S1), `?pro=1` on Apply for me (S2), `?paused=1` (S3). */
export default function AutoApplySampleScreen() {
  const { paused, pro } = useLocalSearchParams<{ paused?: string; pro?: string }>();
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  // Keyed, so opening another sample over this one starts it fresh.
  return <SampleAutoApplyPage key={`${paused ?? ""}-${pro ?? ""}`} paused={Boolean(paused)} pro={Boolean(pro)} />;
}
