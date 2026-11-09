import { feedParams, selectedStages, type FeedSearch } from "@pinkslip/core/feed-criteria";
import { timeAgo } from "@pinkslip/core/utils";
import { CAREER_STAGE_OPTIONS } from "@pinkslip/domain/search-profile";
import { useFeed, useStats, useViewedJobs } from "@pinkslip/data";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Link, useNavigation, useRoute } from "expo-router";
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { usePullToRefresh } from "../../kit";
import {
  changedKeys, Chip, closeOpenSwipeRow, EmptyState, glyphMenuAction, Icon, JobRow, ListMotionCell, ListMotionProvider, RowPlaceholders, SectionHeader, SwipeRow, Text, toast, TopEdgeBlur, useListMotion, useRowsSwap, useTabBarScroll, useTabBarSpace, useTopEdge,
  type GlyphMenuItem, type MenuGlyph, type SwipeAction, LastInSection } from "../../ui";
import { useMotionTrial } from "../../ui/motion-trial";
import { useFeedCriteria } from "../feed/Feed";
import { setFeedSearch } from "../feed/feed-search";
import { logoUri } from "../jobs/CompanyLogo";
import { rowActions } from "../jobs/row-actions";
import { useSwipeChoices, type SwipeChoice, type SwipeChoices, type SwipeSlots } from "../jobs/swipe-choices";
import { queueable } from "./send-facts";
import { useTrack } from "../jobs/track";
import { useJobActions, type JobActions, type RowJob } from "../jobs/useJobActions";
import { HELD_BACK, useHoldingPostings } from "./arrival-demo";
import { isOffline, LoadMoreFailed, useRetryWhileOffline } from "./errors";
import { useJobPreview } from "./JobPreview";
import { rowZoomId } from "../../platform/links";
import { RowZoom, zoomParams } from "./RowZoom";
import { arrivedAtTop, feedSections, plainText, rowAge, rowFacts, sectionCount } from "./job-facts";
import { STAGES_IN_ORDER } from "./search-draft";

// The poller runs every 15 minutes; past two hours it's clearly behind.
const POLL_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

type Item = { kind: "section"; key: string; title: string; count?: number } | { kind: "job"; key: string; job: RowJob };

const jobKeys = (items: readonly Item[]) => items.filter((item) => item.kind === "job").map((item) => item.key);
const allKeys = (items: readonly Item[]) => items.map((item) => item.key);
/** New postings wait this long at most for their logos. */
const LOGOS_MS = 800;

export interface JobsFeedProps {
  /** Search results: this text over the feed's filters. */
  query?: string;
  /** The tab whose stack the job page opens on. */
  tab?: "(jobs)" | "(search)";
  onClearQuery?: () => void;
  /** Scrolls with the list, above the quick filters (the Jobs title and
   * search field). The list stays mounted while results load, so a field
   * here keeps its keyboard. Given a function, it's told when the feed is
   * offline with jobs still on screen, for the Offline pill. */
  top?: ReactNode | ((offline: boolean) => ReactNode);
  /** The quick filters: on by default, off while searching unless asked. */
  chips?: boolean;
  /** Under the last row (Jobs: "Search everything for …"). */
  after?: ReactNode;
  /** "feed" searches inside your saved search and filters; "all" searches
   * every open job (the Search tab). */
  scope?: "feed" | "all";
  /** The Search tab before you type (recent searches): shown in the jobs'
   * place under `top`, with nothing fetched, so the field stays put. */
  idle?: ReactNode;
}

/**
 * Jobs, redesigned (Take A): the feed grouped into "New today" and "Earlier
 * this week", three-line rows, and quick filters at the top. The Search tab
 * shows the same list for its query. Rows keep today's full swipes and
 * long-press menu.
 */
