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
  import JobCard from "../components/JobCard.svelte";
  import FilterChips from "../components/FilterChips.svelte";

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

  let newToday = $derived.by(() => {
    const today = new Date().toISOString().slice(0, 10);
    return jobs.filter((j) => j.first_seen_at?.startsWith(today)).length;
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

<div class="page">
  <div style="padding: 0 22px 10px;">
    <h1 class="h-display page-title" style="font-size: 30px; margin-bottom: 14px;">
      New roles
    </h1>
    <div class="stat-row">
      <span><strong style="color: var(--color-ink);">{newToday}</strong> new today</span>
      <span><strong style="color: var(--color-ink);">{jobs.length}</strong> showing</span>
      {#if lastPolled}
        <span>polled {timeAgo(lastPolled)}</span>
      {/if}
      {#if refreshing}
        <span>refreshing now</span>
      {/if}
    </div>
  </div>

  <!-- Search + library filter -->
  <div style="padding: 0 22px 10px; display: flex; align-items: center; gap: 10px;">
    <input
      class="input-field"
      type="search"
      placeholder="Search roles or companies"
      value={searchQuery}
      oninput={(event) => scheduleSearch((event.currentTarget as HTMLInputElement).value)}
      style="flex: 1; height: 34px; padding: 0 12px;"
    />
    <div style="display: flex; flex-shrink: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--color-line);">
      <button
        style="padding: 6px 14px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; background: {!savedOnly ? 'var(--color-accent)' : 'var(--color-bg-elev)'}; color: {!savedOnly ? 'var(--color-accent-ink)' : 'var(--color-ink-3)'};"
        onclick={() => void applyFeedFilters({ savedOnly: false })}
      >
        All
      </button>
      <button
        style="padding: 6px 14px; font-size: 12px; font-weight: 600; border: none; border-left: 1px solid var(--color-line); cursor: pointer; background: {savedOnly ? 'var(--color-accent)' : 'var(--color-bg-elev)'}; color: {savedOnly ? 'var(--color-accent-ink)' : 'var(--color-ink-3)'};"
        onclick={() => void applyFeedFilters({ savedOnly: true })}
      >
        Saved
      </button>
    </div>
  </div>

  <!-- Location filter -->
  <div style="padding: 0 22px 8px;">
    <FilterChips
      filters={LOCATIONS}
      selected={selectedLocation}
      scrollable={true}
      onSelect={(f) => void applyFeedFilters({ selectedLocation: f })}
    />
  </div>

  <!-- Sort + refresh -->
  <div style="padding: 0 22px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
    <div style="display: flex; flex-shrink: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--color-line);">
      <button
        style="padding: 6px 14px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; background: {sortBy === 'time' ? 'var(--color-accent)' : 'var(--color-bg-elev)'}; color: {sortBy === 'time' ? 'var(--color-accent-ink)' : 'var(--color-ink-3)'};"
        onclick={() => void applyFeedFilters({ sortBy: 'time' })}
      >
        New
      </button>
      <button
        style="padding: 6px 14px; font-size: 12px; font-weight: 600; border: none; border-left: 1px solid var(--color-line); cursor: pointer; background: {sortBy === 'score' ? 'var(--color-accent)' : 'var(--color-bg-elev)'}; color: {sortBy === 'score' ? 'var(--color-accent-ink)' : 'var(--color-ink-3)'};"
        onclick={() => void applyFeedFilters({ sortBy: 'score' })}
      >
        Score
      </button>
    </div>
    <button
      class="btn-secondary"
      style="height: 32px; padding: 0 14px; flex-shrink: 0; font-size: 12px;"
      disabled={refreshing}
      onclick={triggerRefresh}
    >
      {refreshing ? "Refreshing..." : "Refresh"}
    </button>
  </div>

  <!-- Job feed -->
  <div style="display: flex; flex-direction: column; gap: 6px; padding: 0 22px 28px;">
    {#if loading}
      {#each Array(4) as _}
        <div class="card-base" style="width: 100%; pointer-events: none;">
          <div style="display: flex; gap: 14px; align-items: flex-start;">
            <div class="skeleton" style="width: 44px; height: 44px; border-radius: 11px; flex-shrink: 0;"></div>
            <div style="flex: 1;">
              <div class="skeleton" style="width: 50%; height: 10px; margin-bottom: 8px;"></div>
              <div class="skeleton" style="width: 80%; height: 16px; margin-bottom: 10px;"></div>
              <div class="skeleton" style="width: 40%; height: 10px;"></div>
            </div>
          </div>
        </div>
      {/each}
    {:else if error}
      <div style="padding: 16px 18px; border-radius: var(--radius-md); background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 14px;">
        {error}
      </div>
    {:else if jobs.length === 0}
      <div style="text-align: center; padding: 48px 24px; color: var(--color-ink-3);">
        <div class="h-display" style="font-size: 24px; color: var(--color-ink-2); margin-bottom: 8px;">
          {savedOnly ? "No saved jobs yet" : "Nothing here"}
        </div>
        <div style="font-size: 13.5px; margin-bottom: 14px;">
          {savedOnly ? "Save roles from the detail view to keep them handy." : "Adjust your filters or pull in a fresh poll."}
        </div>
        <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
          <button class="btn-secondary" style="height: 38px; padding: 0 14px;" onclick={triggerRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
          {#if lastPolled}
            <div style="display: inline-flex; align-items: center; font-size: 12px; color: var(--color-ink-4);">
              Last poll {timeAgo(lastPolled)}
            </div>
          {/if}
        </div>
      </div>
    {:else}
      {#each jobs as job (job.id)}
        <JobCard {job} onDismiss={(id) => { jobs = jobs.filter(j => j.id !== id); }} />
      {/each}
      <div style="text-align: center; padding: 16px 0 4px; font-size: 11px; color: var(--color-ink-4);">
        End of feed
      </div>
    {/if}
  </div>
</div>
