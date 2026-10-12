import { Redirect, Stack } from "expo-router";
import { IconSets } from "../../../../features/kit/IconSets";

export default function IconSetsScreen() {
  if (!__DEV__) return <Redirect href="/you" />;
  return <><Stack.Screen options={{ title: "Icon sets" }} /><IconSets /></>;
}
