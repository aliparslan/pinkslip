import { Redirect } from "expo-router";
import { useMemo } from "react";
import { todaySample } from "../../../../features/kit/today-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { TodayScreen } from "../../../../features/redesign/TodayScreen";

export default function TodaySampleScreen() {
  const sample = useMemo(() => todaySample(), []);
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <TodayScreen sample={sample} />;
}
