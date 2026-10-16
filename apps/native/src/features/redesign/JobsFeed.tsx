import { feedParams, type FeedSearch } from "@pinkslip/core/feed-criteria";
import { timeAgo } from "@pinkslip/core/utils";
import { CAREER_STAGE_OPTIONS } from "@pinkslip/domain/search-profile";
import { useFeed, useStats, useViewedJobs } from "@pinkslip/data";
import { FlashList } from "@shopify/flash-list";
import { Link } from "expo-router";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { toast, usePullToRefresh } from "../../kit";
import { Chip, closeOpenSwipeRow, EmptyState, Icon, JobRow, SectionHeader, SwipeRow, Text, useTabBarScroll, useTabBarSpace, type SwipeAction } from "../../ui";
import { useFeedCriteria } from "../feed/Feed";
import { setFeedSearch } from "../feed/feed-search";
import { logoUri } from "../jobs/CompanyLogo";
import { rowActions } from "../jobs/row-actions";
import { useTrack } from "../jobs/track";
import { useJobActions, type JobActions, type RowJob } from "../jobs/useJobActions";
import { feedSections, plainText, rowAge, rowFacts } from "./job-facts";

// The poller runs every 15 minutes; past two hours it's clearly behind.
const POLL_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

type Item = { kind: "section"; key: string; title: string; count?: number } | { kind: "job"; key: string; job: RowJob };

export interface JobsFeedProps {
  /** Search results: this text over the feed's filters. */
  query?: string;
  /** The tab whose stack the job page opens on. */
  tab?: "(jobs)" | "(search)";
  onClearQuery?: () => void;
  /** Scrolls with the list, above the quick filters (the Jobs title and
   * search field). The list stays mounted while results load, so a field
   * here keeps its keyboard. */
  top?: ReactNode;
  /** The quick filters: on by default, off while searching unless asked. */
  chips?: boolean;
  /** Under the last row (Jobs: "Search everything for …"). */
  after?: ReactNode;
  /** "feed" searches inside your saved search and filters; "all" searches
   * every open job (the Search tab). */
  scope?: "feed" | "all";
}

/**
 * Jobs, redesigned (Take A): the feed grouped into "New today" and "Earlier
 * this week", three-line rows, and quick filters at the top. The Search tab
 * shows the same list for its query. Rows keep today's full swipes and
 * long-press menu.
 */
