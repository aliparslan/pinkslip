import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, Funnel, MagnifyingGlass, SlidersHorizontal, Sparkle, WarningCircle, X } from "@phosphor-icons/react";
import { ONBOARDING_VERSION } from "@pinkslip/domain/search-profile";
import { timeAgo } from "@pinkslip/core/utils";
import { useFeed, usePreferences, usePublicJobs, useStats, useViewedJobs } from "@pinkslip/data";
import { Alert, Badge, Button, EmptyState, Heading, IconButton, SearchInput, Skeleton, Spinner, Text, toast, VisuallyHidden } from "../../kit";
import { LinkButton } from "../navigation/LinkButton";
import { JobList } from "../jobs/JobList";
import type { JobRowJob } from "../jobs/JobRow";
import { useJobActions } from "../jobs/useJobActions";
import { useTrack } from "../jobs/track";
import { PageFailure } from "../states/LoadStates";
import { availableStages, feedParams, filterCount, profileLocations, withoutRefinements, type FeedSearch } from "./criteria";
import { FilterSheet } from "./FilterSheet";
import styles from "./Feed.module.css";

// The poller runs every 15 minutes; past two hours it's clearly behind.
const POLL_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 220;

/** Visitors see the public preview; their search runs over it locally. */
function matches(job: JobRowJob, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || [job.title, job.company_name, job.location].some((field) => field?.toLowerCase().includes(needle));
}

export interface FeedProps {
  search: FeedSearch;
  onSearchChange: (search: FeedSearch) => void;
  selectedId?: string;
  /** Reports the visible order, for next/previous beside an open job. */
  onOrderChange?: (ids: string[]) => void;
}

/**
 * `Feed.svelte` for the web: the Jobs title, search and filters, the
 * poller's staleness notice, then the list with incremental loading. With a
 * session it's the personalized feed; a visitor reads the same feed as a new
 * guest would. Only the locked deployment (and the server render) shows the
 * public preview.
 */
