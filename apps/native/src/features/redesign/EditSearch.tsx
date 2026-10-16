import { NO_ROLE_PREFERENCE, roleChips, rolesFromChips, visibleRoles, type Profile } from "@pinkslip/core/profile-fields";
import { locationLabels } from "@pinkslip/core/feed-criteria";
import { useApi, useCompanies, usePreferences, usePushSettings, useUpdatePreferences } from "@pinkslip/data";
import { normalizeSearchProfile } from "@pinkslip/domain/search-profile";
import { LOCATION_OPTIONS, MAX_YEARS_EXPERIENCE, type CareerStage, type LocationId } from "@pinkslip/domain/search-profile";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { toast } from "../../kit";
import { haptics } from "../../platform/haptics";
import { Button, Choice, ChoiceLink, Choices, ChoiceSwitch, SheetBack, SheetHeader, SheetModal, SheetScroll, SheetStep, Text, useSheet, useSheetGuard } from "../../ui";
import {
  changedRows, changedSentence, experienceSummary, needsSponsorship, rolesSummary, stageName, STAGES_IN_ORDER, stageSummary, toggled, wantsRemote, whereSummary,
  withRemote,
} from "./search-draft";

type Choosing = "search" | "stage" | "roles" | "where" | "visa" | "experience";
type Step = Choosing | "discard";

const stageDetail: Record<CareerStage, string> = {
  internship: "Summer, fall and co-op roles",
  new_grad: "Graduating this year or last",
  early_career: "1 to 3 years in",
  mid_career: "3 to 5 years in",
};

/**
 * Your search (Paper "Filters · Your search as a plain menu"), the one saved
 * search behind the feed and alerts: tap a row and the sheet changes to that
 * choice, then Back or Done returns to the menu. Save writes the search.
 * Swiping it away with changes asks first (Paper "Save your changes? · D3
 * stacked (picked)"); swiping the question away goes back to the changes.
 * It opens over Jobs, which stays in view behind it.
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
  const [returnTo, setReturnTo] = useState<Choosing>("search");

  useEffect(() => {
    if (saved && !draft) setDraft(normalizeSearchProfile(saved));
  }, [saved, draft]);

  const changes = saved && draft ? changedRows(normalizeSearchProfile(saved), draft) : [];
  useSheetGuard(changes.length > 0, () => {
    if (step === "discard") {
      setStep(returnTo);
      return;
    }
    setReturnTo(step);
    setStep("discard");
  });

  if (!draft) {
    // The same step as the loaded search, so it grows in place rather than sliding.
    return <SheetStep id="search">
      <SheetHeader title="Your search" />
      <View style={styles.loading}>
        {preferences.isError
          ? <Button size="small" onPress={() => void preferences.refetch()}>Try again</Button>
          : <ActivityIndicator color={theme.ui.color["ink-3"]} />}
      </View>
    </SheetStep>;
  }

  const change = (patch: Partial<Profile>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const changed = changes.length > 0;
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

  // Discard sits under Save as a word, not a red button: the question already
  // says what's at stake. It slides the way the step it came from left.
  if (step === "discard") {
    return <SheetStep id="discard" inner={returnTo === "search"}>
      <SheetHeader title="Save your changes?" />
      <Text tone="ink-2">{changedSentence(changes)}</Text>
      <View style={styles.answers}>
        <Button variant="primary" fullWidth pending={update.isPending} onPress={() => void save()}>Save search</Button>
        <Button variant="text" fullWidth onPress={sheet.close}>Discard changes</Button>
      </View>
    </SheetStep>;
  }

  // Picks apply as you tap, so Back and Done both return to the menu; Back
  // sits where a thumb finds it (owner, 2026-10-13).
  const done = <View style={styles.actions}>
    <SheetBack onPress={back} />
    <View style={styles.flex}><Button fullWidth onPress={back}>Done</Button></View>
  </View>;
  const choices = (title: string, body: React.ReactNode) => <SheetStep id={step} inner>
    <SheetHeader title={title} />
    <SheetScroll style={styles.scroll} contentContainerStyle={styles.scrollBody}>{body}</SheetScroll>
    {done}
  </SheetStep>;

  if (step === "stage") {
    return choices("Career stage", <Choices>
      {STAGES_IN_ORDER.map((id) => <Choice key={id} multiple title={stageName(id)} detail={stageDetail[id]}
        selected={draft.target_levels.includes(id)}
        onPress={() => { const next = toggled(draft.target_levels, id); if (next) change({ target_levels: next }); }} />)}
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
function SearchMenu({ draft, open }: { draft: Profile; open: (step: Choosing) => void }) {
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
  /** The choices size the step, and scroll when it reaches the screen's height. */
  scroll: { flexShrink: 1, marginHorizontal: -theme.ui.space["5"] },
  scrollBody: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.space["5"], paddingBottom: theme.ui.space["1"] },
  menu: { gap: theme.ui.space["3"] },
  answers: { gap: theme.ui.space["2"] },
  actions: { flexDirection: "row", gap: theme.ui.space["3"] },
  flex: { flex: 1 },
}));