export function JobsFeed({ query, tab = "(jobs)", onClearQuery, top, chips, after, scope = "feed", idle }: JobsFeedProps = {}) {
  const { theme } = useUnistyles();
  const { height } = useWindowDimensions();
  const tabSpace = useTabBarSpace();
  // Tapping the current tab again scrolls back to the top.
  const list = useRef<FlashListRef<Item>>(null);
  const edge = useTopEdge();
  const tabBarScroll = useTabBarScroll(list, edge);
  const criteria = useFeedCriteria();
  const { preferences, available, defaults } = criteria;
  const searching = query !== undefined;
  const search = useMemo<FeedSearch>(() => ({ ...criteria.search, q: searching && query.trim() ? query : undefined }), [searching, criteria.search, query]);
  const params = useMemo(() => (scope === "all" ? { q: search.q, scope: "all" as const } : feedParams(search, available, defaults)), [scope, search, available, defaults]);
  const waiting = idle !== undefined && !search.q;
  // When the search shows only one level, the rows needn't say it.
  const onlyStage = useMemo(() => {
    if (scope !== "feed") return undefined;
    const stages = selectedStages(search, available);
    return stages.length === 1 ? stages[0] : undefined;
  }, [scope, search, available]);
  // A chip or a search keeps the rows on screen until the new ones arrive.
  const feed = useFeed(params, preferences.isSuccess && !waiting, { keepPrevious: true });
  const stats = useStats();
  const viewed = useViewedJobs();
  const { actions, onOpen } = useJobActions("feed");
  const track = useTrack();

  // Kit's "postings arrive on your list" holds the top rows back for a moment.
  const holding = useHoldingPostings() && scope === "feed" && !searching;
  const jobs = useMemo(() => {
    const all = waiting ? [] : feed.data?.pages.flatMap((page) => page.jobs) ?? [];
    return holding ? all.slice(HELD_BACK) : all;
  }, [waiting, feed.data, holding]);
  const matching = feed.data?.pages[0]?.meta.matching;
  const latest = useMemo(() => {
    const sections = feedSections(jobs);
    return sections.flatMap<Item>((section, index) => [
      { kind: "section", key: `section-${section.title}`, title: section.title, count: sectionCount(sections, index, feed.hasNextPage, matching) },
      ...section.jobs.map((job): Item => ({ kind: "job", key: job.id, job })),
    ]);
  }, [jobs, feed.hasNextPage, matching]);
  // Under a job's page the rows hold still, so going back zooms into the row
  // it grew from, and whatever changed meanwhile arrives once it has landed.
  const { steady: items, justReleased } = useSteadyUnderPage(latest);

  // Postings new since you looked arrive at the top: the rows you've seen
  // make room and uncover them (Kit → Motion fixes). Only a refresh of the
  // same list does this; a chip or a search swaps rows with no entrance.
  const arrives = useMotionTrial("jobsArrive");
  const [held, setHeld] = useState<{ items: Item[]; changing: ReadonlySet<string>; logos: string[] } | null>(null);
  const last = useRef({ items, params, fetching: feed.isFetching, holding });
  if (last.current.items !== items) {
    const previous = last.current;
    last.current = { items, params, fetching: feed.isFetching, holding };
    const arrived = arrives && (previous.fetching || previous.holding || justReleased) && previous.params === params && !feed.isPlaceholderData ? arrivedAtTop(jobKeys(previous.items), jobKeys(items)) : 0;
    if (arrived > 0) {
      const fresh = items.filter((item): item is Extract<Item, { kind: "job" }> => item.kind === "job").slice(0, arrived);
      setHeld({ items: previous.items, changing: changedKeys(allKeys(previous.items), allKeys(items)), logos: fresh.flatMap((item) => logoUri(item.job.company_domain) ?? []) });
    }
  } else {
    last.current.fetching = feed.isFetching;
    last.current.holding = holding;
  }
  // Which list the chips and filters asked for. Typing a search narrows the
  // same list, so it goes straight through.
  const listAsked = useMemo(() => JSON.stringify({ ...params, q: undefined }), [params]);
  const { rows: shown, fade: rowsFade } = useRowsSwap(held?.items ?? items, listAsked, feed.isPlaceholderData);
  const aroundRows = useAnimatedStyle(() => ({ opacity: rowsFade.value }));
  const keys = useMemo(() => allKeys(shown), [shown]);
  const { play, value: listChange } = useListMotion(keys);
  useEffect(() => {
    if (!held) return;
    let live = true;
    const go = () => {
      if (!live) return;
      live = false;
      play(held.changing, () => {
        list.current?.prepareForLayoutAnimationRender();
        setHeld(null);
      });
    };
    // Nobody's waiting on these, so their logos can land with them.
    void Promise.all(held.logos.map((uri) => Image.prefetch(uri).catch(() => false))).then(go);
    const timer = setTimeout(go, LOGOS_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [held, play]);

  // One "displayed" event per fresh first page, as the web sends.
  const firstPageAt = feed.data?.pages.length === 1 ? feed.dataUpdatedAt : 0;
  const firstPageCount = feed.data?.pages[0]?.jobs.length ?? 0;
  useEffect(() => {
    if (firstPageAt && firstPageCount > 0) track("job_displayed", { type: "feed", properties: { count: firstPageCount } });
  }, [firstPageAt, firstPageCount, track]);

  // Offline with jobs on screen, the Offline pill says so (P1); a refresh
  // that failed online is the toast (P2). Never both.
  const offline = feed.isRefetchError && isOffline(feed.error);
  useEffect(() => {
    if (feed.isRefetchError && !isOffline(feed.error)) toast.error("Couldn't refresh jobs.", { dedupeKey: "feed-refresh" });
  }, [feed.isRefetchError, feed.error]);
  // Nothing loaded and no connection (W1): no button; it loads once you're back.
  const emptyOffline = feed.isError && !feed.data && isOffline(feed.error);
  useRetryWhileOffline(emptyOffline || offline, () => void feed.refetch());
  const [moreFailed, setMoreFailed] = useState(false);

  const refresh = async () => { await Promise.all([feed.refetch(), stats.refetch()]); };
  const pull = usePullToRefresh(refresh);
  const loadMore = () => {
    if (!feed.hasNextPage || feed.isFetchingNextPage || feed.isPlaceholderData) return;
    setMoreFailed(false);
    // The next page failing says so at the list's end (P3), not in a toast.
    void feed.fetchNextPage().then((result) => setMoreFailed(result.isFetchNextPageError));
  };

  const lastPolled = stats.data?.lastPolled;
  const stale = Boolean(lastPolled && Date.now() - new Date(lastPolled).getTime() > POLL_STALE_AFTER_MS);
  const header = <View>
    {typeof top === "function" ? top(offline) : top}
    {(chips ?? !searching) ? <QuickFilters search={search} stages={available} /> : null}
    {stale && lastPolled ? <View style={styles.stale}>
      <Icon name="warning" size={16} tone="ink-3" />
      <Text role="footnote" tone="ink-2">Updated {timeAgo(lastPolled)}. New jobs may be missing.</Text>
    </View> : null}
  </View>;

  const refined = Boolean(search.loc || search.min || search.max || search.stage || search.listing || search.saved);
  return <>
  <ListMotionProvider value={listChange} fade={rowsFade}>
  <FlashList ref={list} {...tabBarScroll} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" data={shown} keyExtractor={(item) => item.key} getItemType={(item) => item.kind}
    CellRendererComponent={ListMotionCell}
    contentInsetAdjustmentBehavior="automatic" style={styles.fill} ListHeaderComponent={header}
    contentContainerStyle={{ paddingBottom: tabSpace }}
    // FlashList keeps the row you were looking at in place when the data
    // changes, so a chip that brought that row into a new list scrolled you
    // down to it (owner, 2026-11-07). The list stays where it is instead.
    maintainVisibleContentPosition={NO_ANCHOR}
    renderItem={({ item, index }) => item.kind === "section"
      ? <SectionHeader title={item.title} count={item.count} first={index === 0} />
      : <LastInSection.Provider value={shown[index + 1]?.kind !== "job"}><FeedRow job={item.job} viewed={Boolean(viewed.data?.has(item.job.id))} actions={actions} tab={tab} onOpen={onOpen} onlyStage={onlyStage} /></LastInSection.Provider>}
    onEndReached={loadMore} onEndReachedThreshold={0.6} onScrollBeginDrag={closeOpenSwipeRow}
    // Always there: adding or removing it rebuilds the list's content on iOS,
    // and Jobs' field in the header would lose its keyboard.
    refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={waiting ? noop : pull.onRefresh} tintColor={theme.ui.color["ink-3"]} />}
    ListFooterComponent={jobs.length > 0 ? <Animated.View style={aroundRows}>
      {after}
      <View style={styles.footer}>
        {moreFailed ? <LoadMoreFailed onRetry={loadMore} />
          : feed.hasNextPage ? <ActivityIndicator color={theme.ui.color["ink-3"]} /> : <Text role="footnote" tone="ink-3">You're all caught up. Go touch grass.</Text>}
      </View>
    </Animated.View> : null}
    ListEmptyComponent={waiting ? <>{idle}</> : feed.isPending ? <RowPlaceholders />
      // Search's own field clears it and its X leaves, so no third button,
      // and a line under the companies rather than a big empty state that
      // sat down by the field (owner, 2026-11-08: "Clear search" and two Xs).
      : scope === "all" && search.q && !feed.isError ? <View style={styles.quiet}><Text role="subhead" tone="ink-2" align="center">No jobs match</Text></View>
      : <Animated.View style={[styles.empty, { minHeight: height * 0.5 }, aroundRows]}>
      {emptyOffline
        ? <EmptyState title="You're offline" message="Jobs will be here when you're back." />
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
    </Animated.View>} />
  </ListMotionProvider>
  <TopEdgeBlur under={edge.under} />
  </>;
}

const noop = () => undefined;
const NO_ANCHOR = { disabled: true };

/** How long a page takes to zoom back into its row. */
const ZOOM_BACK_MS = 700;

/**
 * `latest`, held still from when a page opens over this list until it has
 * zoomed away. The page opening or closing renders nothing here unless the
 * list really changed meanwhile: a zoom shouldn't share its first frames
 * with a render of every row.
 */
function useSteadyUnderPage<T>(latest: T): { steady: T; justReleased: boolean } {
  const navigation = useNavigation();
  const route = useRoute();
  const over = useRef(false);
  const steady = useRef(latest);
  const newest = useRef(latest);
  const released = useRef(false);
  const [, render] = useReducer((count: number) => count + 1, 0);
  newest.current = latest;
  if (!over.current) steady.current = latest;
  useEffect(() => {
    let settling: ReturnType<typeof setTimeout> | undefined;
    const stopBlur = navigation.addListener("blur", () => {
      clearTimeout(settling);
      // Another tab leaves this list on top of its own stack: nothing to hold.
      const state = navigation.getState();
      if (state && state.routes[state.index]?.key !== route.key) over.current = true;
    });
    const stopFocus = navigation.addListener("focus", () => {
      clearTimeout(settling);
      settling = setTimeout(() => {
        over.current = false;
        if (newest.current === steady.current) return;
        released.current = true;
        render();
      }, ZOOM_BACK_MS);
    });
    return () => {
      clearTimeout(settling);
      stopBlur();
      stopFocus();
    };
  }, [navigation, route.key]);
  const justReleased = released.current;
  released.current = false;
  return { steady: steady.current, justReleased };
}

/** A row opens its job; long-press peeks at it with the row's actions under
 * the preview (a native context menu, so no extra view per row). Exported for
 * the kit's swipe lab, which runs it on sample jobs. */
export function FeedRow({ job, viewed, actions, tab, onOpen, onlyStage }: {
  job: RowJob; viewed: boolean; actions: JobActions; tab: string; onOpen: (job: RowJob) => void;
  /** The one level the search shows, which the row leaves out. */
  onlyStage?: Parameters<typeof rowFacts>[1];
}) {
  const { menu } = rowActions(job, actions, viewed);
  const { leading, trailing } = swipeActions(job, actions, viewed, useSwipeChoices());
  const preview = useJobPreview(job, viewed ? undefined : () => onOpen(job));
  // The page grows out of the row (Paper "Signature moments · Nov 8", 1).
  const zoom = useMotionTrial("zoom");
  const zoomId = rowZoomId(tab, job.id);
  // A flip of the switch changes what the native link wraps, and iOS then
  // draws the row blank. A new key builds the link afresh instead.
  const setup = zoom ? "zoom" : "none";
  const row = <JobRow title={plainText(job.title)} company={plainText(job.company_name)} facts={rowFacts(job, onlyStage)} age={rowAge(job)}
        stage={job.applied ? "applied" : job.saved ? "saved" : undefined}
        unread={!viewed}
        logo={{ name: job.company_name, uri: logoUri(job.company_domain) }}
        actions={menu.map((item) => ({ id: item.id, label: item.title, run: item.onSelect }))} />;
  return <SwipeRow id={job.id} leading={leading} trailing={trailing}>
    <Link key={setup} href={{ pathname: `/(tabs)/${tab}/jobs/[jobId]` as "/(tabs)/(jobs)/jobs/[jobId]", params: { jobId: job.id, ...(zoom ? zoomParams(zoomId) : {}) } }} asChild onPress={() => onOpen(job)}>
      <Link.Trigger>
        {zoom ? <RowZoom id={zoomId}>{row}</RowZoom> : row}
      </Link.Trigger>
      <Link.Preview style={preview.style}>{preview.content}</Link.Preview>
      <Link.Menu>
        {menu.filter((item) => !item.destructive).map((item) => glyphMenuAction(item))}
        {menu.some((item) => item.destructive) ? <Link.Menu inline title="">
          {menu.filter((item) => item.destructive).map((item) => glyphMenuAction(item))}
        </Link.Menu> : null}
      </Link.Menu>
    </Link>
  </SwipeRow>;
}

/** The swipes, as chosen in You → Swipe actions (owner, 2026-11-08, Paper
 * "Choosing swipe actions · Nov 8", B; as Paper "Swipe actions · Oct 14"
 * S4 until changed: right is Save, then Read; left is Hide, then Applied).
 * Each follows the job (Save is Unsave once saved), the outer one runs on a
 * full swipe, and one the job can't take leaves the other alone, except
 * Queue, which is never the full swipe. Everything else is in the
 * long-press menu. */
function swipeActions(job: RowJob, actions: JobActions, viewed: boolean, choices: SwipeChoices): { leading: SwipeAction[]; trailing: SwipeAction[] } {
  const build = (choice: SwipeChoice): SwipeAction | null => {
    switch (choice) {
      case "save":
        if (job.saved) return actions.unsave ? { id: "unsave", label: "Unsave", icon: "saved", tone: "neutral", run: () => actions.unsave?.(job) } : null;
        return actions.save ? { id: "save", label: "Save", icon: "save", tone: "accent", run: () => actions.save?.(job) } : null;
      case "read":
        if (!actions.toggleRead) return null;
        return viewed
          ? { id: "unread", label: "Unread", icon: "unread", tone: "find", run: () => actions.toggleRead?.(job, false) }
          : { id: "read", label: "Read", icon: "read", tone: "find", run: () => actions.toggleRead?.(job, true) };
      case "applied":
        if (job.applied) return actions.unmarkApplied ? { id: "unapplied", label: "Not applied", icon: "undo", tone: "neutral", run: () => actions.unmarkApplied?.(job) } : null;
        // An applied job leaves Jobs and Search for Tracker, so it slides out
        // as Hide does rather than going home and vanishing (owner, 2026-11-08).
        return actions.markApplied ? { id: "applied", label: "Applied", icon: "applied", tone: "apply", removes: true, run: () => actions.markApplied?.(job) } : null;
      case "hide":
        return actions.hide ? { id: "hide", label: "Hide", icon: "hide", tone: "neutral", removes: true, run: () => actions.hide?.(job) } : null;
      case "queue":
        return actions.applyForMe && queueable(job) ? { id: "queue", label: "Queue", icon: "autoApply", tone: "queue", run: () => actions.applyForMe?.(job) } : null;
    }
  };
  const side = ([outerChoice, innerChoice]: SwipeSlots): SwipeAction[] => {
    const outer = build(outerChoice);
    const inner = innerChoice ? build(innerChoice) : null;
    if (outer) return inner ? [outer, inner] : [outer];
    // Alone, the inner one becomes the full swipe; Queue never does.
    return inner && innerChoice !== "queue" ? [inner] : [];
  };
  return { leading: side(choices.right), trailing: side(choices.left) };
}

/** In Your search's order. */
const stageRank = (id: string) => { const rank = (STAGES_IN_ORDER as readonly string[]).indexOf(id); return rank < 0 ? STAGES_IN_ORDER.length : rank; };
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
    {stages.length > 1 ? [...stages].sort((a, b) => stageRank(a) - stageRank(b)).map((stage) =>
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
  quiet: { paddingHorizontal: theme.ui.space["8"], paddingTop: theme.ui.space["6"] },
}));
