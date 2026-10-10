import { Stack } from "expo-router";
import { Account } from "../../../../features/account/Account";

export default function AccountScreen() {
  return <>
    <Stack.Screen options={{ title: "Account" }} />
    <Account />
  </>;
}
