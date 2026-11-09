import { locationLabels, type FeedLocation } from "@pinkslip/core/feed-criteria";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native-unistyles";
import { Button, Choice, Choices, SheetHeader, SheetModal, SheetScroll, SheetStep } from "../../ui";

/** The Location chip's drawer, for when there are too many places for a
 * system dropdown (Paper "Chips you choose, and a sort · Nov 9"). Any number
 * of places; Any clears them. Nothing changes until Done. */
export function LocationFilterSheet({ open, onClosed, options, chosen, onDone }: {
  open: boolean;
  onClosed: () => void;
  options: readonly FeedLocation[];
  chosen: readonly FeedLocation[];
  onDone: (chosen: FeedLocation[]) => void;
}) {
  const [draft, setDraft] = useState<FeedLocation[]>([...chosen]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh draft each time it opens
  useEffect(() => { if (open) setDraft([...chosen]); }, [open]);
  const toggle = (id: FeedLocation) => setDraft((now) => now.includes(id) ? now.filter((place) => place !== id) : [...now, id]);
  return <SheetModal open={open} onClosed={onClosed}>
    <SheetStep id="location">
      <SheetHeader title="Location" />
      <SheetScroll style={styles.scroll} contentContainerStyle={styles.body}>
        <Choices>
          <Choice plain title="Any" selected={draft.length === 0} onPress={() => setDraft([])} />
          {options.map((id) => <Choice key={id} plain multiple title={locationLabels[id]} selected={draft.includes(id)} onPress={() => toggle(id)} />)}
        </Choices>
      </SheetScroll>
      <Button fullWidth onPress={() => onDone(draft)}>Done</Button>
    </SheetStep>
  </SheetModal>;
}

const styles = StyleSheet.create((theme) => ({
  scroll: { flexShrink: 1, marginHorizontal: -theme.ui.space["5"] },
  body: { paddingHorizontal: theme.ui.space["5"] },
}));
