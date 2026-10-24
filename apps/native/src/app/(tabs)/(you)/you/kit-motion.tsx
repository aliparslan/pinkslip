import { Redirect } from "expo-router";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { MotionLab } from "../../../../features/kit/MotionLab";

export default function MotionLabScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <MotionLab />;
}
