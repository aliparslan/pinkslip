import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Icon, IconButton, SearchField, Text } from "../../ui";
import { EditSearchSheet } from "./EditSearch";
import { OfflinePill } from "./errors";
import { JobsFeed } from "./JobsFeed";
import { rememberSearch } from "./recent-searches";

const SEARCH_DEBOUNCE_MS = 250;

/** Waits for typing to pause before searching. */
export function useDebounced(value: string, ms = SEARCH_DEBOUNCE_MS) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** The Jobs tab (Paper "Tab bar · Oct 12", option C): "Jobs" in Founders,
 * then the search field beside Your search, then the quick filters. Typing
 * narrows the feed you're looking at, filters and all; the list ends with a
 * way to search everything in the Search tab. */
export function JobsScreen() {
  const [text, setText] = useState("");
  const query = useDebounced(text.trim());
  const [editing, setEditing] = useState(false);
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <JobsFeed query={query || undefined} chips onClearQuery={() => setText("")}
      top={(offline) => <View style={styles.header}>
        {/* The title sits under the 44 nav row, level with every other tab's. */}
        <View style={styles.titleBlock}>
          <View style={styles.nav} />
          <View style={styles.titleRow}>
            <Text role="largeTitle" accessibilityRole="header">Jobs</Text>
            {offline ? <OfflinePill /> : null}
          </View>
        </View>
        <View style={styles.row}>
          <SearchField value={text} onChangeText={setText} placeholder="Search these jobs" onSubmit={() => rememberSearch(text)} />
          <IconButton icon="editSearch" label="Your search" onPress={() => setEditing(true)} />
        </View>
      </View>}
      after={query ? <SearchEverything query={query} /> : null} />
    <EditSearchSheet open={editing} onClosed={() => setEditing(false)} />
  </>;
}

/** The way out of the feed: the same words across every job, company and event. */
function SearchEverything({ query }: { query: string }) {
  const open = () => {
    rememberSearch(query);
    router.navigate({ pathname: "/(tabs)/(search)/search", params: { q: query } });
  };
  return <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [styles.everything, pressed && styles.pressed]}>
    <View style={styles.circle}><Icon name="search" size={18} tone="ink-2" /></View>
    <View style={styles.text}>
      <Text role="subhead" weight="medium" lines={1}>Search everything for “{query}”</Text>
      <Text role="subhead" tone="ink-2">Companies and every open job</Text>
    </View>
    <Icon name="disclosure" size={12} tone="ink-4" />
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  header: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter },
  titleBlock: { gap: theme.ui.space["2"] },
  nav: { height: theme.ui.size.iconButton },
  row: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  everything: {
    flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"],
    paddingHorizontal: theme.ui.size.gutter, paddingVertical: theme.ui.space["3"],
  },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  text: { flex: 1 },
  pressed: { opacity: 0.6 },
}));
