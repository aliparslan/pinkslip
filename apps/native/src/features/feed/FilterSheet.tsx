import { locationLabels, locationParam, locations as chosenLocations, selectedStages, type FeedLocation, type FeedSearch } from "@pinkslip/core/feed-criteria";
import { CAREER_STAGE_OPTIONS, LOCATION_OPTIONS, type CareerStage } from "@pinkslip/domain/search-profile";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, Field, Inline, Input, MultiToggleGroup, Sheet, Stack, Switch, Text } from "../../kit";
import { useFeedCriteria } from "./Feed";
import { setFeedSearch } from "./feed-search";

interface Draft { locations: FeedLocation[]; min: string; max: string; stages: CareerStage[]; listing?: "evergreen"; saved: boolean }

function draftFrom(search: FeedSearch, available: readonly CareerStage[], defaults: readonly FeedLocation[]): Draft {
  return {
    locations: chosenLocations(search, defaults),
    min: search.min ? String(search.min) : "",
    max: search.max ? String(search.max) : "",
    stages: selectedStages(search, available),
    listing: search.listing,
    saved: Boolean(search.saved),
  };
}

const digits = (value: string) => value.replace(/\D/g, "").slice(0, 4);
const ANYWHERE = "anywhere";

/** The feed's filter sheet (a system page sheet). A draft until Apply;
 * swiping it away discards the changes. Every metro plus Remote, the
 * profile's preselected, as on the web; no evergreen option (owner). */
export function FilterSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { search, available, defaults } = useFeedCriteria();
  const [draft, setDraft] = useState(() => draftFrom(search, available, defaults));
  // Re-read the applied filters each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(draftFrom(search, available, defaults));
  }
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const choices: FeedLocation[] = ["remote", ...LOCATION_OPTIONS.map((option) => option.id)];
  const changed = draft.locations.length > 0 || draft.min || draft.max || draft.stages.length !== available.length || draft.saved || draft.listing;

  const apply = () => {
    const next: FeedSearch = {};
    if (search.q) next.q = search.q;
    const loc = locationParam(draft.locations, defaults);
    if (loc) next.loc = loc;
    const min = Number.parseInt(draft.min, 10);
    const max = Number.parseInt(draft.max, 10);
    if (min > 0) next.min = min;
    if (max > 0) next.max = max;
    if (draft.stages.length > 0 && draft.stages.length < available.length) next.stage = draft.stages.join(",");
    if (draft.listing) next.listing = draft.listing;
    if (draft.saved) next.saved = 1;
    setFeedSearch(next);
    onOpenChange(false);
  };

  return <Sheet open={open} onOpenChange={onOpenChange} title="Filters"
    footer={<View style={styles.footer}>
      {changed ? <View style={styles.half}><Button fullWidth onPress={() => setDraft({ ...draftFrom({}, available, defaults), locations: [] })}>Reset</Button></View> : null}
      <View style={styles.half}><Button variant="primary" fullWidth onPress={apply}>Apply</Button></View>
    </View>}>
    <Stack gap="6">
      <Stack gap="2">
        <Text size="sm" weight="medium" tone="ink-2">Location</Text>
        <MultiToggleGroup<FeedLocation | typeof ANYWHERE> label="Location"
          value={draft.locations.length === 0 ? [ANYWHERE] : draft.locations}
          onValueChange={(next) => {
            const added = next.find((value) => value === ANYWHERE || !draft.locations.includes(value as FeedLocation));
            if (added === ANYWHERE || next.length === 0) return set({ locations: [] });
            set({ locations: choices.filter((choice) => next.includes(choice)) });
          }}
          options={[{ value: ANYWHERE, label: "Anywhere" }, ...choices.map((id) => ({ value: id, label: locationLabels[id] }))]} />
      </Stack>
      <Inline gap="3" align="start">
        <View style={styles.half}><Field label="Min salary ($K)"><Input keyboardType="number-pad" placeholder="120" value={draft.min} onChangeText={(text) => set({ min: digits(text) })} /></Field></View>
        <View style={styles.half}><Field label="Max salary ($K)"><Input keyboardType="number-pad" placeholder="250" value={draft.max} onChangeText={(text) => set({ max: digits(text) })} /></Field></View>
      </Inline>
      {available.length > 1 && <Stack gap="2">
        <Text size="sm" weight="medium" tone="ink-2">Career stage</Text>
        <MultiToggleGroup label="Career stage" min={1} value={draft.stages} onValueChange={(stages) => set({ stages })}
          options={CAREER_STAGE_OPTIONS.filter((option) => available.includes(option.id)).map((option) => ({ value: option.id, label: option.label }))} />
      </Stack>}
      <Inline justify="between"><Text>Saved jobs only</Text><Switch label="Saved jobs only" checked={draft.saved} onCheckedChange={(saved) => set({ saved })} /></Inline>
    </Stack>
  </Sheet>;
}

const styles = StyleSheet.create((theme) => ({
  half: { flex: 1 },
  footer: { flexDirection: "row", gap: theme.space["3"] },
}));
