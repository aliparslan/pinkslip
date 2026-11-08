import { useLocalSearchParams } from "expo-router";
import { SampleAccountPage } from "../../../../features/kit/you-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { AccountPage } from "../../../../features/redesign/you/AccountPage";

/** You → Account. The kit opens it signed in as a sample with `?sample=on`. */
export default function AccountScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  if (redesignKitAvailable && sample === "on") return <SampleAccountPage />;
  return <AccountPage />;
}
