import { useLocalSearchParams } from "expo-router";
import { SamplePlanPage } from "../../../../features/kit/you-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { PlanComing } from "../../../../features/redesign/you/PlanPage";

/** You → Plan. Pro isn't on sale yet; the redesign kit opens the drawn page
 * on sample data with `?sample=free|pro`. */
export default function PlanScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  if (redesignKitAvailable && (sample === "free" || sample === "pro")) return <SamplePlanPage key={sample} state={sample} />;
  return <PlanComing />;
}
