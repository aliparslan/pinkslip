import { useState } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { normalizeSearchProfile } from "@pinkslip/domain/search-profile";
import { useApi, usePreferences, useUpdatePreferences } from "@pinkslip/data";
import { Button, Heading, SaveStatus, Stack, Surface } from "../../kit";
import { useAutosave } from "../settings/useAutosave";
import { PageFailure, PageLoading } from "../states/LoadStates";
import {
  ExperienceFields, MetroField, OtherLocations, RoleField, StageField, TitleFields, WorkFields,
} from "./ProfileFields";
import { resetProfile, type Profile } from "./profile";
import settings from "../settings/Settings.module.css";
import styles from "./Preferences.module.css";

/** Job preferences (`JobsSection` + `SearchProfileFields`): roles, career
 * stage and experience, then where and how. Every change autosaves; the feed
 * refetches once a save lands. */
export function Preferences() {
  const preferences = usePreferences();
  if (preferences.isPending) return <PageLoading label="Loading preferences" />;
  if (preferences.isError) {
    return <PageFailure title="Preferences didn't load" onRetry={() => void preferences.refetch()} retrying={preferences.isFetching} />;
  }
  return <PreferencesForm initial={normalizeSearchProfile(preferences.data.search_profile)} />;
}

function PreferencesForm({ initial }: { initial: Profile }) {
  const api = useApi();
  const update = useUpdatePreferences();
  const [profile, setProfile] = useState(initial);
  // Resetting remounts the fields so their local text (years, lists) follows.
  const [generation, setGeneration] = useState(0);
  const change = (patch: Partial<Profile>) => setProfile((current) => ({ ...current, ...patch }));
  const autosave = useAutosave({
    value: profile,
    ready: true,
    save: async (search_profile) => {
      await update.mutateAsync({ search_profile });
      void api.interactions.event({ event_name: "search_profile_adjusted", entity_type: "search_profile", properties: { source: "settings" } })
        .catch(() => undefined);
    },
  });

  return <Stack gap="6">
    <div className={settings.titleRow}>
      <Heading level={1} variant="screen">Job preferences</Heading>
      <SaveStatus phase={autosave.phase} onRetry={autosave.retry} />
    </div>
    <div key={generation} className={styles.sections}>
      <Surface variant="card">
        <Stack gap="5">
          <Heading level={2} variant="section">What</Heading>
          <RoleField profile={profile} onChange={change} />
          <TitleFields profile={profile} onChange={change} />
        </Stack>
      </Surface>
      <Surface variant="card">
        <Stack gap="5">
          <Heading level={2} variant="section">Experience</Heading>
          <StageField profile={profile} onChange={change} />
          <ExperienceFields profile={profile} onChange={change} />
        </Stack>
      </Surface>
      <Surface variant="card">
        <Stack gap="5">
          <Heading level={2} variant="section">Where</Heading>
          <WorkFields profile={profile} onChange={change} />
          <MetroField profile={profile} onChange={change} />
          <OtherLocations profile={profile} onChange={change} />
        </Stack>
      </Surface>
    </div>
    <div>
      <Button variant="secondary" icon={ArrowCounterClockwise} onClick={() => {
        setProfile(resetProfile(profile));
        setGeneration((value) => value + 1);
      }}>Reset to defaults</Button>
    </div>
  </Stack>;
}
