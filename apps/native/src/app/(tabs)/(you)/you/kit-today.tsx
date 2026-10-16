import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { todaySample } from "../../../../features/kit/today-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { TodayScreen } from "../../../../features/redesign/TodayScreen";

/** Today on a sample; `flow` adds Ask first's card or the live bar. */
export default function TodaySampleScreen() {
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const sample = useMemo(() => ({ ...todaySample(), flow: flow === "ask" ? "ask" as const : flow === "sending" ? "sending" as const : undefined }), [flow]);
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <TodayScreen sample={sample} />;
}
