import { Stack } from "expo-router";
import { Tailoring } from "../../../../features/tailoring/Tailoring";
import { useRedesign } from "../../../../features/redesign/flag";
import { TailoringPage } from "../../../../features/redesign/you/TailoringPage";

export default function TailoringScreen() {
  if (useRedesign()) return <TailoringPage />;
  return <>
    <Stack.Screen options={{ title: "Tailoring" }} />
    <Tailoring />
  </>;
}
