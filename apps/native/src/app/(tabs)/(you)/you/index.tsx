import { Stack, useLocalSearchParams } from "expo-router";
import { SampleYouScreen } from "../../../../features/kit/you-sample";
import { redesignKitAvailable, useRedesign } from "../../../../features/redesign/flag";
import { YouScreen } from "../../../../features/redesign/you/YouScreen";
import { You } from "../../../../features/you/You";

/** You. The redesign kit opens it on sample data with `?sample=on`. */
export default function YouTab() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  const redesign = useRedesign();
  if (redesign && redesignKitAvailable && sample === "on") return <SampleYouScreen />;
  if (redesign) return <YouScreen />;
  return <>
    <Stack.Screen options={{ title: "You", headerLargeTitle: true }} />
    <You />
  </>;
}
