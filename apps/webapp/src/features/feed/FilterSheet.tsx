import { useId, useState } from "react";
import { CAREER_STAGE_OPTIONS, type CareerStage, type LocationId } from "@pinkslip/domain/search-profile";
import { Button, Field, Input, Menu, MenuCheckboxItem, MultiToggleGroup, Sheet, Stack, Switch, Text, ToggleGroup } from "../../kit";
import {
  locationLabels, locationSummary, locations as chosenLocations, selectedStages, type FeedLocation, type FeedSearch,
} from "./criteria";
import styles from "./Feed.module.css";

interface Draft {
  locations: FeedLocation[];
  min: string;
  max: string;
  stages: CareerStage[];
  listing: "any" | "evergreen";
  saved: boolean;
}

function draftFrom(search: FeedSearch, available: readonly CareerStage[]): Draft {
  return {
    locations: chosenLocations(search),
    min: search.min ? String(search.min) : "",
    max: search.max ? String(search.max) : "",
    stages: selectedStages(search, available),
    listing: search.listing ?? "any",
    saved: Boolean(search.saved),
  };
}

const digits = (value: string) => value.replace(/\D/g, "").slice(0, 4);

export interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: FeedSearch;
  /** The profile's career stages; the filter can only narrow them. */
  available: readonly CareerStage[];
  /** The profile's metros; other metros would only ever be empty. */
  metros: readonly LocationId[];
  onApply: (search: FeedSearch) => void;
}

/** The feed's filter sheet (`Feed.svelte`'s `.filter-sheet`). Changes are a
 * draft until Apply, so closing the sheet discards them. */
export function FilterSheet({ open, onOpenChange, search, available, metros, onApply }: FilterSheetProps) {
  const [draft, setDraft] = useState(() => draftFrom(search, available));
  const locationLabel = useId();
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const choices: FeedLocation[] = ["remote", ...metros];
  const defaults = draftFrom({}, available);
  const changed = draft.locations.length > 0 || draft.min || draft.max || draft.stages.length !== available.length
    || draft.listing !== "any" || draft.saved;

  // Re-read the applied filters each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(draftFrom(search, available));
  }

  const apply = () => {
    const next: FeedSearch = {};
    if (search.q) next.q = search.q;
    if (draft.locations.length > 0) next.loc = draft.locations.join(",");
    const min = Number.parseInt(draft.min, 10);
    const max = Number.parseInt(draft.max, 10);
    if (min > 0) next.min = min;
    if (max > 0) next.max = max;
    if (draft.stages.length > 0 && draft.stages.length < available.length) next.stage = draft.stages.join(",");
    if (draft.listing === "evergreen") next.listing = "evergreen";
    if (draft.saved) next.saved = 1;
    onApply(next);
    onOpenChange(false);
  };

  return <Sheet open={open} onOpenChange={onOpenChange} title="Filters" closeLabel="Close filters"
    footer={<div className={styles.sheetActions} data-single={changed ? undefined : true}>
      {changed && <Button variant="secondary" onClick={() => setDraft(defaults)}>Reset</Button>}
      <Button variant="primary" onClick={apply}>Apply</Button>
    </div>}>
    <Stack gap="6">
      <Stack gap="2">
        <Text id={locationLabel} size="sm" weight="medium" tone="ink-2">Location</Text>
        <Menu label="Location" align="start" trigger={{ placeholder: "Anywhere", value: locationSummary(draft.locations), labelledBy: locationLabel }}>
          <MenuCheckboxItem checked={draft.locations.length === 0} onCheckedChange={() => set({ locations: [] })}>Anywhere</MenuCheckboxItem>
          {choices.map((id) => <MenuCheckboxItem key={id} checked={draft.locations.includes(id)}
            onCheckedChange={(checked) => set({
              locations: checked ? choices.filter((choice) => choice === id || draft.locations.includes(choice))
                : draft.locations.filter((choice) => choice !== id),
            })}>
            {locationLabels[id]}
          </MenuCheckboxItem>)}
        </Menu>
      </Stack>

      <div className={styles.salary}>
        <Field label="Min salary ($K)">
          <Input inputMode="numeric" placeholder="120" value={draft.min} onChange={(event) => set({ min: digits(event.target.value) })} />
        </Field>
        <Field label="Max salary ($K)">
          <Input inputMode="numeric" placeholder="250" value={draft.max} onChange={(event) => set({ max: digits(event.target.value) })} />
        </Field>
      </div>

      {available.length > 1 && <Stack gap="2">
        <Text size="sm" weight="medium" tone="ink-2">Career stage</Text>
        <MultiToggleGroup label="Career stage" min={1} value={draft.stages} onValueChange={(stages) => set({ stages })}
          options={CAREER_STAGE_OPTIONS.filter((option) => available.includes(option.id))
            .map((option) => ({ value: option.id, label: option.label }))} />
      </Stack>}

      <Stack gap="2">
        <Text size="sm" weight="medium" tone="ink-2">Listing type</Text>
        <ToggleGroup label="Listing type" variant="segmented" value={draft.listing} onValueChange={(listing) => set({ listing })}
          options={[{ value: "any", label: "All" }, { value: "evergreen", label: "Evergreen only" }]} />
      </Stack>

      <div className={styles.toggleRow}>
        <Text>Saved jobs only</Text>
        <Switch label="Saved jobs only" checked={draft.saved} onCheckedChange={(saved) => set({ saved })} />
      </div>
    </Stack>
  </Sheet>;
}
