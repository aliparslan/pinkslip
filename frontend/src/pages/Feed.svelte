<script lang="ts" module>
  import type { Job as FeedJob } from "../lib/api";

  type FeedSort = "last_seen" | "last_posted" | "score";

  type FeedCache = {
    jobs: FeedJob[];
    lastPolled: string | null;
    selectedLocation: string;
    sortBy: FeedSort;
    searchQuery: string;
    savedOnly: boolean;
    notifyThreshold: number;
    nextOffset: number;
    hasMore: boolean;
    hydrated: boolean;
  };

  const PAGE_SIZE = 25;

  const feedCache: FeedCache = {
    jobs: [],
    lastPolled: null,
    selectedLocation: "All",
    sortBy: "last_seen",
    searchQuery: "",
    savedOnly: false,
    notifyThreshold: 50,
    nextOffset: 0,
    hasMore: true,
    hydrated: false,
  };
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Job } from "../lib/api";
  import { JOB_SCORE_RAW_MAX } from "../lib/scoring";
  import { timeAgo } from "../lib/utils";
  import { searchOpen, unviewedCount } from "../lib/feed-state";
  import { viewedJobs } from "../lib/viewed";
  import { removeFeedNavigationJob, setFeedNavigationJobs } from "../lib/feed-navigation";
  import JobRow from "../components/JobRow.svelte";
  import FilterChips from "../components/FilterChips.svelte";
  import X from "phosphor-svelte/lib/X";

  const LOCATIONS = ["All", "Remote", "NYC", "SF Bay Area", "Chicago", "Boston", "DC"];

  let jobs: Job[] = $state([...feedCache.jobs]);
  let loading: boolean = $state(!feedCache.hydrated && feedCache.jobs.length === 0);
  let error: string | null = $state(null);
  let selectedLocation: string = $state(feedCache.selectedLocation);
  type FeedSort = "last_seen" | "last_posted" | "score";

  const SORT_OPTIONS: { label: string; value: FeedSort }[] = [
    { label: "Last posted", value: "last_posted" },
    { label: "Last seen", value: "last_seen" },
    { label: "Score", value: "score" },
  ];

  let sortBy: FeedSort = $state(feedCache.sortBy);
  let searchQuery: string = $state(feedCache.searchQuery);
  let savedOnly: boolean = $state(feedCache.savedOnly);
  let notifyThreshold: number = $state(feedCache.notifyThreshold);
  let lastPolled: string | null = $state(feedCache.lastPolled);
  let refreshing: boolean = $state(false);
  let loadingMore: boolean = $state(false);
  let hasMore: boolean = $state(feedCache.hasMore);
  let nextOffset: number = $state(feedCache.nextOffset);
  let lastAutoRefreshAt = 0;
  let searchTimer: number | null = $state(null);
  let searchInputEl: HTMLInputElement | undefined = $state(undefined);
  let loadMoreSentinel: HTMLDivElement | undefined = $state(undefined);
  let requestVersion = 0;

  let viewed = $derived($viewedJobs);
  let showSearch = $derived($searchOpen);

  let newToday = $derived.by(() => {
    const today = new Date().toISOString().slice(0, 10);
    return jobs.filter((j) => j.first_seen_at?.startsWith(today)).length;
  });
  let showingLabel = $derived(hasMore ? `${jobs.length}+ showing` : `${jobs.length} showing`);

  // Drive the bell badge
  $effect(() => {
    const count = jobs.filter((j) => !viewed.has(j.id)).length;
    unviewedCount.set(count);
  });

  // Focus search input when header icon opens search
  $effect(() => {
    if (showSearch && searchInputEl) {
      searchInputEl.focus();
    }
  });

  function syncFeedCache() {
    feedCache.jobs = [...jobs];
    feedCache.lastPolled = lastPolled;
    feedCache.selectedLocation = selectedLocation;
    feedCache.sortBy = sortBy;
    feedCache.searchQuery = searchQuery;
    feedCache.savedOnly = savedOnly;
    feedCache.notifyThreshold = notifyThreshold;
    feedCache.nextOffset = nextOffset;
    feedCache.hasMore = hasMore;
    feedCache.hydrated = true;
    setFeedNavigationJobs(jobs);
  }

  function thresholdToRaw(threshold: number): number {
    return Math.max(0, Math.min(JOB_SCORE_RAW_MAX, Math.round((threshold / 100) * JOB_SCORE_RAW_MAX)));
  }

  function buildFeedParams(limit = PAGE_SIZE, offset = 0) {
    const params: Record<string, string> = {
      sort: sortBy,
      limit: String(limit),
      offset: String(offset),
    };

    if (!savedOnly) {
      params.min_score = String(thresholdToRaw(notifyThreshold));
    }
    if (searchQuery.trim()) {
      params.q = searchQuery.trim();
    }
    if (selectedLocation !== "All") {
      params.location = selectedLocation;
    }
    if (savedOnly) {
      params.saved = "true";
    }

    return params;
  }

  async function loadFeedPage(options?: {
    silent?: boolean;
    append?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const silent = options?.silent ?? false;
    const append = options?.append ?? false;
    const limit = options?.limit ?? PAGE_SIZE;
    const offset = options?.offset ?? 0;
    const hadJobs = jobs.length > 0;
    const version = ++requestVersion;

    if (append) {
      loadingMore = true;
    } else if (!silent && !hadJobs) {
      loading = true;
    }

    if (!append && (!silent || !hadJobs)) {
      error = null;
    }

    try {
      if (!append) {
        const [prefsRes, statsRes] = await Promise.all([
          api.preferences.get(),
          api.stats.get(),
        ]);

        if (version !== requestVersion) return;

        notifyThreshold = (prefsRes.notify_threshold as number | undefined)
          ?? (prefsRes.notification_threshold as number | undefined)
          ?? 50;
        lastPolled = statsRes.lastPolled ?? null;
      }

      const jobsRes = await api.jobs.list(buildFeedParams(limit, offset));
      if (version !== requestVersion) return;

      const incoming = jobsRes.jobs ?? [];
      if (append) {
        jobs = [...jobs, ...incoming];
      } else {
        jobs = incoming;
      }

      hasMore = Boolean(jobsRes.meta?.has_more);
      nextOffset = jobsRes.meta?.next_offset ?? (offset + incoming.length);
      syncFeedCache();
    } catch (e: any) {
      if (version !== requestVersion) return;
      if (!hadJobs || !append) {
        error = e.message;
      }
    } finally {
      if (version === requestVersion) {
        loading = false;
        loadingMore = false;
      }
    }
  }

  async function loadFeed(silent = false) {
    const preservedCount = Math.max(feedCache.jobs.length, jobs.length, PAGE_SIZE);
    await loadFeedPage({
      silent,
      append: false,
      limit: preservedCount,
      offset: 0,
    });
  }

  async function loadMore() {
    if (loading || loadingMore || refreshing || !hasMore) return;
    await loadFeedPage({
      silent: true,
      append: true,
      limit: PAGE_SIZE,
      offset: nextOffset,
    });
  }

  async function applyFeedFilters(updates?: {
    selectedLocation?: string;
    sortBy?: FeedSort;
    searchQuery?: string;
    savedOnly?: boolean;
  }) {
    if (updates?.selectedLocation !== undefined) {
      selectedLocation = updates.selectedLocation;
    }
    if (updates?.sortBy !== undefined) {
      sortBy = updates.sortBy;
    }
    if (updates?.searchQuery !== undefined) {
      searchQuery = updates.searchQuery;
    }
    if (updates?.savedOnly !== undefined) {
      savedOnly = updates.savedOnly;
    }
    error = null;
    hasMore = true;
    nextOffset = 0;
    await loadFeedPage({
      silent: true,
      append: false,
      limit: PAGE_SIZE,
      offset: 0,
    });
  }

  function scheduleSearch(nextValue: string) {
    searchQuery = nextValue;
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer);
    }
    searchTimer = window.setTimeout(() => {
      searchTimer = null;
      void applyFeedFilters({ searchQuery: nextValue });
    }, 220);
  }

  function closeSearch() {
    searchQuery = "";
    searchOpen.set(false);
    void applyFeedFilters({ searchQuery: "" });
  }

  async function triggerRefresh() {
    if (refreshing) return;
    refreshing = true;
    error = null;
    await loadFeed(true);
    refreshing = false;
  }

  async function refreshIfStale() {
    const now = Date.now();
    if (refreshing || loading || now - lastAutoRefreshAt < 1500) return;
    lastAutoRefreshAt = now;
    await loadFeed(true);
  }

  onMount(() => {
    if (feedCache.hydrated && feedCache.jobs.length > 0) {
      loading = false;
      refreshIfStale();
    } else {
      loadFeed();
    }
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshIfStale();
      }
    };
    const handleFocus = () => {
      refreshIfStale();
    };
    const handlePageShow = () => {
      refreshIfStale();
    };
    const handleServiceWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (
        event.data?.type === "pinkslip:push"
        || event.data?.type === "pinkslip:notification-opened"
      ) {
        refreshIfStale();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
      if (searchTimer !== null) {
        window.clearTimeout(searchTimer);
      }
    };
  });

  $effect(() => {
    if (!loadMoreSentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "280px 0px" }
    );

    observer.observe(loadMoreSentinel);

    return () => {
      observer.disconnect();
    };
  });

  $effect(() => {
    syncFeedCache();
  });
