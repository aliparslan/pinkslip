import { Redirect, Stack } from "expo-router";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { RedesignGallery } from "../../../../features/kit/RedesignGallery";

export default function RedesignGalleryScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <><Stack.Screen options={{ title: "Redesign kit" }} /><RedesignGallery /></>;
}
