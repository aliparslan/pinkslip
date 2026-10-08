import { NativeTabs } from "expo-router/unstable-native-tabs";
import { usePalette } from "../../theme";

/* Two tabs for now. You (profile, alerts, settings) comes back in a later
   build; its routes stay out of the app until then. */
export default function TabLayout() {
  const palette = usePalette();
  return (
    <NativeTabs tintColor={palette.accentText}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Jobs</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "briefcase", selected: "briefcase.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="track">
        <NativeTabs.Trigger.Label>Track</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
