import { Stack } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { faces, Icon, Text, useUiFontsLoaded } from "../../ui";
import { JobsFeed } from "./JobsFeed";

const SEARCH_DEBOUNCE_MS = 250;

/** The Search tab (iOS 26 puts its field in the tab bar): results over your
 * saved search as you type, in the same rows as Jobs. */
export function SearchScreen() {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const [query, setQuery] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (text: string) => setQuery(text.trim());
  return <>
    <Stack.Screen options={{
      title: "Search",
      headerLargeTitle: true,
      headerTintColor: theme.ui.color.ink,
      headerLargeTitleStyle: { color: theme.ui.color.ink, fontFamily: fonts ? faces.display : undefined },
      headerTitleStyle: { color: theme.ui.color.ink, fontFamily: fonts ? faces.textMedium : undefined },
      contentStyle: { backgroundColor: theme.ui.color.bg },
      headerSearchBarOptions: {
        placeholder: "Jobs or companies",
        hideWhenScrolling: false,
        onChangeText: (event) => {
          const text = event.nativeEvent.text;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(text), SEARCH_DEBOUNCE_MS);
        },
        onSearchButtonPress: (event) => commit(event.nativeEvent.text),
        onCancelButtonPress: () => commit(""),
      },
    }} />
    {query
      ? <JobsFeed query={query} tab="(search)" onClearQuery={() => setQuery("")} />
      : <View style={styles.idle}>
        <Icon name="search" size={28} tone="ink-3" />
        <Text role="subhead" tone="ink-2" align="center">Titles, companies or cities</Text>
      </View>}
  </>;
}

const styles = StyleSheet.create((theme) => ({
  idle: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.ui.space["2"], backgroundColor: theme.ui.color.bg },
}));
