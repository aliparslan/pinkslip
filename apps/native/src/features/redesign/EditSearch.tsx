import { NO_ROLE_PREFERENCE, roleChips, rolesFromChips, visibleRoles, type Profile } from "@pinkslip/core/profile-fields";
import { locationLabels } from "@pinkslip/core/feed-criteria";
import { useApi, useCompanies, usePreferences, usePushSettings, useUpdatePreferences } from "@pinkslip/data";
import { normalizeSearchProfile } from "@pinkslip/domain/search-profile";
import { CAREER_STAGE_OPTIONS, LOCATION_OPTIONS, MAX_YEARS_EXPERIENCE, type CareerStage, type LocationId } from "@pinkslip/domain/search-profile";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { toast } from "../../kit";
import { haptics } from "../../platform/haptics";
import { Button, Choice, Choices, ChoiceSwitch, ListGroup, ListItem, Sheet, SheetHeader, SheetStep, Text, Ticket, useSheet } from "../../ui";
import {
  experienceSummary, needsSponsorship, rolesSummary, stageName, stageTicket, toggled, wantsRemote, whereSummary, withRemote,
} from "./search-draft";

type Step = "search" | "stage" | "roles" | "where" | "visa" | "experience" | "more";

const stageDetail: Record<CareerStage, string> = {
  internship: "Summer, fall and co-op roles",
  new_grad: "Graduating this year or last",
  early_career: "1 to 3 years in",
  mid_career: "3 to 5 years in",
};

/**
 * Your search (Paper "Filters A"), the one saved search behind the feed and
 * alerts, drawn on the same ticket as a job page: tap a box to change it and
 * the sheet steps into that choice, then Done steps back. Save writes the
 * search; closing drops the changes.
 */
export function EditSearch() {
  return <Sheet onClosed={() => router.back()}><YourSearch /></Sheet>;
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
      <SearchTicket draft={draft} open={setStep} />
      <Button variant="primary" fullWidth disabled={!changed} pending={update.isPending} onPress={() => void save()}>Save search</Button>
    </SheetStep>;
  }

  const done = <Button fullWidth onPress={back}>Done</Button>;
  const choices = (title: string, body: React.ReactNode) => <SheetStep id={step}>
    <SheetHeader title={title} onBack={back} />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>{body}</ScrollView>
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

  if (step === "experience") {
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

  return <SheetStep id="more">
    <SheetHeader title="Alerts and companies" onBack={back} />
    <MoreRows />
    {done}
  </SheetStep>;
}

/** The search on the job page's ticket grid: stage and pay, roles, where,
 * visa and experience, with alerts and hidden companies on the stub. */
function SearchTicket({ draft, open }: { draft: Profile; open: (step: Step) => void }) {
  const push = usePushSettings();
  const companies = useCompanies();
  const hidden = companies.data?.filter((company) => company.blocked).length;
  const stub = [
    push.data === undefined ? null : push.data.enabled ? "Alerts on" : "Alerts off",
    hidden === undefined ? null : hidden === 0 ? "No hidden companies" : `${hidden} ${hidden === 1 ? "company" : "companies"} hidden`,
  ].filter(Boolean).join(" · ");
  return <Ticket backdrop="bg-elev" stub={stub || "Alerts and hidden companies"} onStubPress={() => open("more")} rows={[
    [
      { label: "Career stage", value: stageTicket(draft), action: () => open("stage") },
      // The saved search has no pay floor yet; the box holds its place.
      { label: "Pay from", value: "Soon" },
    ],
    [{ label: "Roles", value: rolesSummary(draft), action: () => open("roles") }],
    [{ label: "Where", value: whereSummary(draft), action: () => open("where") }],
    [
      { label: "Visa sponsorship", value: needsSponsorship(draft) ? "Needed" : "Not needed", action: () => open("visa") },
      { label: "Experience asked", value: experienceSummary(draft), action: () => open("experience") },
    ],
  ]} />;
}

/** Alerts and hidden companies live under You; these close the sheet and
 * open them there. */
function MoreRows() {
  const sheet = useSheet();
  const push = usePushSettings();
  const companies = useCompanies();
  const hidden = companies.data?.filter((company) => company.blocked).length;
  const leaveTo = (href: Href) => {
    sheet.close();
    setTimeout(() => router.push(href), 320);
  };
  return <View style={styles.more}>
    <ListGroup>
      <ListItem title="Alerts" value={push.data === undefined ? undefined : push.data.enabled ? "On" : "Off"} accessory="chevron" onPress={() => leaveTo("/you/alerts")} />
      <ListItem title="Hidden companies" value={hidden === undefined ? undefined : String(hidden)} accessory="chevron" onPress={() => leaveTo("/you/companies")} />
    </ListGroup>
    <Text role="footnote" tone="ink-3">These live under You.</Text>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  loading: { minHeight: 160, alignItems: "center", justifyContent: "center" },
  scroll: { flexShrink: 1, marginHorizontal: -theme.ui.space["5"] },
  scrollBody: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.space["5"], paddingBottom: theme.ui.space["1"] },
  more: { gap: theme.ui.space["2"], marginHorizontal: -theme.ui.space["4"] },
}));
