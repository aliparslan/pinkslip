import { Redirect, Stack } from "expo-router";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { IconSets } from "../../../../features/kit/IconSets";

export default function IconSetsScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <><Stack.Screen options={{ title: "Icon sets" }} /><IconSets /></>;
}