export function Feed({ search, onSearchChange, selectedId, onOrderChange }: FeedProps) {
  const { actions, dialog, onOpen, access } = useJobActions("feed");
  const { personal } = access;
  // Visitors read the feed too (as the API's catalog account); only the
  // locked deployment can't.
  const reader = access.canRead;
  const preferences = usePreferences(reader);
  const profile = preferences.data?.search_profile;
  const available = useMemo(() => availableStages(profile?.target_levels), [profile?.target_levels]);
  const defaults = useMemo(() => profileLocations(profile), [profile]);
  const params = useMemo(() => feedParams(search, available, defaults), [search, available, defaults]);
  // Locations and stages default from the profile, so the request waits for it.
  const feed = useFeed(params, reader && preferences.isSuccess);
  const preview = usePublicJobs();
  const stats = useStats(reader);
  const viewed = useViewedJobs(personal);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The search box answers each keystroke; the URL and the request follow
  // once typing pauses (or at once on Enter).
  const [text, setText] = useState(search.q ?? "");
  const [lastQuery, setLastQuery] = useState(search.q);
  if (search.q !== lastQuery) {
    setLastQuery(search.q);
    setText(search.q ?? "");
  }
  const timer = useRef<number | null>(null);
  const commitSearch = (value: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const next = { ...search };
    if (value.trim()) next.q = value;
    else delete next.q;
    if ((next.q ?? "") !== (search.q ?? "")) onSearchChange(next);
  };
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const personalJobs = useMemo(() => feed.data?.pages.flatMap((page) => page.jobs), [feed.data]);
  const previewJobs = useMemo(
    () => (preview.data?.jobs ?? []).filter((job) => matches(job, text)),
    [preview.data, text],
  );
  const showPersonal = reader && (personalJobs !== undefined || feed.isError);
  const jobs: readonly JobRowJob[] = showPersonal ? (personalJobs ?? []) : previewJobs;
  const total = showPersonal ? Math.max(feed.data?.pages[0]?.meta.total ?? 0, jobs.length) : jobs.length;
  // A first feed load with filters set has nothing honest to show yet.
  const waiting = reader && !showPersonal && (feed.isPending && Object.keys(search).length > 0);

  useEffect(() => { onOrderChange?.(jobs.map((job) => job.id)); }, [jobs, onOrderChange]);

  // Screen readers hear the result count after each change of criteria.
  const [announcement, setAnnouncement] = useState("");
  const announcedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!showPersonal || feed.isFetching) return;
    const key = JSON.stringify(params);
    if (announcedFor.current === null) { announcedFor.current = key; return; }
    if (announcedFor.current === key) return;
    announcedFor.current = key;
    setAnnouncement(`${total} ${total === 1 ? "job" : "jobs"} found.`);
  }, [showPersonal, feed.isFetching, params, total]);

  // One "displayed" event per fresh first page, as the current feed sent.
  const track = useTrack();
  const firstPageAt = feed.data?.pages.length === 1 ? feed.dataUpdatedAt : 0;
  const firstPageCount = feed.data?.pages[0]?.jobs.length ?? 0;
  useEffect(() => {
    if (firstPageAt && firstPageCount > 0) track("job_displayed", { type: "feed", properties: { count: firstPageCount } });
  }, [firstPageAt, firstPageCount, track]);

  // A background refresh that fails keeps the rows and says so once.
  useEffect(() => {
    if (feed.isRefetchError) toast.error("Couldn't refresh jobs.", { dedupeKey: "feed-refresh" });
  }, [feed.isRefetchError]);

  // Load the next page as the end of the list comes near.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !showPersonal || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || isFetchingNextPage) return;
      fetchNextPage().then((result) => {
        if (result.isFetchNextPageError) {
          toast.error("Couldn't load more jobs.", {
            dedupeKey: "feed-load-more",
            action: { label: "Retry", run: () => void fetchNextPage() },
          });
        }
      }, () => undefined);
    }, { rootMargin: "280px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [showPersonal, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = () => { void feed.refetch(); void stats.refetch(); };
  const lastPolled = stats.data?.lastPolled;
  // Compared once per render; the notice only needs to be roughly right.
  const pollStale = Boolean(lastPolled && Date.now() - new Date(lastPolled).getTime() > POLL_STALE_AFTER_MS);
  const filters = filterCount(search, available, defaults);
  const refinements = filters - (search.saved ? 1 : 0);

  return <section className={styles.root} aria-labelledby="feed-title">
    <Heading level={1} variant="root" id="feed-title">Jobs</Heading>
    <p className={styles.intro}>Early-career opportunities, straight from company career pages.</p>

    <div className={styles.toolbar} role="search">
      <SearchInput
        aria-label="Search jobs or companies"
        placeholder="Search"
        value={text}
        onChange={(event) => {
          const value = event.target.value;
          setText(value);
          if (!reader) return;
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => commitSearch(value), SEARCH_DEBOUNCE_MS);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !reader) return;
          event.preventDefault();
          commitSearch(event.currentTarget.value);
        }}
      />
      {reader && <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setFiltersOpen(true)}
        aria-label={filters > 0 ? `Filters, ${filters} active` : "Filters"}>
        Filters{filters > 0 && <Badge>{filters}</Badge>}
      </Button>}
    </div>

    {reader && profile && (!profile.onboarding_completed_at || profile.onboarding_version < ONBOARDING_VERSION) && <SetupPrompt />}

    {pollStale && lastPolled && <Alert tone="warning" size="compact" icon={WarningCircle}
      action={<Button variant="secondary" size="compact" pending={feed.isRefetching} onClick={refresh}>Refresh</Button>}>
      <span suppressHydrationWarning>Results may be stale · updated {timeAgo(lastPolled)}</span>
    </Alert>}

    <VisuallyHidden><span role="status" aria-live="polite" aria-atomic="true">{announcement}</span></VisuallyHidden>

    <div className={styles.list} aria-busy={feed.isFetching || undefined}>
      {waiting ? <SkeletonRows />
        : showPersonal && feed.isError && !feed.data ? <PageFailure title="Jobs didn't load" onRetry={() => void feed.refetch()} retrying={feed.isFetching} />
        : jobs.length === 0 ? <EmptyFeed search={search} refinements={refinements} live={reader}
          refreshing={feed.isRefetching} onRefresh={refresh}
          onClear={() => onSearchChange(withoutRefinements(search))}
          onClearSearch={() => { setText(""); onSearchChange({ ...search, q: undefined }); }}
          text={text} />
        : <>
          <JobList jobs={jobs} total={total} viewed={viewed.data} selectedId={selectedId}
            onOpen={onOpen} actions={actions} />
          {showPersonal && hasNextPage
            ? <div ref={sentinel} className={styles.more}>{isFetchingNextPage && <><Spinner label="Loading more jobs" /><span>Loading more jobs</span></>}</div>
            : <p className={styles.end}>You’re all caught up. Go touch grass.</p>}
        </>}
    </div>

    {reader && <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} search={search} available={available}
      defaults={defaults} personal={personal} onApply={onSearchChange} />}
    {dialog}
  </section>;
}

