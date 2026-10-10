import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useUnistyles } from "react-native-unistyles";

/** The system tab bar: Jobs, Library, You, each with its own stack. */
export default function TabsLayout() {
  const { theme } = useUnistyles();
  return <NativeTabs tintColor={theme.colors.accent}>
    <NativeTabs.Trigger name="(jobs)">
      <NativeTabs.Trigger.Icon sf={{ default: "briefcase", selected: "briefcase.fill" }} />
      <NativeTabs.Trigger.Label>Jobs</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="(library)">
      <NativeTabs.Trigger.Icon sf={{ default: "bookmark", selected: "bookmark.fill" }} />
      <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="(you)">
      <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
      <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
