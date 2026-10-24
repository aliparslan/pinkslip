import { useCompanies } from "@pinkslip/data";
import { router, Stack, useIsFocused, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, View, type TextInput } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { BottomSearch, CompanyLogo, Icon, leaveSearch, SectionHeader, Text, useSearchTabPress, useTabBarStepsAside } from "../../ui";
import { logoUri } from "../jobs/CompanyLogo";
import { JobsFeed } from "./JobsFeed";
import { useDebounced } from "./JobsScreen";
import { clearRecentSearches, rememberSearch, useRecentSearches } from "./recent-searches";
import { setSearchText, useSearchText } from "./search-text";

/**
 * The Search tab, a quick lookup (owner, 2026-10-22, Paper "Search at the
 * bottom · Oct 22", A; Apple's search tab with the button appearance):
 * picking it brings up the keyboard with the field at the bottom and an X
 * beside it, where the tab bar was, and the X goes back to the tab you came
 * from. Before you type it shows your recent searches; then companies that
 * match, and every open job that does, outside your saved search. Jobs' own
 * field narrows the feed instead. A page you open from here keeps the tab
 * bar; coming back to the results leaves the keyboard down.
 */
export function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const text = useSearchText();
  // "Search everything" from Jobs arrives with its words, and the results.
  useEffect(() => { if (params.q) setSearchText(params.q); }, [params.q]);
  const query = useDebounced(text.trim());
  const focused = useIsFocused();
  useTabBarStepsAside(focused);
  const field = useRef<TextInput>(null);
  useSearchTabPress(() => field.current?.focus());
  const leave = () => {
    field.current?.blur();
    setSearchText("");
    leaveSearch();
  };

  // The title scrolls with the page, as on every other tab, under the 44 nav row.
  const header = <View style={styles.header}>
    <View style={styles.nav} />
    <Text role="largeTitle" accessibilityRole="header">Search</Text>
  </View>;
  return <View style={styles.screen}>
    <Stack.Screen options={{ headerShown: false }} />
    <JobsFeed query={query} scope="all" tab="(search)" chips={false} onClearQuery={() => setSearchText("")}
      top={<>{header}{query ? <Companies query={query} /> : null}</>} idle={<Recent onPick={setSearchText} />} />
    {/* Picked from the bar the first time, the screen is new, so it asks for the keyboard itself. */}
    <BottomSearch ref={field} shown={focused} onLeave={leave} value={text} onChangeText={setSearchText}
      placeholder="Jobs and companies" onSubmit={() => rememberSearch(text)} autoFocus={!params.q} />
  </View>;
}

function Recent({ onPick }: { onPick: (text: string) => void }) {
  const recent = useRecentSearches();
  if (recent.length === 0) {
    return <View style={styles.idle}>
      <Text role="subhead" tone="ink-2" align="center">Search every open job and company, not just your feed.</Text>
    </View>;
  }
  return <View style={styles.recent}>
    <View style={styles.recentHeader}>
      <Text role="footnote" weight="medium" tone="ink-2">Recent</Text>
      <Pressable onPress={clearRecentSearches} hitSlop={8} accessibilityRole="button"><Text role="footnote" tone="ink-3">Clear</Text></Pressable>
    </View>
    {recent.map((item) => <Pressable key={item} onPress={() => onPick(item)} accessibilityRole="button"
      style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}>
      <View style={styles.recentIcon}><Icon name="recent" size={18} tone="ink-3" /></View>
      <View style={styles.recentText}><Text lines={1}>{item}</Text></View>
    </Pressable>)}
  </View>;
}

/** Companies whose name matches, first, then the jobs. */
function Companies({ query }: { query: string }) {
  const companies = useCompanies();
  const matches = useMemo(() => {
    const needle = query.toLowerCase();
    const seen = new Set<string>();
    return (companies.data ?? [])
      .filter((company) => company.enabled && !company.blocked && company.name.toLowerCase().includes(needle))
      // One row per company, even when it has more than one job source.
      .filter((company) => { const key = company.name.trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(needle)) - Number(!b.name.toLowerCase().startsWith(needle)))
      .slice(0, 3);
  }, [companies.data, query]);
  if (matches.length === 0) return null;
  return <View>
    <SectionHeader title={matches.length === 1 ? "Company" : "Companies"} />
    {matches.map((company) => <Pressable key={company.id} accessibilityRole="button"
      onPress={() => { rememberSearch(query); router.push({ pathname: "/(tabs)/(search)/companies/[companyId]", params: { companyId: company.id } }); }}
      style={({ pressed }) => [styles.company, pressed && styles.pressed]}>
      <CompanyLogo name={company.name} uri={logoUri(company.website)} />
      <View style={styles.recentText}>
        <Text weight="medium" lines={1}>{company.name}</Text>
        <Text role="subhead" tone="ink-2" lines={1}>{hostOf(company.website)}</Text>
      </View>
      <Icon name="disclosure" size={12} tone="ink-4" />
    </Pressable>)}
  </View>;
}

const hostOf = (website: string) => website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.ui.color.bg },
  // Jobs' header: the title under the 44 nav row.
  header: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter, paddingBottom: theme.ui.space["2"] },
  nav: { height: theme.ui.size.iconButton },
  idle: { paddingHorizontal: theme.ui.space["8"], paddingTop: theme.ui.space["10"] },
  recent: { paddingBottom: theme.ui.space["4"] },
  recentHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
    paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["4"], paddingBottom: theme.ui.space["1"],
  },
  recentRow: { flexDirection: "row", alignItems: "center", minHeight: theme.ui.size.listRow, paddingRight: theme.ui.size.gutter },
  // The clock sits centred in the 40 slot the company logos use below, so
  // it lines up with them and isn't stranded far from its text.
  recentIcon: { width: theme.ui.size.keyline, paddingLeft: theme.ui.size.gutter, paddingRight: theme.ui.space["3"], alignItems: "center" },
  recentText: { flex: 1, minWidth: 0 },
  company: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, paddingVertical: theme.ui.space["3"] },
  pressed: { opacity: 0.6 },
}));