export function JobsFeed({ query, tab = "(jobs)", onClearQuery, top, chips, after, scope = "feed" }: JobsFeedProps = {}) {
  const { theme } = useUnistyles();
  const { height } = useWindowDimensions();
  const tabSpace = useTabBarSpace();
  // Tapping the current tab again scrolls back to the top.
  const list = useRef(null);
  const tabBarScroll = useTabBarScroll(list);
  const criteria = useFeedCriteria();
  const { preferences, available, defaults } = criteria;
  const searching = query !== undefined;
  const search = useMemo<FeedSearch>(() => ({ ...criteria.search, q: searching && query.trim() ? query : undefined }), [searching, criteria.search, query]);
  const params = useMemo(() => (scope === "all" ? { q: search.q } : feedParams(search, available, defaults)), [scope, search, available, defaults]);
  const feed = useFeed(params, preferences.isSuccess);
  const stats = useStats();
  const viewed = useViewedJobs();
  const { actions, onOpen } = useJobActions("feed");
  const track = useTrack();

  const jobs = useMemo(() => feed.data?.pages.flatMap((page) => page.jobs) ?? [], [feed.data]);
  const items = useMemo(() => {
    const sections = feedSections(jobs);
    return sections.flatMap<Item>((section, index) => [
      // The last section is still filling while more pages are left, so it has no count yet.
      { kind: "section", key: `section-${section.title}`, title: section.title,
        count: index === sections.length - 1 && feed.hasNextPage ? undefined : section.jobs.length },
      ...section.jobs.map((job): Item => ({ kind: "job", key: job.id, job })),
    ]);
  }, [jobs, feed.hasNextPage]);

  // One "displayed" event per fresh first page, as the web sends.
  const firstPageAt = feed.data?.pages.length === 1 ? feed.dataUpdatedAt : 0;
  const firstPageCount = feed.data?.pages[0]?.jobs.length ?? 0;
  useEffect(() => {
    if (firstPageAt && firstPageCount > 0) track("job_displayed", { type: "feed", properties: { count: firstPageCount } });
  }, [firstPageAt, firstPageCount, track]);

  useEffect(() => {
    if (feed.isRefetchError) toast.error("Couldn't refresh jobs.", { dedupeKey: "feed-refresh" });
  }, [feed.isRefetchError]);

  const refresh = async () => { await Promise.all([feed.refetch(), stats.refetch()]); };
  const pull = usePullToRefresh(refresh);
  const loadMore = () => {
    if (!feed.hasNextPage || feed.isFetchingNextPage) return;
    void feed.fetchNextPage().then((result) => {
      if (result.isFetchNextPageError) toast.error("Couldn't load more jobs.", { dedupeKey: "feed-more", action: { label: "Retry", run: () => void feed.fetchNextPage() } });
    });
  };

  const lastPolled = stats.data?.lastPolled;
  const stale = Boolean(lastPolled && Date.now() - new Date(lastPolled).getTime() > POLL_STALE_AFTER_MS);
  const header = <View>
    {top}
    {(chips ?? !searching) ? <QuickFilters search={search} stages={available} /> : null}
    {stale && lastPolled ? <View style={styles.stale}>
      <Icon name="warning" size={16} tone="ink-3" />
      <Text role="footnote" tone="ink-2">Updated {timeAgo(lastPolled)}. New jobs may be missing.</Text>
    </View> : null}
  </View>;

  const refined = Boolean(search.loc || search.min || search.max || search.stage || search.listing || search.saved);
  return <FlashList ref={list} {...tabBarScroll} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" data={items} keyExtractor={(item) => item.key} getItemType={(item) => item.kind}
    contentInsetAdjustmentBehavior="automatic" style={styles.fill} ListHeaderComponent={header}
    contentContainerStyle={{ paddingBottom: tabSpace }}
    renderItem={({ item, index }) => item.kind === "section"
      ? <SectionHeader title={item.title} count={item.count} first={index === 0} />
      : <FeedRow job={item.job} viewed={Boolean(viewed.data?.has(item.job.id))} actions={actions} tab={tab} onOpen={onOpen} />}
    onEndReached={loadMore} onEndReachedThreshold={0.6} onScrollBeginDrag={closeOpenSwipeRow}
    refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={theme.ui.color["ink-3"]} />}
    ListFooterComponent={jobs.length > 0 ? <>
      {after}
      <View style={styles.footer}>
        {feed.hasNextPage ? <ActivityIndicator color={theme.ui.color["ink-3"]} /> : <Text role="footnote" tone="ink-3">You're all caught up. Go touch grass.</Text>}
      </View>
    </> : null}
    ListEmptyComponent={<View style={[styles.empty, { minHeight: height * 0.5 }]}>
      {feed.isPending ? <ActivityIndicator color={theme.ui.color["ink-3"]} />
        : feed.isError && !feed.data
        ? <EmptyState title="Jobs didn't load" message="Check your connection and try again."
          action={{ label: "Try again", variant: "secondary", pending: feed.isFetching, onPress: () => void feed.refetch() }} />
        : search.q
        ? <EmptyState title="No matches" message="Try a different company, title or city."
          action={{ label: "Clear search", variant: "secondary", onPress: () => (onClearQuery ? onClearQuery() : setFeedSearch({ ...search, q: undefined })) }} />
        : <EmptyState title={refined ? "Nothing matches these filters" : "No jobs right now"}
          message={refined ? undefined : "New roles show up here as they're posted."}
          action={refined
            ? { label: "Clear filters", variant: "secondary", onPress: () => setFeedSearch({}) }
            : { label: "Refresh", variant: "secondary", icon: "refresh", pending: feed.isRefetching, onPress: () => void refresh() }} />}
    </View>} />;
}

/** A row opens its job; long-press peeks at it with the row's actions under
 * the preview (a native context menu, so no extra view per row). */
