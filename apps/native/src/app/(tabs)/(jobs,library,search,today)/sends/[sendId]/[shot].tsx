import { useLocalSearchParams } from "expo-router";
import { ShotScreen } from "../../../../../features/redesign/sends/SentPage";
import { TabBarFollowsTransition } from "../../../../../ui";

/** A send's picture: the filled form, or the thank-you page. */
export default function SendShotRoute() {
  const { sendId, shot } = useLocalSearchParams<{ sendId: string; shot: string }>();
  return <>
    <TabBarFollowsTransition />
    <ShotScreen sendId={sendId} shot={shot === "form" ? "form" : "confirmation"} />
  </>;
}
