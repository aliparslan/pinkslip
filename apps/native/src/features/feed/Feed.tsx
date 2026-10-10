import { availableStages, feedParams, filterCount, profileLocations, withoutRefinements } from "@pinkslip/core/feed-criteria";
import { timeAgo } from "@pinkslip/core/utils";
import { useFeed, usePreferences, useStats, useViewedJobs } from "@pinkslip/data";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { ArrowClockwise, Funnel, MagnifyingGlass, WarningCircle } from "phosphor-react-native";
import { useEffect, useMemo } from "react";
import { RefreshControl, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, EmptyState, Inline, Skeleton, Spinner, Text, toast } from "../../kit";
import { JobRow } from "../jobs/JobRow";
import { RowSeparator } from "../jobs/RowSeparator";
import { useJobActions, type RowJob } from "../jobs/useJobActions";
import { useTrack } from "../jobs/track";
import { setFeedSearch, useFeedSearch } from "./feed-search";
import { SetupPrompt } from "./SetupPrompt";

// The poller runs every 15 minutes; past two hours it's clearly behind.
const POLL_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** The filters' shared inputs: the profile's stages and metros. */
export function useFeedCriteria() {
  const search = useFeedSearch();
  const preferences = usePreferences();
  const profile = preferences.data?.search_profile;
  const available = useMemo(() => availableStages(profile?.target_levels), [profile?.target_levels]);
  const defaults = useMemo(() => profileLocations(profile), [profile]);
  return { search, preferences, profile, available, defaults, filters: filterCount(search, available, defaults) };
}

/**
 * `Feed.svelte` for iOS: the personalized feed for the committed filters
 * (search in the navigation bar, the filter sheet from its button), with
 * pull to refresh, more as you scroll, the poller's staleness notice, and
 * the same empty states as the web.
 */
export function Feed() {
  const { theme } = useUnistyles();
  const { search, preferences, profile, available, defaults, filters } = useFeedCriteria();
  const params = useMemo(() => feedParams(search, available, defaults), [search, available, defaults]);
  const feed = useFeed(params, preferences.isSuccess);
  const stats = useStats();
  const viewed = useViewedJobs();
  const { actions, onOpen } = useJobActions("feed");
  const track = useTrack();

  const jobs = useMemo(() => feed.data?.pages.flatMap((page) => page.jobs) ?? [], [feed.data]);

  // One "displayed" event per fresh first page, as the web sends.
  const firstPageAt = feed.data?.pages.length === 1 ? feed.dataUpdatedAt : 0;
  const firstPageCount = feed.data?.pages[0]?.jobs.length ?? 0;
  useEffect(() => {
    if (firstPageAt && firstPageCount > 0) track("job_displayed", { type: "feed", properties: { count: firstPageCount } });
  }, [firstPageAt, firstPageCount, track]);

  useEffect(() => {
    if (feed.isRefetchError) toast.error("Couldn't refresh jobs.", { dedupeKey: "feed-refresh" });
  }, [feed.isRefetchError]);

  const open = (job: RowJob) => {
    onOpen(job);
    router.push({ pathname: "/(tabs)/(jobs)/jobs/[jobId]", params: { jobId: job.id } });
  };
  const refresh = async () => { await Promise.all([feed.refetch(), stats.refetch()]); };
  const loadMore = () => {
    if (!feed.hasNextPage || feed.isFetchingNextPage) return;
    void feed.fetchNextPage().then((result) => {
      if (result.isFetchNextPageError) toast.error("Couldn't load more jobs.", { dedupeKey: "feed-more", action: { label: "Retry", run: () => void feed.fetchNextPage() } });
    });
  };

  const lastPolled = stats.data?.lastPolled;
  const pollStale = Boolean(lastPolled && Date.now() - new Date(lastPolled).getTime() > POLL_STALE_AFTER_MS);
  const refinements = filters - (search.saved ? 1 : 0);
  const needsSetup = Boolean(profile && !profile.onboarding_completed_at);

  const header = <View style={styles.header}>
    {needsSetup && <SetupPrompt />}
    {pollStale && lastPolled && <View style={styles.stale}>
      <WarningCircle size={16} color={theme.colors.warn} />
      <Text size="sm" tone="ink-2">Results may be stale · updated {timeAgo(lastPolled)}</Text>
    </View>}
  </View>;

  if (feed.isPending) return <View style={styles.fill}><FlashList data={[0, 1, 2, 3, 4, 5]} renderItem={() => <SkeletonRow />}
    contentInsetAdjustmentBehavior="automatic" ListHeaderComponent={header} /></View>;
  if (feed.isError && !feed.data) {
    return <View style={styles.center}><EmptyState icon={WarningCircle} title="Jobs didn't load" message="Check your connection and try again."
      actions={<Button pending={feed.isFetching} onPress={() => void feed.refetch()}>Try again</Button>} /></View>;
  }

  return <FlashList data={jobs} keyExtractor={(job) => job.id} contentInsetAdjustmentBehavior="automatic" style={styles.fill}
    ListHeaderComponent={header}
    renderItem={({ item }) => <JobRow job={item} viewed={viewed.data?.has(item.id)} onPress={open} actions={actions} />}
    ItemSeparatorComponent={RowSeparator}
    onEndReached={loadMore} onEndReachedThreshold={0.6}
    refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void refresh()} tintColor={theme.colors["ink-3"]} />}
    ListFooterComponent={jobs.length > 0 ? <View style={styles.footer}>
      {feed.hasNextPage ? <Spinner label="Loading more jobs" /> : <Text size="sm" tone="ink-4">You're all caught up. Go touch grass.</Text>}
    </View> : null}
    ListEmptyComponent={search.q && refinements === 0
      ? <EmptyState icon={MagnifyingGlass} title="No matches" message="Try a different company, title or city."
        actions={<Button onPress={() => setFeedSearch({ ...search, q: undefined })}>Clear search</Button>} />
      : <EmptyState icon={refinements > 0 ? Funnel : undefined}
        title={refinements > 0 ? (search.saved ? "No saved jobs match your filters" : "No jobs match your filters") : search.saved ? "No saved jobs yet" : "No jobs right now"}
        message={refinements > 0 ? "Try widening or clearing your filters." : search.saved ? "Save roles from the job page to keep them handy." : "New roles show up here as they're posted."}
        actions={<Inline gap="2">
          {refinements > 0 && <Button onPress={() => setFeedSearch(withoutRefinements(search))}>Clear filters</Button>}
          <Button icon={ArrowClockwise} pending={feed.isRefetching} onPress={() => void refresh()}>Refresh now</Button>
        </Inline>} />} />;
}

function SkeletonRow() {
  return <View style={styles.skeleton} accessibilityElementsHidden>
    <Skeleton width={24} height={24} />
    <View style={styles.skeletonCopy}><Skeleton width="38%" height={11} /><Skeleton width="72%" height={16} /><Skeleton width="54%" height={12} /></View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, justifyContent: "center", backgroundColor: theme.colors.bg },
  header: { gap: theme.space["3"], paddingHorizontal: theme.gutter, paddingTop: theme.space["2"] },
  stale: {
    flexDirection: "row", alignItems: "center", gap: theme.space["2"], padding: theme.space["3"],
    borderRadius: theme.radius.md, backgroundColor: theme.colors["bg-elev"],
  },
  footer: { alignItems: "center", paddingVertical: theme.space["8"], paddingBottom: theme.space["10"] },
  skeleton: { flexDirection: "row", gap: theme.space["3"], paddingHorizontal: theme.gutter, paddingVertical: theme.space["4"] },
  skeletonCopy: { flex: 1, gap: theme.space["2"] },
}));
