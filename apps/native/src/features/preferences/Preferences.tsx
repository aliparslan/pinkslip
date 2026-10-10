import { resetProfile, type Profile } from "@pinkslip/core/profile-fields";
import { normalizeSearchProfile } from "@pinkslip/domain/search-profile";
import { useApi, useAutosave, usePreferences, useUpdatePreferences } from "@pinkslip/data";
import { Stack as RouterStack } from "expo-router";
import { ArrowCounterClockwise, WarningCircle } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button, EmptyState, Heading, SaveStatus, Screen, Spinner, Stack, Surface } from "../../kit";
import { ExperienceFields, MetroField, OtherLocations, RoleField, StageField, TitleFields, WorkFields } from "./ProfileFields";

/** Job preferences: roles, stage and experience, then where and how. Every
 * change autosaves; the feed refetches once a save lands. */
export function Preferences() {
  const preferences = usePreferences();
  if (preferences.isPending) return <Screen><Spinner label="Loading preferences" /></Screen>;
  if (preferences.isError) {
    return <Screen><EmptyState icon={WarningCircle} title="Preferences didn't load" actions={<Button pending={preferences.isFetching} onPress={() => void preferences.refetch()}>Try again</Button>} /></Screen>;
  }
  return <PreferencesForm initial={normalizeSearchProfile(preferences.data.search_profile)} />;
}

function PreferencesForm({ initial }: { initial: Profile }) {
  const api = useApi();
  const update = useUpdatePreferences();
  const [profile, setProfile] = useState(initial);
  const [generation, setGeneration] = useState(0);
  const change = (patch: Partial<Profile>) => setProfile((current) => ({ ...current, ...patch }));
  const autosave = useAutosave({
    value: profile,
    ready: true,
    save: async (search_profile) => {
      await update.mutateAsync({ search_profile });
      void api.interactions.event({ event_name: "search_profile_adjusted", entity_type: "search_profile", properties: { source: "settings" } }).catch(() => undefined);
    },
  });

  return <Screen>
    <RouterStack.Screen options={{ headerRight: () => <SaveStatus phase={autosave.phase} onRetry={autosave.retry} /> }} />
    <View key={generation} style={{ gap: 16 }}>
      <Surface><Stack gap="5"><Heading>What</Heading><RoleField profile={profile} onChange={change} /><TitleFields profile={profile} onChange={change} /></Stack></Surface>
      <Surface><Stack gap="5"><Heading>Experience</Heading><StageField profile={profile} onChange={change} /><ExperienceFields profile={profile} onChange={change} /></Stack></Surface>
      <Surface><Stack gap="5"><Heading>Where</Heading><WorkFields profile={profile} onChange={change} /><MetroField profile={profile} onChange={change} /><OtherLocations profile={profile} onChange={change} /></Stack></Surface>
    </View>
    <View><Button icon={ArrowCounterClockwise} onPress={() => { setProfile(resetProfile(profile)); setGeneration((value) => value + 1); }}>Reset to defaults</Button></View>
  </Screen>;
}
