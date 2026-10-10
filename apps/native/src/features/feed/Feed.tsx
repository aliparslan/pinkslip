import { useFeed } from "@pinkslip/data";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { EmptyState, Spinner, Text } from "../../kit";

/** 6-A scaffold: the feed's titles, to prove data and navigation. 6.4
 * replaces it with the job rows, filters and search. */
export function Feed() {
  const feed = useFeed({});
  const jobs = feed.data?.pages.flatMap((page) => page.jobs) ?? [];
  if (feed.isPending) return <View style={styles.center}><Spinner label="Loading jobs" /></View>;
  return <FlashList data={jobs} keyExtractor={(job) => job.id} contentInsetAdjustmentBehavior="automatic"
    ListEmptyComponent={<EmptyState title="No jobs yet" />}
    renderItem={({ item }) => <Pressable onPress={() => router.push(`/jobs/${item.id}`)} style={styles.row}>
      <Text size="sm" tone="ink-3">{item.company_name}</Text>
      <Text weight="medium">{item.title}</Text>
    </Pressable>} />;
}

const styles = StyleSheet.create((theme) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bg },
  row: { paddingHorizontal: theme.gutter, paddingVertical: theme.space["3"], gap: 2 },
}));
