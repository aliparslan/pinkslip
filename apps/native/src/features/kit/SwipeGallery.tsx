import { FlashList } from "@shopify/flash-list";
import { BookmarkSimple, EyeSlash } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, SwipeRow, Text } from "../../kit";
import { RowSeparator } from "../jobs/RowSeparator";

/** Local-only examples: swiping never writes to an account or the API. */
export function SwipeGallery() {
  const [saved, setSaved] = useState(new Set<number>());
  const [hidden, setHidden] = useState(new Set<number>());
  const toggle = (id: number) => setSaved((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const rows = Array.from({ length: 300 }, (_, id) => id).filter((id) => !hidden.has(id));
  return <FlashList data={rows} keyExtractor={String} contentInsetAdjustmentBehavior="automatic" ItemSeparatorComponent={RowSeparator}
    ListHeaderComponent={<View style={styles.header}>
      <Text tone="ink-3">{saved.size} saved · {hidden.size} hidden</Text>
      <Button onPress={() => { setSaved(new Set()); setHidden(new Set()); }}>Reset examples</Button>
    </View>}
    renderItem={({ item: id }) => <SwipeRow id={String(id)}
      leading={{ label: saved.has(id) ? "Unsave" : "Save", icon: BookmarkSimple, tone: saved.has(id) ? "neutral" : "accent", run: () => toggle(id) }}
      trailing={{ label: "Hide", icon: EyeSlash, tone: "bad", removes: true, run: () => setHidden((previous) => new Set([...previous, id])) }}>
      <View style={styles.row}>
        <Text tone="ink-3" size="sm">Example company · Chicago, IL</Text>
        <Text weight="medium">Example job {id + 1}{saved.has(id) ? " · Saved" : ""}</Text>
      </View>
    </SwipeRow>} />;
}

const styles = StyleSheet.create((theme) => ({
  header: { padding: theme.gutter, gap: theme.space["3"] },
  row: { paddingHorizontal: theme.gutter, paddingVertical: theme.space["3"], gap: theme.space["1"], backgroundColor: theme.colors.bg },
}));
