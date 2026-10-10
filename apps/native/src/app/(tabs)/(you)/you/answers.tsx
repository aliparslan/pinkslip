import { Stack } from "expo-router";
import { Answers } from "../../../../features/answers/Answers";

export default function AnswersScreen() {
  return <>
    <Stack.Screen options={{ title: "Application answers" }} />
    <Answers />
  </>;
}
