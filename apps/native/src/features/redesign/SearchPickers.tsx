import { NO_ROLE_PREFERENCE, roleChips, rolesFromChips, visibleRoles } from "@pinkslip/core/profile-fields";
import { locationLabels } from "@pinkslip/core/feed-criteria";
import { CAREER_STAGE_OPTIONS, LOCATION_OPTIONS, MAX_YEARS_EXPERIENCE, type CareerStage, type LocationId } from "@pinkslip/domain/search-profile";
import { Stack } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ListGroup, ListItem } from "../../ui";
import { changeDraft, stageName, useDraft } from "./search-draft";

function Picker({ title, children }: { title: string; children: ReactNode }) {
  return <>
    <Stack.Screen options={{ title }} />
    <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>{children}</ScrollView>
  </>;
}

/** Toggles one value in a list, never leaving it empty. */
function toggled<T>(list: readonly T[], value: T): T[] | null {
  const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  return next.length > 0 ? next : null;
}

const stageDetail: Record<CareerStage, string> = {
  internship: "Internships, co-ops and apprenticeships",
  new_grad: "Graduate and entry-level roles",
  early_career: "Asking for 1 to 3 years",
  mid_career: "Asking for 3 to 5 years",
};

export function StagePicker() {
  const draft = useDraft();
  if (!draft) return null;
  return <Picker title="Career stage">
    <ListGroup footer="Choose every stage you'd take.">
      {CAREER_STAGE_OPTIONS.map((option) => <ListItem key={option.id} title={stageName(option.id)} detail={stageDetail[option.id]}
        accessory="check" selected={draft.target_levels.includes(option.id)}
        onPress={() => { const next = toggled(draft.target_levels, option.id); if (next) changeDraft({ target_levels: next }); }} />)}
    </ListGroup>
  </Picker>;
}

export function RolesPicker() {
  const draft = useDraft();
  if (!draft) return null;
  const chips = roleChips(draft);
  const pick = (id: string) => {
    const next = id === NO_ROLE_PREFERENCE ? [NO_ROLE_PREFERENCE] : toggled(chips.filter((chip) => chip !== NO_ROLE_PREFERENCE), id) ?? [NO_ROLE_PREFERENCE];
    const patch = rolesFromChips(draft, next);
    if (patch) changeDraft(patch);
  };
  return <Picker title="Roles">
    <ListGroup>
      <ListItem title="Any role" accessory="check" selected={chips.includes(NO_ROLE_PREFERENCE)} onPress={() => pick(NO_ROLE_PREFERENCE)} />
    </ListGroup>
    <ListGroup>
      {visibleRoles.map((option) => <ListItem key={option.id} title={option.label} accessory="check" selected={chips.includes(option.id)}
        onPress={() => pick(option.id)} />)}
    </ListGroup>
  </Picker>;
}

export function ExperiencePicker() {
  const draft = useDraft();
  if (!draft) return null;
  const choices: { value: number | null; label: string }[] = [
    { value: null, label: "Up to my experience" },
    ...Array.from({ length: MAX_YEARS_EXPERIENCE + 1 }, (_, years) => ({
      value: years, label: years === 0 ? "No experience" : `Up to ${years} ${years === 1 ? "year" : "years"}`,
    })),
  ];
  return <Picker title="Experience asked for">
    <ListGroup footer="Jobs asking for more than this are left out.">
      {choices.map((choice) => <ListItem key={String(choice.value)} title={choice.label} accessory="check"
        selected={draft.max_required_years === choice.value} onPress={() => changeDraft({ max_required_years: choice.value })} />)}
    </ListGroup>
    <ListGroup>
      <ListItem title="Include jobs that don't say" accessory="switch" selected={draft.include_unspecified_experience}
        onToggle={(include_unspecified_experience) => changeDraft({ include_unspecified_experience })} />
    </ListGroup>
  </Picker>;
}

export function CitiesPicker() {
  const draft = useDraft();
  if (!draft) return null;
  const anywhere = draft.relocation_willing || draft.location_ids.length === 0;
  const pick = (id: LocationId) => {
    const next = anywhere ? [id] : toggled(draft.location_ids, id);
    changeDraft({ location_ids: next ?? [], relocation_willing: false });
  };
  return <Picker title="Cities">
    <ListGroup>
      <ListItem title="Anywhere in the US" accessory="check" selected={anywhere} onPress={() => changeDraft({ location_ids: [], relocation_willing: false })} />
    </ListGroup>
    <ListGroup>
      {LOCATION_OPTIONS.map((option) => <ListItem key={option.id} title={locationLabels[option.id]} accessory="check"
        selected={!anywhere && draft.location_ids.includes(option.id)} onPress={() => pick(option.id)} />)}
    </ListGroup>
  </Picker>;
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.ui.color["screen-grouped"] },
  content: { gap: theme.ui.space["6"], paddingTop: theme.ui.space["2"], paddingBottom: theme.ui.space["10"] },
}));
