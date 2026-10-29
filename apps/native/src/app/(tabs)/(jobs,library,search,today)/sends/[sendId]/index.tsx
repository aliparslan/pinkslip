import { useLocalSearchParams } from "expo-router";
import { SendScreen } from "../../../../../features/redesign/sends/SentPage";
import { useSendForReal } from "../../../../../features/redesign/sends/useSendFlow";
import { TabBarFollowsTransition } from "../../../../../ui";

/** What Pinkslip sent, or after Check first what it would send (Paper
 * "Send screens · Oct 24", S5 and S6). */
export default function SendRoute() {
  const { sendId } = useLocalSearchParams<{ sendId: string }>();
  const forReal = useSendForReal();
  return <>
    <TabBarFollowsTransition />
    <SendScreen sendId={sendId} onSend={forReal.send} sending={forReal.sending} />
  </>;
}
