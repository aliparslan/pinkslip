import { Stack } from "expo-router";
import { You } from "../../../../features/you/You";

export default function YouScreen() {
  return <>
    <Stack.Screen options={{ title: "You", headerLargeTitle: true }} />
    <You />
  </>;
}
