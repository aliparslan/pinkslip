import { NO_ROLE_PREFERENCE, roleChips, rolesFromChips, visibleRoles, type Profile } from "@pinkslip/core/profile-fields";
import { locationLabels } from "@pinkslip/core/feed-criteria";
import { useApi, useCompanies, usePreferences, usePushSettings, useUpdatePreferences } from "@pinkslip/data";
import { normalizeSearchProfile } from "@pinkslip/domain/search-profile";
import { CAREER_STAGE_OPTIONS, LOCATION_OPTIONS, MAX_YEARS_EXPERIENCE, type CareerStage, type LocationId } from "@pinkslip/domain/search-profile";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { toast } from "../../kit";
import { haptics } from "../../platform/haptics";
import { Button, Choice, ChoiceLink, Choices, ChoiceSwitch, SheetHeader, SheetModal, SheetScroll, SheetStep, useSheet } from "../../ui";
import {
  experienceSummary, needsSponsorship, rolesSummary, stageName, stageSummary, toggled, wantsRemote, whereSummary, withRemote,
} from "./search-draft";

type Step = "search" | "stage" | "roles" | "where" | "visa" | "experience";

const stageDetail: Record<CareerStage, string> = {
  internship: "Summer, fall and co-op roles",
  new_grad: "Graduating this year or last",
  early_career: "1 to 3 years in",
  mid_career: "3 to 5 years in",
};

/**
 * Your search (Paper "Filters · Your search as a plain menu"), the one saved
 * search behind the feed and alerts: tap a row and the sheet steps into that
 * choice, then Done steps back. Save writes the search; closing drops the
 * changes. It opens over Jobs, which stays in view behind it.
 */
export function EditSearchSheet({ open, onClosed }: { open: boolean; onClosed: () => void }) {
  return <SheetModal open={open} onClosed={onClosed}><YourSearch /></SheetModal>;
}