function FeedRow({ job, viewed, actions, tab, onOpen }: { job: RowJob; viewed: boolean; actions: JobActions; tab: string; onOpen: (job: RowJob) => void }) {
  const { menu } = rowActions(job, actions, viewed);
  const { leading, trailing } = swipeActions(job, actions, viewed);
  return <SwipeRow id={job.id} leading={leading} trailing={trailing}>
    <Link href={{ pathname: `/(tabs)/${tab}/jobs/[jobId]` as "/(tabs)/(jobs)/jobs/[jobId]", params: { jobId: job.id } }} asChild onPress={() => onOpen(job)}>
      <Link.Trigger>
        <JobRow title={plainText(job.title)} company={plainText(job.company_name)} facts={rowFacts(job)} age={rowAge(job)}
          stage={job.applied ? "applied" : job.saved ? "saved" : undefined}
          unread={!viewed}
          logo={{ name: job.company_name, uri: logoUri(job.company_domain) }}
          actions={menu.map((item) => ({ id: item.id, label: item.title, run: item.onSelect }))} />
      </Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        {menu.map((item) => <Link.MenuAction key={item.id} destructive={item.destructive} onPress={item.onSelect}>{item.title}</Link.MenuAction>)}
      </Link.Menu>
    </Link>
  </SwipeRow>;
}

/** The swipes (Paper "Swipe actions · Oct 14", S4, owner 2026-10-14):
 * right is Save, all the way, then Read or Unread; left is Hide, all the
 * way, then Applied. Everything else is in the long-press menu. */
function swipeActions(job: RowJob, actions: JobActions, viewed: boolean): { leading: SwipeAction[]; trailing: SwipeAction[] } {
  const leading: SwipeAction[] = [];
  const trailing: SwipeAction[] = [];
  if (job.saved && actions.unsave) leading.push({ id: "unsave", label: "Unsave", icon: "saved", tone: "neutral", run: () => actions.unsave?.(job) });
  else if (!job.saved && actions.save) leading.push({ id: "save", label: "Save", icon: "save", tone: "accent", run: () => actions.save?.(job) });
  if (actions.toggleRead) {
    leading.push(viewed
      ? { id: "unread", label: "Unread", icon: "unread", tone: "find", run: () => actions.toggleRead?.(job, false) }
      : { id: "read", label: "Read", icon: "read", tone: "find", run: () => actions.toggleRead?.(job, true) });
  }
  if (actions.hide) trailing.push({ id: "hide", label: "Hide", icon: "hide", tone: "neutral", removes: true, run: () => actions.hide?.(job) });
  if (job.applied && actions.unmarkApplied) trailing.push({ id: "unapplied", label: "Not applied", icon: "undo", tone: "neutral", run: () => actions.unmarkApplied?.(job) });
  else if (!job.applied && actions.markApplied) trailing.push({ id: "applied", label: "Applied", icon: "applied", tone: "apply", run: () => actions.markApplied?.(job) });
  return { leading, trailing };
}

const stageLabel = (id: string) => CAREER_STAGE_OPTIONS.find((option) => option.id === id)?.label.replace(/ \(.*\)$/, "") ?? id;

/** One tap each: Remote, $100K+, and a chip per stage when the search covers
 * more than one. Everything else is in Edit search. */
function QuickFilters({ search, stages }: { search: FeedSearch; stages: readonly string[] }) {
  const toggle = (key: "loc" | "min" | "stage", value: string | number) => {
    const next: FeedSearch = { ...search };
    if (next[key] === value) delete next[key];
    else Object.assign(next, { [key]: value });
    setFeedSearch(next);
  };
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
    <Chip label="Remote" selected={search.loc === "remote"} onPress={() => toggle("loc", "remote")} />
    <Chip label="$100K+" selected={search.min === 100} onPress={() => toggle("min", 100)} />
    {stages.length > 1 ? stages.map((stage) =>
      <Chip key={stage} label={stageLabel(stage)} selected={search.stage === stage} onPress={() => toggle("stage", stage)} />) : null}
  </ScrollView>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  chips: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["2"], paddingBottom: theme.ui.space["2"] },
  stale: {
    flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"],
    marginHorizontal: theme.ui.size.gutter, marginTop: theme.ui.space["2"],
  },
  footer: { alignItems: "center", paddingTop: theme.ui.space["8"], paddingBottom: theme.ui.space["10"] },
  // Centred in the room under the header, not tucked under it.
  empty: { justifyContent: "center" },
}));
