import { Stack, useLocalSearchParams } from "expo-router";
import { Account } from "../../../../features/account/Account";
import { SampleAccountPage } from "../../../../features/kit/you-sample";
import { redesignKitAvailable, useRedesign } from "../../../../features/redesign/flag";
import { AccountPage } from "../../../../features/redesign/you/AccountPage";

/** You → Account. The redesign kit opens it signed in as a sample with `?sample=on`. */
export default function AccountScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  const redesign = useRedesign();
  if (redesign && redesignKitAvailable && sample === "on") return <SampleAccountPage />;
  if (redesign) return <AccountPage />;
  return <>
    <Stack.Screen options={{ title: "Account" }} />
    <Account />
  </>;
}
