import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { READY_SAMPLE, SENT_SAMPLE } from "../../../../features/kit/send-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { SentView } from "../../../../features/redesign/sends/SentPage";
import { toast } from "../../../../ui";

/** What Pinkslip sent (W3), or Check first's Ready to send, on a sample. */
export default function SentSampleScreen() {
  const { ready } = useLocalSearchParams<{ ready?: string }>();
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <SentView send={ready ? READY_SAMPLE : SENT_SAMPLE}
      onSend={ready ? () => toast.show({ message: "A sample: nothing was sent", icon: "autoApply" }) : undefined} />
  </>;
}
