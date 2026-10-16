import { Stack } from "expo-router";
import { Tailoring } from "../../../../features/tailoring/Tailoring";

export default function TailorScreen() {
  return <>
    <Stack.Screen options={{ title: "Tailor resume" }} />
    <Tailoring />
  </>;
}