const SETUP_DISMISSED = "pinkslip-setup-dismissed";

/** Until onboarding is done, the feed offers it; it never blocks browsing.
 * Dismissing hides it in this browser. */
function SetupPrompt() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(SETUP_DISMISSED) === "1"; } catch { return false; }
  });
  if (dismissed) return null;
  return <div className={styles.setup}>
    <Sparkle size={20} weight="fill" aria-hidden className={styles.setupIcon} />
    <Text weight="medium">Get jobs that fit you</Text>
    <LinkButton to="/welcome" variant="primary" size="compact">Set up</LinkButton>
    <IconButton icon={X} label="Dismiss" size="sm" iconSize={16} onClick={() => {
      try { localStorage.setItem(SETUP_DISMISSED, "1"); } catch { /* still hides for now */ }
      setDismissed(true);
    }} />
  </div>;
}

function SkeletonRows() {
  return <div aria-hidden>
    {Array.from({ length: 6 }, (_, index) => <div key={index} className={styles.skeletonRow}>
      <Skeleton width="24px" height="24px" />
      <div className={styles.skeletonCopy}>
        <Skeleton width="38%" height="var(--fs-2xs)" />
        <Skeleton width="72%" height="var(--fs-base)" />
        <Skeleton width="54%" height="var(--fs-xs)" />
      </div>
    </div>)}
  </div>;
}

interface EmptyFeedProps {
  search: FeedSearch;
  refinements: number;
  /** The real feed (not the locked preview): it can filter and refresh. */
  live: boolean;
  refreshing: boolean;
  text: string;
  onRefresh: () => void;
  onClear: () => void;
  onClearSearch: () => void;
}

function EmptyFeed({ search, refinements, live, refreshing, text, onRefresh, onClear, onClearSearch }: EmptyFeedProps) {
  const searching = Boolean(live ? search.q : text.trim());
  if (searching && refinements === 0) {
    return <EmptyState icon={MagnifyingGlass} title="No matches"
      message="Try a different company, title or city."
      actions={<Button variant="secondary" onClick={onClearSearch}>Clear search</Button>} />;
  }
  const saved = Boolean(search.saved);
  const title = refinements > 0
    ? saved ? "No saved jobs match your filters" : "No jobs match your filters"
    : saved ? "No saved jobs yet" : "No jobs right now";
  const message = search.listing === "evergreen"
    ? "No standing or aged-but-open roles match your other filters."
    : refinements > 0 ? "Try widening or clearing your filters."
      : saved ? "Save roles from the job page to keep them handy."
        : "New roles show up here as they’re posted.";
  return <EmptyState icon={refinements > 0 ? Funnel : undefined} title={title} message={message}
    actions={live && <>
      {refinements > 0 && <Button variant="secondary" onClick={onClear}>Clear filters</Button>}
      <Button variant="secondary" icon={ArrowClockwise} pending={refreshing} onClick={onRefresh}>Refresh now</Button>
    </>} />;
}
