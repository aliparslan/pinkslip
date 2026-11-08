import { Redirect, Stack } from "expo-router";
import { KitGallery } from "../../../../features/kit/KitGallery";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

export default function KitScreen() {
  // Like every other kit page: a link to it on a tester's phone goes to You.
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <>
    <Stack.Screen options={{ title: "Kit" }} />
    <KitGallery />
  </>;
}
