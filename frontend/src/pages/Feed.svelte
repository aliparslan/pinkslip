<script lang="ts" module>
  import type { Job as FeedJob } from "../lib/api";

  type FeedCache = {
    jobs: FeedJob[];
    lastPolled: string | null;
    selectedLocation: string;
    sortBy: "time" | "score";
    searchQuery: string;
    savedOnly: boolean;
    notifyThreshold: number;
    hydrated: boolean;
  };

  const feedCache: FeedCache = {
    jobs: [],
    lastPolled: null,
    selectedLocation: "All",
    sortBy: "time",
    searchQuery: "",
    savedOnly: false,
    notifyThreshold: 50,
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
  import JobRow from "../components/JobRow.svelte";
  import FilterChips from "../components/FilterChips.svelte";
  import X from "phosphor-svelte/lib/X";

  const LOCATIONS = ["All", "Remote", "NYC", "SF Bay Area", "Chicago", "Boston", "DC"];

  let jobs: Job[] = $state([...feedCache.jobs]);
  let loading: boolean = $state(!feedCache.hydrated && feedCache.jobs.length === 0);
  let error: string | null = $state(null);
  let selectedLocation: string = $state(feedCache.selectedLocation);
  let sortBy: "time" | "score" = $state(feedCache.sortBy);
  let searchQuery: string = $state(feedCache.searchQuery);
  let savedOnly: boolean = $state(feedCache.savedOnly);
  let notifyThreshold: number = $state(feedCache.notifyThreshold);
  let lastPolled: string | null = $state(feedCache.lastPolled);
  let refreshing: boolean = $state(false);
  let lastAutoRefreshAt = 0;
  let searchTimer: number | null = $state(null);
  let searchInputEl: HTMLInputElement | undefined = $state(undefined);

  let viewed = $derived($viewedJobs);
  let showSearch = $derived($searchOpen);

  let newToday = $derived.by(() => {
    const today = new Date().toISOString().slice(0, 10);
    return jobs.filter((j) => j.first_seen_at?.startsWith(today)).length;
  });

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
    feedCache.hydrated = true;
  }

  function thresholdToRaw(threshold: number): number {
    return Math.max(0, Math.min(JOB_SCORE_RAW_MAX, Math.round((threshold / 100) * JOB_SCORE_RAW_MAX)));
  }

  function buildFeedParams() {
    const params: Record<string, string> = {
      sort: sortBy,
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

  async function loadFeed(silent = false) {
    const hadJobs = jobs.length > 0;
    if (!silent && !hadJobs) loading = true;
    if (!silent || !hadJobs) error = null;
    try {
      const [prefsRes, statsRes] = await Promise.all([
        api.preferences.get(),
        api.stats.get(),
      ]);

      notifyThreshold = (prefsRes.notify_threshold as number | undefined)
        ?? (prefsRes.notification_threshold as number | undefined)
        ?? 50;

      const jobsRes = await api.jobs.list(buildFeedParams());
      jobs = jobsRes.jobs ?? [];
      lastPolled = statsRes.lastPolled ?? null;
      syncFeedCache();
    } catch (e: any) {
      if (!hadJobs) {
        error = e.message;
      }
    } finally {
      loading = false;
    }
  }

  async function applyFeedFilters(updates?: {
    selectedLocation?: string;
    sortBy?: "time" | "score";
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
    await loadFeed(true);
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
  <div style="padding: 10px 16px 12px; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;">
    <div style="display: inline-flex; align-items: baseline; gap: 5px;">
      <span style="font-family: var(--font-mono); font-weight: 700; font-size: 15px; color: var(--color-ink); font-variant-numeric: tabular-nums; letter-spacing: -0.01em;">{newToday}</span>
      <span style="font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500;">new today</span>
    </div>
    <span style="width: 0.5px; height: 12px; background: var(--color-line); display: inline-block;"></span>
    <div style="display: inline-flex; align-items: baseline; gap: 5px;">
      <span style="font-family: var(--font-mono); font-weight: 600; font-size: 13px; color: var(--color-ink); font-variant-numeric: tabular-nums; letter-spacing: -0.01em;">{jobs.length}</span>
      <span style="font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500;">showing</span>
    </div>
    {#if lastPolled}
      <span style="width: 0.5px; height: 12px; background: var(--color-line); display: inline-block;"></span>
      <div style="display: inline-flex; align-items: baseline; gap: 5px;">
        <span style="font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500;">polled</span>
        <span style="font-family: var(--font-mono); font-weight: 600; font-size: 13px; color: var(--color-ink-3); font-variant-numeric: tabular-nums;">{timeAgo(lastPolled)}</span>
      </div>
    {/if}
  </div>

  <!-- Filters + sort -->
  <div style="display: flex; align-items: center; gap: 8px; padding: 0 16px 8px;">
    <div style="flex: 1; min-width: 0; overflow: hidden;">
      <FilterChips
        filters={LOCATIONS}
        selected={selectedLocation}
        scrollable={true}
        onSelect={(f) => void applyFeedFilters({ selectedLocation: f })}
      />
    </div>
    <div style="position: relative; display: inline-flex; background: var(--color-bg-sunken); border-radius: 8px; padding: 2px; flex-shrink: 0;">
      <button
        style="position: relative; z-index: 1; padding: 4px 12px; border: none; background: {sortBy === 'time' ? 'var(--color-bg-elev)' : 'transparent'}; font-size: 12px; font-weight: {sortBy === 'time' ? '600' : '500'}; color: {sortBy === 'time' ? 'var(--color-ink)' : 'var(--color-ink-3)'}; cursor: pointer; letter-spacing: -0.01em; border-radius: 6px; {sortBy === 'time' ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.06);' : ''}"
        onclick={() => void applyFeedFilters({ sortBy: 'time' })}
      >
        New
      </button>
      <button
        style="position: relative; z-index: 1; padding: 4px 12px; border: none; background: {sortBy === 'score' ? 'var(--color-bg-elev)' : 'transparent'}; font-size: 12px; font-weight: {sortBy === 'score' ? '600' : '500'}; color: {sortBy === 'score' ? 'var(--color-ink)' : 'var(--color-ink-3)'}; cursor: pointer; letter-spacing: -0.01em; border-radius: 6px; {sortBy === 'score' ? 'box-shadow: 0 1px 2px rgba(0,0,0,0.06);' : ''}"
        onclick={() => void applyFeedFilters({ sortBy: 'score' })}
      >
        Match
      </button>
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
        <JobRow {job} viewed={viewed.has(job.id)} onDismiss={(id) => { jobs = jobs.filter(j => j.id !== id); }} />
      {/each}
      <div style="padding: 24px 16px; text-align: center; font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); letter-spacing: 0.04em;">
        — go touch grass —
      </div>
    {/if}
  </div>
</div>
