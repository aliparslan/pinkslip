import { Redirect, Stack } from "expo-router";
import { SwipeGallery } from "../../../../features/kit/SwipeGallery";

export default function SwipeGalleryScreen() {
  if (!__DEV__) return <Redirect href="/you" />;
  return <><Stack.Screen options={{ title: "Swipes" }} /><SwipeGallery /></>;
}
