import { normalizeSearchProfile } from "@pinkslip/domain/search-profile";
import { useApi, useCompanies, usePreferences, useUpdatePreferences } from "@pinkslip/data";
import { router, Stack, type Href } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { toast } from "../../kit";
import { haptics } from "../../platform/haptics";
import { Button, ListGroup, ListItem, Text } from "../../ui";
import {
  changeDraft, citiesSummary, endDraft, experienceSummary, needsSponsorship, rolesSummary, stageSummary, startDraft, useDraft,
  wantsRemote, withRemote,
} from "./search-draft";

/**
 * Your search, as a page sheet from Jobs: the one saved search behind the
 * feed and alerts (it replaces the old filters and Preferences). Rows show
 * their value on the right and open a picker inside the sheet; Save writes
 * the search, Cancel drops the changes.
 */
export function EditSearch() {
  const { theme } = useUnistyles();
  const api = useApi();
  const preferences = usePreferences();
  const update = useUpdatePreferences();
  const draft = useDraft();
  const saved = preferences.data?.search_profile;

  useEffect(() => {
    if (saved && !draft) startDraft(normalizeSearchProfile(saved));
  }, [saved, draft]);
  // The sheet closing (Save, Cancel or a swipe down) ends the draft.
  useEffect(() => () => endDraft(), []);

  const changed = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(normalizeSearchProfile(saved)));
  const save = async () => {
    if (!draft) return;
    try {
      await update.mutateAsync({ search_profile: draft });
      haptics.success();
      void api.interactions.event({ event_name: "search_profile_adjusted", entity_type: "search_profile", properties: { source: "edit_search" } }).catch(() => undefined);
      router.back();
    } catch {
      toast.error("Couldn't save your search. Try again.");
    }
  };

  return <>
    <Stack.Screen options={{
      title: "Your search",
      unstable_headerLeftItems: () => [{
        type: "button", label: "Cancel", icon: { type: "sfSymbol", name: "xmark" }, onPress: () => router.back(),
      }],
      unstable_headerRightItems: () => [{
        type: "button",
        label: "Save",
        variant: "prominent",
        tintColor: theme.ui.color["accent-fill"],
        labelStyle: { color: theme.ui.color["accent-ink"] },
        disabled: !changed || update.isPending,
        onPress: () => void save(),
      }],
    }} />
    {!draft ? <View style={styles.center}>
      {preferences.isError
        ? <Button size="small" onPress={() => void preferences.refetch()}>Try again</Button>
        : <ActivityIndicator color={theme.ui.color["ink-3"]} />}
    </View> : <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <Headline />
      <ListGroup header="What">
        <ListItem title="Career stage" value={stageSummary(draft)} accessory="chevron" onPress={() => router.push("/edit-search/stage")} />
        <ListItem title="Roles" value={rolesSummary(draft)} accessory="chevron" onPress={() => router.push("/edit-search/roles")} />
        <ListItem title="Experience asked for" value={experienceSummary(draft)} accessory="chevron" onPress={() => router.push("/edit-search/experience")} />
      </ListGroup>
      <ListGroup header="Where">
        <ListItem title="Remote in the US" accessory="switch" selected={wantsRemote(draft)} onToggle={(on) => changeDraft(withRemote(draft, on))} />
        <ListItem title="Cities" value={citiesSummary(draft)} accessory="chevron" onPress={() => router.push("/edit-search/cities")} />
        <ListItem title="Needs visa sponsorship" accessory="switch" selected={needsSponsorship(draft)}
          onToggle={(on) => changeDraft({ work_authorization: on ? "sponsorship" : "authorized" })} />
      </ListGroup>
      <ListGroup>
        <HiddenCompaniesRow />
        <ListItem title="Alerts" accessory="chevron" onPress={() => leaveTo("/you/alerts")} />
      </ListGroup>
    </ScrollView>}
  </>;
}

/** What the search does. The design leads with the live match count ("48 a
 * week"); the API doesn't count matches yet (a feed page stops at 26), so the
 * number waits for a count endpoint. */
function Headline() {
  return <View style={styles.headline}>
    <Text role="subhead" tone="ink-2">This search sets your feed and alerts.</Text>
  </View>;
}

function HiddenCompaniesRow() {
  const companies = useCompanies();
  const hidden = companies.data?.filter((company) => company.blocked).length;
  return <ListItem title="Hidden companies" value={hidden === undefined ? undefined : String(hidden)} accessory="chevron"
    onPress={() => leaveTo("/you/companies")} />;
}

/** Settings that live under You: close the sheet, then open them there. */
function leaveTo(href: Href) {
  router.back();
  setTimeout(() => router.push(href), 350);
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.ui.color["screen-grouped"] },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color["screen-grouped"] },
  content: { gap: theme.ui.space["6"], paddingTop: theme.ui.space["2"], paddingBottom: theme.ui.space["10"] },
  headline: { gap: theme.ui.space["1"], paddingHorizontal: theme.ui.space["4"] + theme.ui.space["4"] },
}));
