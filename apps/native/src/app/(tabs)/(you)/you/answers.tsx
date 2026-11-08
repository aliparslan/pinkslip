import { useLocalSearchParams } from "expo-router";
import { SampleAnswersPage } from "../../../../features/kit/you-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { AnswersPage } from "../../../../features/redesign/you/AnswersPage";

/** You → Answers. The kit opens it on sample answers with `?sample=on`. */
export default function AnswersScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  if (redesignKitAvailable && sample === "on") return <SampleAnswersPage />;
  return <AnswersPage />;
}
