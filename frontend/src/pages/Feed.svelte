<script lang="ts" module>
  import type { Job as FeedJob } from "../lib/api";

  type FeedSort = "last_seen" | "last_posted" | "score";

  type FeedCache = {
    jobs: FeedJob[];
    lastPolled: string | null;
    selectedLocations: string[];
    sortBy: FeedSort;
    searchQuery: string;
    savedOnly: boolean;
    minMatch: number;
    minSalaryK: string;
    maxSalaryK: string;
    maxYoe: string;
    notifyThreshold: number;
    nextOffset: number;
    hasMore: boolean;
    hydrated: boolean;
  };

  const PAGE_SIZE = 25;

  const feedCache: FeedCache = {
    jobs: [],
    lastPolled: null,
    selectedLocations: ["All"],
    sortBy: "last_seen",
    searchQuery: "",
    savedOnly: false,
    minMatch: 50,
    minSalaryK: "",
    maxSalaryK: "",
    maxYoe: "",
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
  import Slider from "../components/Slider.svelte";
  import { Dialog } from "bits-ui";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import X from "phosphor-svelte/lib/X";
  import SlidersHorizontal from "phosphor-svelte/lib/SlidersHorizontal";
  import ArrowClockwise from "phosphor-svelte/lib/ArrowClockwise";
  import { hapticMedium } from "../lib/haptics";
  import { dragDismiss } from "../lib/drag-dismiss";

  const LOCATIONS = ["All", "Remote", "NYC", "SF Bay Area", "Chicago", "Boston", "DC"];
  const YOE_OPTIONS = [
    { label: "Any", value: "" },
    { label: "0-1", value: "1" },
    { label: "0-2", value: "2" },
    { label: "0-3", value: "3" },
    { label: "0-4", value: "4" },
    { label: "0-5", value: "5" },
    { label: "0-8", value: "8" },
  ];

  let jobs: Job[] = $state([...feedCache.jobs]);
  let loading: boolean = $state(!feedCache.hydrated && feedCache.jobs.length === 0);
  let error: string | null = $state(null);
  let selectedLocations: string[] = $state([...feedCache.selectedLocations]);
  type FeedSort = "last_seen" | "last_posted" | "score";

  const SORT_OPTIONS: { label: string; value: FeedSort }[] = [
    { label: "Last posted", value: "last_posted" },
    { label: "Last seen", value: "last_seen" },
    { label: "Score", value: "score" },
  ];

  let sortBy: FeedSort = $state(feedCache.sortBy);
  let searchQuery: string = $state(feedCache.searchQuery);
  let savedOnly: boolean = $state(feedCache.savedOnly);
  let minMatch: number = $state(feedCache.minMatch);
  let minSalaryK: string = $state(feedCache.minSalaryK);
  let maxSalaryK: string = $state(feedCache.maxSalaryK);
  let maxYoe: string = $state(feedCache.maxYoe);
  let filtersOpen: boolean = $state(false);
  let notifyThreshold: number = $state(feedCache.notifyThreshold);
  let lastPolled: string | null = $state(feedCache.lastPolled);
  let refreshing: boolean = $state(false);
  let loadingMore: boolean = $state(false);
  let hasMore: boolean = $state(feedCache.hasMore);
  let nextOffset: number = $state(feedCache.nextOffset);
  let lastAutoRefreshAt = 0;
  let searchTimer: number | null = $state(null);

  // ── Pull-to-refresh ─────────────────────────────────────────────────────────
  const PTR_TRIGGER = 72; // px pulled before a release fires a refresh
  const PTR_MAX = 110; // px the indicator can travel
  let pageEl: HTMLElement | undefined = $state(undefined);
  let pullY = $state(0);
  let pulling = $state(false);
  let ptrCandidate = false;
  let ptrArmed = false;
  let ptrStartY = 0;

  function removeJob(id: string) {
    jobs = jobs.filter((j) => j.id !== id);
    removeFeedNavigationJob(id);
  }

  function onPtrStart(e: TouchEvent) {
    if (refreshing || loading || window.scrollY > 0) return;
    const t = e.touches[0];
    if (!t) return;
    ptrStartY = t.clientY;
    ptrCandidate = true;
    ptrArmed = false;
  }

  function onPtrMove(e: TouchEvent) {
    if (!ptrCandidate) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - ptrStartY;
    if (dy <= 0 || window.scrollY > 0) {
      if (pulling) {
        pulling = false;
        pullY = 0;
      }
      ptrCandidate = false;
      return;
    }
    pulling = true;
    e.preventDefault();
    pullY = Math.min(PTR_MAX, dy * 0.5); // resistance
    const armed = pullY >= PTR_TRIGGER;
    if (armed !== ptrArmed) {
      ptrArmed = armed;
      if (armed) hapticMedium();
    }
  }

  async function onPtrEnd() {
    if (!ptrCandidate) return;
    ptrCandidate = false;
    if (!pulling) return;
    pulling = false;
    if (pullY >= PTR_TRIGGER) {
      pullY = 52; // hold the spinner while loading
      await triggerRefresh();
    }
    pullY = 0;
  }

  $effect(() => {
    const el = pageEl;
    if (!el) return;
    el.addEventListener("touchstart", onPtrStart, { passive: true });
    el.addEventListener("touchmove", onPtrMove, { passive: false });
    el.addEventListener("touchend", onPtrEnd, { passive: true });
    el.addEventListener("touchcancel", onPtrEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onPtrStart);
      el.removeEventListener("touchmove", onPtrMove);
      el.removeEventListener("touchend", onPtrEnd);
      el.removeEventListener("touchcancel", onPtrEnd);
    };
  });
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
  let activeFilterCount = $derived.by(() => {
    let count = 0;
    if (!(selectedLocations.length === 1 && selectedLocations[0] === "All")) count += 1;
    if (minSalaryK.trim() || maxSalaryK.trim()) count += 1;
    if (maxYoe) count += 1;
    if (minMatch !== 50) count += 1;
    if (savedOnly) count += 1;
    return count;
  });
  let filterSummary = $derived.by(() => {
    const parts: string[] = [];
    if (!(selectedLocations.length === 1 && selectedLocations[0] === "All")) {
      parts.push(selectedLocations.join(", "));
    }
    if (minSalaryK.trim() || maxSalaryK.trim()) {
      const min = minSalaryK.trim() ? `$${minSalaryK.trim()}K` : "Any";
      const max = maxSalaryK.trim() ? `$${maxSalaryK.trim()}K` : "Any";
      parts.push(`${min}-${max}`);
    }
    if (maxYoe) parts.push(`<= ${maxYoe} YOE`);
    if (minMatch !== 50) parts.push(`${minMatch}+ match`);
    if (savedOnly) parts.push("Saved");
    return parts.length > 0 ? parts.join(" · ") : "All jobs";
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
    feedCache.selectedLocations = [...selectedLocations];
    feedCache.sortBy = sortBy;
    feedCache.searchQuery = searchQuery;
    feedCache.savedOnly = savedOnly;
    feedCache.minMatch = minMatch;
    feedCache.minSalaryK = minSalaryK;
    feedCache.maxSalaryK = maxSalaryK;
    feedCache.maxYoe = maxYoe;
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

    if (minMatch > 0) params.min_score = String(thresholdToRaw(minMatch));
    if (searchQuery.trim()) {
      params.q = searchQuery.trim();
    }
    if (!(selectedLocations.length === 1 && selectedLocations[0] === "All")) {
      params.locations = selectedLocations.join(",");
    }
    if (savedOnly) {
      params.saved = "true";
    }
    const minSalary = parseInt(minSalaryK, 10);
    const maxSalary = parseInt(maxSalaryK, 10);
    if (Number.isFinite(minSalary)) params.min_salary = String(minSalary * 1000);
    if (Number.isFinite(maxSalary)) params.max_salary = String(maxSalary * 1000);
    if (maxYoe) params.max_yoe = maxYoe;

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
    selectedLocations?: string[];
    sortBy?: FeedSort;
    searchQuery?: string;
    savedOnly?: boolean;
    minMatch?: number;
    minSalaryK?: string;
    maxSalaryK?: string;
    maxYoe?: string;
  }) {
    if (updates?.selectedLocations !== undefined) {
      selectedLocations = updates.selectedLocations;
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
    if (updates?.minMatch !== undefined) {
      minMatch = updates.minMatch;
    }
    if (updates?.minSalaryK !== undefined) {
      minSalaryK = updates.minSalaryK;
    }
    if (updates?.maxSalaryK !== undefined) {
      maxSalaryK = updates.maxSalaryK;
    }
    if (updates?.maxYoe !== undefined) {
      maxYoe = updates.maxYoe;
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

  function toggleLocationFilter(location: string) {
    if (location === "All") {
      selectedLocations = ["All"];
      return;
    }

    const current = selectedLocations.filter((item) => item !== "All");
    selectedLocations = current.includes(location)
      ? current.filter((item) => item !== location)
      : [...current, location];

    if (selectedLocations.length === 0) {
      selectedLocations = ["All"];
    }
  }

  function resetFilters() {
    selectedLocations = ["All"];
    minSalaryK = "";
    maxSalaryK = "";
    maxYoe = "";
    minMatch = 50;
    savedOnly = false;
  }

  async function applyFilterSheet() {
    filtersOpen = false;
    await applyFeedFilters({
      selectedLocations: [...selectedLocations],
      minSalaryK,
      maxSalaryK,
      maxYoe,
      minMatch,
      savedOnly,
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

<div
  class="page"
  bind:this={pageEl}
  style="padding-top: 0; transform: translateY({pullY}px); transition: {pulling ? 'none' : 'transform 0.32s cubic-bezier(0.2, 0.7, 0.2, 1)'};"
>
  <!-- Pull-to-refresh spinner, revealed in the gap as the page is dragged down -->
  <div
    aria-hidden="true"
    style="position: absolute; top: -42px; left: 0; right: 0; height: 42px; display: flex; align-items: center; justify-content: center; color: var(--color-ink-3); opacity: {Math.min(1, pullY / PTR_TRIGGER)};"
  >
    <span style="display: inline-flex; {refreshing ? 'animation: spin 0.8s linear infinite;' : `transform: rotate(${pullY * 2.4}deg);`}">
      <ArrowClockwise size={20} weight="bold" />
    </span>
  </div>

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
  <div class="feed-controls">
    <div class="feed-control-row" aria-label="Feed controls">
      <button
        class="filter-button"
        class:active={activeFilterCount > 0}
        onclick={() => (filtersOpen = true)}
        aria-label="Open filters"
      >
        <SlidersHorizontal size={15} weight="bold" />
        <span>Filters</span>
        {#if activeFilterCount > 0}
          <span class="filter-count">{activeFilterCount}</span>
        {/if}
      </button>
      <div class="sort-segmented" aria-label="Sort jobs">
        {#each SORT_OPTIONS as option}
          <button
            class:active={sortBy === option.value}
            aria-pressed={sortBy === option.value}
            onclick={() => void applyFeedFilters({ sortBy: option.value })}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="filter-summary">{filterSummary}</div>
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
        <div animate:flip={{ duration: 240, easing: cubicOut }}>
          <JobRow {job} viewed={viewed.has(job.id)} onDismiss={removeJob} />
        </div>
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
          -- End of feed, go touch grass --
        </div>
      {/if}
    {/if}
  </div>
</div>

<Dialog.Root bind:open={filtersOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="sheet-backdrop" />
    <Dialog.Content>
      {#snippet child({ props })}
        <div
          {...props}
          class="sheet filter-sheet"
          use:dragDismiss={{ onDismiss: () => (filtersOpen = false), base: "translateX(-50%)" }}
        >
          <div class="sheet-handle"></div>
          <div class="filter-sheet-header">
            <div>
              <div class="section-label">Feed</div>
              <Dialog.Title class="h-display" style="font-size: 26px;">Filters</Dialog.Title>
            </div>
            <button class="icon-btn" aria-label="Close filters" onclick={() => (filtersOpen = false)}>
              <X size={18} />
            </button>
          </div>

          <div class="filter-sheet-body">
      <section class="filter-group">
        <div class="filter-group-title">Location</div>
        <div class="filter-option-grid">
          {#each LOCATIONS as location}
            <button
              class="filter-choice"
              class:active={selectedLocations.includes(location)}
              aria-pressed={selectedLocations.includes(location)}
              onclick={() => toggleLocationFilter(location)}
            >
              {location}
            </button>
          {/each}
        </div>
      </section>

      <section class="filter-group">
        <div class="filter-group-title">Salary</div>
        <div class="filter-input-grid">
          <label>
            <span>Min</span>
            <div class="filter-money-input">
              <span>$</span>
              <input inputmode="numeric" placeholder="120" bind:value={minSalaryK} />
              <span>K</span>
            </div>
          </label>
          <label>
            <span>Max</span>
            <div class="filter-money-input">
              <span>$</span>
              <input inputmode="numeric" placeholder="250" bind:value={maxSalaryK} />
              <span>K</span>
            </div>
          </label>
        </div>
      </section>

      <section class="filter-group">
        <div class="filter-group-title">Experience</div>
        <div class="filter-option-grid compact">
          {#each YOE_OPTIONS as option}
            <button
              class="filter-choice"
              class:active={maxYoe === option.value}
              aria-pressed={maxYoe === option.value}
              onclick={() => (maxYoe = option.value)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </section>

      <section class="filter-group">
        <div class="filter-row">
          <div>
            <div class="filter-group-title">Match score</div>
            <div class="filter-help">{minMatch}+ minimum</div>
          </div>
          <div class="filter-value">{minMatch}</div>
        </div>
        <Slider min={0} max={100} step={5} bind:value={minMatch} />
      </section>

      <section class="filter-group">
        <button
          class="filter-toggle"
          class:active={savedOnly}
          aria-pressed={savedOnly}
          onclick={() => (savedOnly = !savedOnly)}
        >
          <span>Saved jobs only</span>
          <span>{savedOnly ? "On" : "Off"}</span>
        </button>
      </section>
    </div>

          <div class="filter-sheet-actions action-row">
            <button class="btn-secondary" onclick={resetFilters}>Reset</button>
            <button class="btn-primary btn-accent" onclick={applyFilterSheet}>Apply filters</button>
          </div>
        </div>
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
