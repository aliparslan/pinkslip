import { Stack } from "expo-router";
import { Feedback } from "../../../../features/account/Feedback";
import { useRedesign } from "../../../../features/redesign/flag";
import { HelpPage } from "../../../../features/redesign/you/HelpPage";

export default function FeedbackScreen() {
  if (useRedesign()) return <HelpPage />;
  return <>
    <Stack.Screen options={{ title: "Help and feedback" }} />
    <Feedback />
  </>;
}
