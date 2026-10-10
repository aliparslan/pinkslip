import { Stack } from "expo-router";
import { Tailoring } from "../../../../features/tailoring/Tailoring";

export default function TailoringScreen() {
  return <>
    <Stack.Screen options={{ title: "Tailoring" }} />
    <Tailoring />
  </>;
}
