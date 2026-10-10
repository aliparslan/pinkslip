import { Stack } from "expo-router";
import { KitGallery } from "../../../../features/kit/KitGallery";

export default function KitScreen() {
  return <>
    <Stack.Screen options={{ title: "Kit" }} />
    <KitGallery />
  </>;
}
