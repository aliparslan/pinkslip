import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, NativeList, NativeListContent, NativeSwipeRow, Text } from "../../kit";

/** Local-only examples: swiping never writes to an account or the API. */
export function SwipeGallery() {
  const [saved, setSaved] = useState(new Set<number>());
  const [hidden, setHidden] = useState(new Set<number>());
  const [limit, setLimit] = useState(50);
  const toggle = (id: number) => setSaved((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const reset = async () => { setSaved(new Set()); setHidden(new Set()); setLimit(50); };
  return <NativeList onRefresh={reset}>
    <NativeListContent><View style={styles.header}>
      <Text>Swipe right to save or unsave. Swipe left to hide. A short swipe reveals a button; a full swipe runs it.</Text>
      <Text tone="ink-3">{saved.size} saved · {hidden.size} hidden · {limit} loaded</Text>
      <Button onPress={() => void reset()}>Reset examples</Button>
    </View></NativeListContent>
    {Array.from({ length: limit }, (_, id) => id).filter((id) => !hidden.has(id)).map((id) =>
      <NativeSwipeRow key={id}
        leading={{ label: saved.has(id) ? "Unsave" : "Save", icon: saved.has(id) ? "bookmark.slash" : "bookmark", tone: saved.has(id) ? "neutral" : "accent", run: () => toggle(id) }}
        trailing={{ label: "Hide", icon: "eye.slash", tone: "bad", run: () => setHidden((previous) => new Set([...previous, id])) }}>
        <View style={styles.row}>
          <Text tone="ink-3" size="sm">Example company · Chicago, IL</Text>
          <Text weight="medium">Example job {id + 1}{saved.has(id) ? " · Saved" : ""}</Text>
        </View>
      </NativeSwipeRow>)}
    <NativeListContent key={limit} onVisible={() => { if (limit < 300) setLimit(limit + 50); }}>
      <View style={styles.header}><Text>{limit < 300 ? "More examples…" : "All 300 examples loaded"}</Text></View>
    </NativeListContent>
  </NativeList>;
}

const styles = StyleSheet.create((theme) => ({
  header: { padding: theme.gutter, gap: theme.space["3"] },
  row: { paddingHorizontal: theme.gutter, paddingVertical: theme.space["3"], gap: theme.space["1"], backgroundColor: theme.colors.bg },
}));
