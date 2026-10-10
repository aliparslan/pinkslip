import { timeAgo } from "@pinkslip/core/utils";
import { useAppliedJobs, useSavedJobs } from "@pinkslip/data";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { BookmarkSimple, CheckCircle, WarningCircle } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, EmptyState, SegmentedControl, Spinner } from "../../kit";
import { JobRow } from "../jobs/JobRow";
import { useJobActions, type RowJob } from "../jobs/useJobActions";

export type LibraryView = "saved" | "applied";

/** `JobLibrary.svelte` for iOS: Saved and Applied (counts in the segmented
 * control), swipe to remove or undo an application, "Applied 3d ago". Each
 * list loads on its own, so one failing doesn't hide the other. */
export function Library({ initialView }: { initialView: LibraryView }) {
  const { theme } = useUnistyles();
  const [view, setView] = useState<LibraryView>(initialView);
  const saved = useSavedJobs();
  const applied = useAppliedJobs();
  const active = view === "saved" ? saved : applied;
  const { actions, onOpen } = useJobActions(view);
  const jobs = useMemo(() => (active.data ?? []).map((job) => (view === "saved" ? { ...job, saved: true } : { ...job, applied: true })), [active.data, view]);
  const open = (job: RowJob) => {
    onOpen(job);
    router.push({ pathname: "/(tabs)/(library)/jobs/[jobId]", params: { jobId: job.id } });
  };
  const count = (list: typeof saved) => (list.data ? ` ${list.data.length}` : "");

  const header = <View style={styles.header}>
    <SegmentedControl<LibraryView> value={view} onValueChange={setView}
      segments={[{ value: "saved", label: `Saved${count(saved)}` }, { value: "applied", label: `Applied${count(applied)}` }]} />
  </View>;

  return <FlashList data={jobs} keyExtractor={(job) => job.id} contentInsetAdjustmentBehavior="automatic" style={styles.fill}
    ListHeaderComponent={header}
    renderItem={({ item }) => <JobRow job={item} onPress={open} actions={actions}
      contextLabel={view === "applied" ? (item.applied_at ? `Applied ${timeAgo(item.applied_at)}` : "Applied") : undefined} />}
    ItemSeparatorComponent={() => <View style={styles.separator} />}
    refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => void active.refetch()} tintColor={theme.colors["ink-3"]} />}
    ListEmptyComponent={active.isPending ? <View style={styles.loading}><Spinner label="Loading your jobs" /></View>
      : active.isError ? <EmptyState icon={WarningCircle} title="Your library didn't load" message="Check your connection and try again."
        actions={<Button pending={active.isFetching} onPress={() => void active.refetch()}>Try again</Button>} />
      : view === "saved" ? <EmptyState icon={BookmarkSimple} title="No saved jobs" message="Save promising roles from their job page and they'll stay here."
        actions={<Button onPress={() => router.navigate("/")}>Browse jobs</Button>} />
      : <EmptyState icon={CheckCircle} title="No applications yet" message="Jobs you mark as applied will become your application history." />} />;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: theme.gutter, paddingTop: theme.space["2"], paddingBottom: theme.space["3"] },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: theme.gutter + 24 + theme.space["3"], backgroundColor: theme.colors.line },
  loading: { alignItems: "center", paddingVertical: 48 },
}));
