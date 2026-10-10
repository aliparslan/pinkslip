import { Stack } from "expo-router";
import { Feedback } from "../../../../features/account/Feedback";

export default function FeedbackScreen() {
  return <>
    <Stack.Screen options={{ title: "Help and feedback" }} />
    <Feedback />
  </>;
}
