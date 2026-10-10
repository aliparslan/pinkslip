import { profileSummary } from "@pinkslip/core/profile-fields";
import { normalizeSearchProfile } from "@pinkslip/domain/search-profile";
import { usePreferences, usePushSettings, useResumeProfile, useSession } from "@pinkslip/data";
import { router, type Href } from "expo-router";
import {
  Bell, Buildings, ChatCircleDots, ClipboardText, FileText, SlidersHorizontal, Sparkle, UserCircle, Wrench,
} from "phosphor-react-native";
import { Linking } from "react-native";
import { ListRow, ListSection, Screen, SegmentedControl, Stack, Text } from "../../kit";
import { WEB_URL } from "../../platform/session";
import { setAppearancePreference, useAppearancePreference, type AppearancePreference } from "../../theme/appearance";
import { useDevicePush } from "../alerts/Alerts";

/** `Profile.svelte`'s overview: grouped rows, each with a one-line summary of
 * where that setting stands, plus Appearance. Admin opens the web workspace
 * (D9). Support and Privacy stay off for now (owner). */
export function You() {
  const session = useSession();
  const me = session.data?.me;
  const preferences = usePreferences();
  const push = usePushSettings();
  const resume = useResumeProfile();
  const { status: device } = useDevicePush();
  const appearance = useAppearancePreference();
  const signedIn = session.data?.state === "authenticated";
  const resumeData = resume.data?.data;
  const resumeReady = Boolean(resumeData?.contact.name || resumeData?.experience.length || resumeData?.education.length || resumeData?.projects.length);
  const alerts = push.data === undefined || device === null ? undefined
    : push.data.enabled ? (device === "enabled" ? "On" : device === "denied" ? "On · blocked in Settings" : "On · turn on for this iPhone") : "Off";
  const go = (href: Href) => () => router.push(href);

  return <Screen>
    {me?.is_admin && <ListSection label="Admin">
      <ListRow title="Admin workspace" detail="Opens on the web" icon={Wrench} onPress={() => void Linking.openURL(`${WEB_URL}/admin`)} />
    </ListSection>}
    <ListSection label="Search">
      <ListRow title="Job preferences" icon={SlidersHorizontal} onPress={go("/you/preferences")}
        detail={preferences.data ? profileSummary(normalizeSearchProfile(preferences.data.search_profile)) : undefined} />
      <ListRow title="Job alerts" icon={Bell} detail={alerts} onPress={go("/you/alerts")} />
      <ListRow title="Companies" icon={Buildings} detail="Hidden companies and requests" onPress={go("/you/companies")} />
    </ListSection>
    <ListSection label="Materials">
      <ListRow title="Resume" icon={FileText} detail={resume.data ? (resumeReady ? "Ready" : "Add your resume") : undefined} onPress={go("/you/resume")} />
      <ListRow title="Tailoring" icon={Sparkle} detail="Coming soon" onPress={go("/you/tailoring")} />
      {me?.features?.auto_apply_enabled && <ListRow title="Application answers" icon={ClipboardText} detail="Reused on every application" onPress={go("/you/answers")} />}
    </ListSection>
    <Stack gap="2">
      <Text size="xs" weight="semibold" tone="ink-4">Appearance</Text>
      <SegmentedControl<AppearancePreference> value={appearance} onValueChange={setAppearancePreference}
        segments={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
    </Stack>
    <ListSection label="Pinkslip">
      <ListRow title="Help and feedback" icon={ChatCircleDots} detail="Ideas and problems" onPress={go("/you/feedback")} />
      <ListRow title="Account" icon={UserCircle} detail={signedIn ? (me?.account?.email ?? "Signed in") : "Guest · sign in to sync"} onPress={go("/you/account")} />
    </ListSection>
    {__DEV__ && <ListSection label="Development"><ListRow title="Kit" icon={Wrench} onPress={go("/you/kit")} /></ListSection>}
  </Screen>;
}
