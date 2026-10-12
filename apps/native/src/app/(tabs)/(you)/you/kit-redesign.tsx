import { Redirect, Stack } from "expo-router";
import { RedesignGallery } from "../../../../features/kit/RedesignGallery";

export default function RedesignGalleryScreen() {
  if (!__DEV__) return <Redirect href="/you" />;
  return <><Stack.Screen options={{ title: "Redesign kit" }} /><RedesignGallery /></>;
}