</script>

<div class="page" style="padding-top: 0;">
  <!-- Search bar (toggled from header or always visible) -->
  {#if showSearch || searchQuery}
    <div style="padding: 8px 16px; display: flex; align-items: center; gap: 8px; border-bottom: 0.5px solid var(--color-line);">
      <input
        bind:this={searchInputEl}
        type="text"
        class="input-field"
        style="flex: 1; height: 36px; font-size: 14px; border-radius: 8px;"
        placeholder="Search jobs or companies..."
        value={searchQuery}
        oninput={(e) => scheduleSearch((e.currentTarget as HTMLInputElement).value)}
        onkeydown={(e) => { if (e.key === 'Escape') closeSearch(); }}
      />
      <button
        class="icon-btn"
        style="width: 32px; height: 32px; flex-shrink: 0;"
        aria-label="Close search"
        onclick={closeSearch}
      >
        <X size={16} />
      </button>
    </div>
  {/if}

  <!-- Stats bar -->
  <div class="stat-row" style="padding: 10px 16px 12px; justify-content: flex-start;">
    <span>{newToday} new today</span>
    <span>{showingLabel}</span>
    {#if lastPolled}
      <span>polled {timeAgo(lastPolled)}</span>
    {/if}
  </div>

  <!-- Filters + sort -->
  <div style="display: flex; flex-direction: column; gap: 8px; padding: 0 16px 10px;">
    <div style="min-width: 0; overflow: hidden;">
      <FilterChips
        filters={LOCATIONS}
        selected={selectedLocation}
        scrollable={true}
        onSelect={(f) => void applyFeedFilters({ selectedLocation: f })}
      />
    </div>
    <div style="position: relative; display: inline-flex; align-self: flex-start; background: var(--color-bg-sunken); border: 1px solid var(--color-line-2); border-radius: 9px; padding: 2px; max-width: 100%; overflow-x: auto;">
      {#each SORT_OPTIONS as option}
        <button
          style="position: relative; z-index: 1; min-width: max-content; padding: 4px 12px; border: 1px solid {sortBy === option.value ? 'var(--color-line-2)' : 'transparent'}; background: {sortBy === option.value ? 'var(--color-bg-elev)' : 'transparent'}; font-size: 12px; font-weight: {sortBy === option.value ? '600' : '500'}; color: {sortBy === option.value ? 'var(--color-ink)' : 'var(--color-ink-3)'}; cursor: pointer; letter-spacing: -0.01em; border-radius: 7px; white-space: nowrap;"
          onclick={() => void applyFeedFilters({ sortBy: option.value })}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  <div style="height: 0.5px; background: var(--color-line);"></div>

  <!-- Job rows -->
  <div>
    {#if loading}
      {#each Array(6) as _}
        <div style="display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: center; padding: 10px 16px; border-bottom: 0.5px solid var(--color-line);">
          <div class="skeleton" style="width: 24px; height: 24px; border-radius: 6px;"></div>
          <div>
            <div class="skeleton" style="width: 45%; height: 8px; margin-bottom: 6px;"></div>
            <div class="skeleton" style="width: 72%; height: 12px; margin-bottom: 6px;"></div>
            <div class="skeleton" style="width: 50%; height: 8px;"></div>
          </div>
        </div>
      {/each}
    {:else if error}
      <div style="padding: 16px; margin: 16px; border-radius: var(--radius-md); background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 14px;">
        {error}
      </div>
    {:else if jobs.length === 0}
      <div style="text-align: center; padding: 48px 24px; color: var(--color-ink-3);">
        <div class="h-display" style="font-size: 22px; color: var(--color-ink-2); margin-bottom: 8px;">
          {savedOnly ? "No saved jobs yet" : "Nothing here"}
        </div>
        <div style="font-size: 13px; margin-bottom: 14px;">
          {savedOnly ? "Save roles from the detail view to keep them handy." : "Adjust your filters or check back later."}
        </div>
        <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
          <button class="btn-secondary" onclick={triggerRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
      </div>
    {:else}
      {#each jobs as job (job.id)}
        <JobRow {job} viewed={viewed.has(job.id)} onDismiss={(id) => { jobs = jobs.filter(j => j.id !== id); removeFeedNavigationJob(id); }} />
      {/each}
      {#if loadingMore}
        <div style="padding: 18px 16px; text-align: center; color: var(--color-ink-3); font-size: 13px;">
          Loading more…
        </div>
      {/if}
      {#if hasMore}
        <div bind:this={loadMoreSentinel} style="height: 1px;"></div>
      {:else}
        <div style="padding: 24px 16px; text-align: center; color: var(--color-ink-4); font-size: 12px;">
          End of feed
        </div>
      {/if}
    {/if}
  </div>
</div>
