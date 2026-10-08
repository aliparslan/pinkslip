import { Tabs } from "expo-router";
import { usePalette } from "../../theme";

/* The web preview, used only to look at screens, has no native tab bar.
   This stands in with the JavaScript one. */
export default function TabLayout() {
  const palette = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accentText,
        tabBarStyle: { backgroundColor: palette.bg, borderTopColor: palette.line },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Jobs" }} />
      <Tabs.Screen name="track" options={{ title: "Track" }} />
    </Tabs>
  );
}
