import { Stack, useLocalSearchParams } from "expo-router";
import { Answers } from "../../../../features/answers/Answers";
import { SampleAnswersPage } from "../../../../features/kit/you-sample";
import { redesignKitAvailable, useRedesign } from "../../../../features/redesign/flag";
import { AnswersPage } from "../../../../features/redesign/you/AnswersPage";

export default function AnswersScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  if (useRedesign()) return sample === "on" && redesignKitAvailable ? <SampleAnswersPage /> : <AnswersPage />;
  return <>
    <Stack.Screen options={{ title: "Application answers" }} />
    <Answers />
  </>;
}