function YourSearch() {
  const { theme } = useUnistyles();
  const sheet = useSheet();
  const api = useApi();
  const preferences = usePreferences();
  const update = useUpdatePreferences();
  const saved = preferences.data?.search_profile;
  const [draft, setDraft] = useState<Profile | null>(null);
  const [step, setStep] = useState<Step>("search");

  useEffect(() => {
    if (saved && !draft) setDraft(normalizeSearchProfile(saved));
  }, [saved, draft]);

  if (!draft) {
    return <SheetStep id="loading">
      <SheetHeader title="Your search" />
      <View style={styles.loading}>
        {preferences.isError
          ? <Button size="small" onPress={() => void preferences.refetch()}>Try again</Button>
          : <ActivityIndicator color={theme.ui.color["ink-3"]} />}
      </View>
    </SheetStep>;
  }

  const change = (patch: Partial<Profile>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const changed = Boolean(saved && JSON.stringify(draft) !== JSON.stringify(normalizeSearchProfile(saved)));
  const back = () => setStep("search");
  const save = async () => {
    try {
      await update.mutateAsync({ search_profile: draft });
      haptics.success();
      void api.interactions.event({ event_name: "search_profile_adjusted", entity_type: "search_profile", properties: { source: "edit_search" } }).catch(() => undefined);
      sheet.close();
    } catch {
      toast.error("Couldn't save your search. Try again.");
    }
  };

  if (step === "search") {
    return <SheetStep id="search">
      <SheetHeader title="Your search" />
      <SearchMenu draft={draft} open={setStep} />
      <Button variant="primary" fullWidth disabled={!changed} pending={update.isPending} onPress={() => void save()}>Save search</Button>
    </SheetStep>;
  }

  const done = <Button fullWidth onPress={back}>Done</Button>;
  const choices = (title: string, body: React.ReactNode) => <SheetStep id={step}>
    <SheetHeader title={title} onBack={back} />
    <SheetScroll style={styles.scroll} contentContainerStyle={styles.scrollBody}>{body}</SheetScroll>
    {done}
  </SheetStep>;

  if (step === "stage") {
    return choices("Career stage", <Choices>
      {CAREER_STAGE_OPTIONS.map((option) => <Choice key={option.id} multiple title={stageName(option.id)} detail={stageDetail[option.id]}
        selected={draft.target_levels.includes(option.id)}
        onPress={() => { const next = toggled(draft.target_levels, option.id); if (next) change({ target_levels: next }); }} />)}
    </Choices>);
  }

  if (step === "roles") {
    const chips = roleChips(draft);
    const pick = (id: string) => {
      const next = id === NO_ROLE_PREFERENCE ? [NO_ROLE_PREFERENCE] : toggled(chips.filter((chip) => chip !== NO_ROLE_PREFERENCE), id) ?? [NO_ROLE_PREFERENCE];
      const patch = rolesFromChips(draft, next);
      if (patch) change(patch);
    };
    return choices("Roles", <>
      <Choices><Choice title="Any role" selected={chips.includes(NO_ROLE_PREFERENCE)} onPress={() => pick(NO_ROLE_PREFERENCE)} /></Choices>
      <Choices>
        {visibleRoles.map((option) => <Choice key={option.id} multiple title={option.label} selected={chips.includes(option.id)} onPress={() => pick(option.id)} />)}
      </Choices>
    </>);
  }

  if (step === "where") {
    const anywhere = draft.relocation_willing || draft.location_ids.length === 0;
    const pick = (id: LocationId) => {
      const next = anywhere ? [id] : toggled(draft.location_ids, id);
      change({ location_ids: next ?? [], relocation_willing: false });
    };
    return choices("Where", <>
      <Choices><ChoiceSwitch title="Remote in the US" value={wantsRemote(draft)} onChange={(on) => change(withRemote(draft, on))} /></Choices>
      <Choices>
        <Choice title="Anywhere in the US" selected={anywhere} onPress={() => change({ location_ids: [], relocation_willing: false })} />
        {LOCATION_OPTIONS.map((option) => <Choice key={option.id} multiple title={locationLabels[option.id]}
          selected={!anywhere && draft.location_ids.includes(option.id)} onPress={() => pick(option.id)} />)}
      </Choices>
    </>);
  }

  if (step === "visa") {
    return choices("Visa sponsorship", <Choices>
      <Choice title="Not needed" detail="I can work in the US without it" selected={!needsSponsorship(draft)}
        onPress={() => change({ work_authorization: "authorized" })} />
      <Choice title="I'll need sponsorship" detail="Only jobs that sponsor visas" selected={needsSponsorship(draft)}
        onPress={() => change({ work_authorization: "sponsorship" })} />
    </Choices>);
  }

  // The last step: experience asked.
  const options: { value: number | null; label: string }[] = [
    { value: null, label: "Up to my experience" },
    ...Array.from({ length: MAX_YEARS_EXPERIENCE + 1 }, (_, years) => ({
      value: years, label: years === 0 ? "No experience" : `Up to ${years} ${years === 1 ? "year" : "years"}`,
    })),
  ];
  return choices("Experience asked", <>
    <Choices>
      {options.map((option) => <Choice key={String(option.value)} title={option.label} selected={draft.max_required_years === option.value}
        onPress={() => change({ max_required_years: option.value })} />)}
    </Choices>
    <Choices><ChoiceSwitch title="Include jobs that don't say" value={draft.include_unspecified_experience}
      onChange={(include_unspecified_experience) => change({ include_unspecified_experience })} /></Choices>
  </>);
}

/** Stage and pay, roles, where, visa and experience; then alerts and hidden
 * companies, which close the sheet and open their screens under You. */
function SearchMenu({ draft, open }: { draft: Profile; open: (step: Step) => void }) {
  const sheet = useSheet();
  const push = usePushSettings();
  const companies = useCompanies();
  const hidden = companies.data?.filter((company) => company.blocked).length;
  const leaveTo = (href: Href) => {
    sheet.close();
    setTimeout(() => router.push(href), 320);
  };
  return <View style={styles.menu}>
    <Choices>
      <ChoiceLink title="Career stage" value={stageSummary(draft)} onPress={() => open("stage")} />
      {/* The saved search has no pay floor yet; the row holds its place. */}
      <ChoiceLink title="Pay from" value="Soon" />
      <ChoiceLink title="Roles" value={rolesSummary(draft)} onPress={() => open("roles")} />
      <ChoiceLink title="Where" value={whereSummary(draft)} onPress={() => open("where")} />
      <ChoiceLink title="Visa sponsorship" value={needsSponsorship(draft) ? "Needed" : "Not needed"} onPress={() => open("visa")} />
      <ChoiceLink title="Experience asked" value={experienceSummary(draft)} onPress={() => open("experience")} />
    </Choices>
    <Choices>
      <ChoiceLink title="Alerts" value={push.data === undefined ? undefined : push.data.enabled ? "On" : "Off"} onPress={() => leaveTo("/you/alerts")} />
      <ChoiceLink title="Hidden companies" value={hidden === undefined ? undefined : String(hidden)} onPress={() => leaveTo("/you/companies")} />
    </Choices>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  loading: { minHeight: 160, alignItems: "center", justifyContent: "center" },
  scroll: { flexShrink: 1, marginHorizontal: -theme.ui.space["5"] },
  scrollBody: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.space["5"], paddingBottom: theme.ui.space["1"] },
  menu: { gap: theme.ui.space["3"] },
}));
