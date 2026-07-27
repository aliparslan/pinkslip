<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Job } from "../lib/api";
  import { timeAgo, errorMessage } from "../lib/utils";
  import { searchOpen, unviewedCount } from "../lib/feed-state";
  import { feed, PAGE_SIZE, type FeedSort } from "../lib/feed-store.svelte";
  import { syncViewedJobs, viewedJobs } from "../lib/viewed";
  import { removeFeedNavigationJob, setFeedNavigationJobs } from "../lib/feed-navigation";
  import JobRow from "../components/JobRow.svelte";
  import Spinner from "../components/Spinner.svelte";
  import Switch from "../components/Switch.svelte";
  import { Dialog } from "bits-ui";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import ArrowsDownUp from "phosphor-svelte/lib/ArrowsDownUp";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import X from "phosphor-svelte/lib/X";
  import SlidersHorizontal from "phosphor-svelte/lib/SlidersHorizontal";
  import { dragDismiss } from "../lib/drag-dismiss";
  import {
    DEFAULT_SEARCH_PROFILE,
    LOCATION_OPTIONS,
    normalizeSearchProfile,
    type LocationId,
    type SearchProfile,
  } from "../../../shared/search-profile";

  // Compact chip labels for the shared metro catalog. The filter sends metro
  // IDs to the API, so every onboarding metro is filterable here too.
  const METRO_SHORT_LABELS: Record<LocationId, string> = {
    sf_bay: "SF Bay Area",
    new_york: "NYC",
    chicago: "Chicago",
    boston: "Boston",
    washington_dc: "DC",
    seattle: "Seattle",
    austin: "Austin",
    los_angeles: "LA",
    denver: "Denver",
    atlanta: "Atlanta",
  };

  const LOCATION_CHOICES: { id: string; label: string }[] = [
    { id: "All", label: "All" },
    { id: "Remote", label: "Remote" },
    ...LOCATION_OPTIONS.map((option) => ({
      id: option.id,
      label: METRO_SHORT_LABELS[option.id] ?? option.label,
    })),
  ];

  function locationLabel(id: string): string {
    return LOCATION_CHOICES.find((choice) => choice.id === id)?.label ?? id;
  }

  const YOE_OPTIONS = [
    { label: "Any", value: "" },
    { label: "0-1", value: "1" },
    { label: "0-2", value: "2" },
    { label: "0-3", value: "3" },
    { label: "0-4", value: "4" },
    { label: "0-5", value: "5" },
    { label: "0-8", value: "8" },
  ];

  const SORT_OPTIONS: { label: string; value: FeedSort; hint: string }[] = [
    { label: "Recommended", value: "score", hint: "Put the most relevant jobs first" },
    { label: "Newest", value: "last_posted", hint: "Sort by when the company posted the job" },
    { label: "Just found", value: "last_seen", hint: "Sort by when pinkslip first found the job" },
  ];

  // Show the staleness warning once the poller is clearly behind its
  // 15-minute schedule (not just between runs).
  const POLL_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

  let loading: boolean = $state(!feed.hydrated && feed.jobs.length === 0);
  let error: string | null = $state(null);
  let filtersOpen: boolean = $state(false);
  let currentProfile: SearchProfile = $state(normalizeSearchProfile(DEFAULT_SEARCH_PROFILE));
  let showProfileConfirm: boolean = $state(false);
  let savingProfileFilters: boolean = $state(false);
  let refreshing: boolean = $state(false);
  let loadingMore: boolean = $state(false);
  let lastAutoRefreshAt = 0;
  let searchTimer: number | null = null;
  let searchInputEl: HTMLInputElement | undefined = $state(undefined);
  let loadMoreSentinel: HTMLDivElement | undefined = $state(undefined);
  let requestVersion = 0;

  function removeJob(id: string) {
    feed.jobs = feed.jobs.filter((j) => j.id !== id);
    removeFeedNavigationJob(id);
  }

  let viewed = $derived($viewedJobs);
  let showSearch = $derived($searchOpen);

  let newToday = $derived.by(() => {
    const today = new Date().toISOString().slice(0, 10);
    return feed.jobs.filter((j) => j.first_seen_at?.startsWith(today)).length;
  });
  let showingLabel = $derived(feed.hasMore ? `${feed.jobs.length}+ showing` : `${feed.jobs.length} showing`);
  let pollStale = $derived(
    Boolean(feed.lastPolled && Date.now() - new Date(feed.lastPolled).getTime() > POLL_STALE_AFTER_MS)
  );
  let hasLocationFilter = $derived(
    !(feed.selectedLocations.length === 1 && feed.selectedLocations[0] === "All")
  );
  let activeFilterCount = $derived.by(() => {
    let count = 0;
    if (hasLocationFilter) count += 1;
    if (feed.minSalaryK.trim() || feed.maxSalaryK.trim()) count += 1;
    if (feed.maxYoe) count += 1;
    if (feed.savedOnly) count += 1;
    return count;
  });
  let filterSummary = $derived.by(() => {
    const parts: string[] = [];
    if (hasLocationFilter) {
      parts.push(feed.selectedLocations.map(locationLabel).join(", "));
    }
    if (feed.minSalaryK.trim() || feed.maxSalaryK.trim()) {
      const min = feed.minSalaryK.trim() ? `$${feed.minSalaryK.trim()}K` : "Any";
      const max = feed.maxSalaryK.trim() ? `$${feed.maxSalaryK.trim()}K` : "Any";
      parts.push(`${min}-${max}`);
    }
    if (feed.maxYoe) parts.push(`<= ${feed.maxYoe} YOE`);
    if (feed.savedOnly) parts.push("Saved");
    return parts.join(" · ");
  });

  // Drive the bell badge
  $effect(() => {
    const count = feed.jobs.filter((j) => !viewed.has(j.id)).length;
    unviewedCount.set(count);
  });

  // Focus search input when header icon opens search
  $effect(() => {
    if (showSearch && searchInputEl) {
      searchInputEl.focus();
    }
  });

  function buildFeedParams(limit = PAGE_SIZE, offset = 0) {
    const params: Record<string, string> = {
      sort: feed.sortBy,
      limit: String(limit),
      offset: String(offset),
    };

    if (feed.searchQuery.trim()) {
      params.q = feed.searchQuery.trim();
    }
    if (hasLocationFilter) {
      params.locations = feed.selectedLocations.join(",");
    }
    if (feed.savedOnly) {
      params.saved = "true";
    }
    const minSalary = parseInt(feed.minSalaryK, 10);
    const maxSalary = parseInt(feed.maxSalaryK, 10);
    if (Number.isFinite(minSalary)) params.min_salary = String(minSalary * 1000);
    if (Number.isFinite(maxSalary)) params.max_salary = String(maxSalary * 1000);
    if (feed.maxYoe) params.max_yoe = feed.maxYoe;

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
    const hadJobs = feed.jobs.length > 0;
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

        currentProfile = normalizeSearchProfile(prefsRes.search_profile);
        feed.lastPolled = statsRes.lastPolled ?? null;
      }

      const jobsRes = await api.jobs.list(buildFeedParams(limit, offset));
      if (version !== requestVersion) return;

      const incoming = jobsRes.jobs ?? [];
      if (!append && incoming.length > 0) {
        void api.interactions.event({
          event_name: "job_displayed",
          entity_type: "feed",
          properties: { count: incoming.length },
        }).catch(() => undefined);
      }
      if (append) {
        feed.jobs = [...feed.jobs, ...incoming];
      } else {
        feed.jobs = incoming;
      }

      feed.hasMore = Boolean(jobsRes.meta?.has_more);
      feed.nextOffset = jobsRes.meta?.next_offset ?? (offset + incoming.length);
      feed.hydrated = true;
      setFeedNavigationJobs(feed.jobs);
    } catch (e) {
      if (version !== requestVersion) return;
      if (!hadJobs || !append) {
        error = errorMessage(e);
      }
    } finally {
      if (version === requestVersion) {
        loading = false;
        loadingMore = false;
      }
    }
  }

  async function loadFeed(silent = false) {
    const preservedCount = Math.max(feed.jobs.length, PAGE_SIZE);
    await loadFeedPage({
      silent,
      append: false,
      limit: preservedCount,
      offset: 0,
    });
  }

  async function loadMore() {
    if (loading || loadingMore || refreshing || !feed.hasMore) return;
    await loadFeedPage({
      silent: true,
      append: true,
      limit: PAGE_SIZE,
      offset: feed.nextOffset,
    });
  }

  async function applyFeedFilters(updates?: {
    selectedLocations?: string[];
    sortBy?: FeedSort;
    searchQuery?: string;
    savedOnly?: boolean;
    minSalaryK?: string;
    maxSalaryK?: string;
    maxYoe?: string;
  }) {
    if (updates?.selectedLocations !== undefined) {
      feed.selectedLocations = updates.selectedLocations;
    }
    if (updates?.sortBy !== undefined) {
      feed.sortBy = updates.sortBy;
    }
    if (updates?.searchQuery !== undefined) {
      feed.searchQuery = updates.searchQuery;
    }
    if (updates?.savedOnly !== undefined) {
      feed.savedOnly = updates.savedOnly;
    }
    if (updates?.minSalaryK !== undefined) {
      feed.minSalaryK = updates.minSalaryK;
    }
    if (updates?.maxSalaryK !== undefined) {
      feed.maxSalaryK = updates.maxSalaryK;
    }
    if (updates?.maxYoe !== undefined) {
      feed.maxYoe = updates.maxYoe;
    }
    error = null;
    feed.hasMore = true;
    feed.nextOffset = 0;
    await loadFeedPage({
      silent: true,
      append: false,
      limit: PAGE_SIZE,
      offset: 0,
    });
  }

  function toggleLocationFilter(id: string) {
    if (id === "All") {
      feed.selectedLocations = ["All"];
      return;
    }

    const current = feed.selectedLocations.filter((item) => item !== "All");
    feed.selectedLocations = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];

    if (feed.selectedLocations.length === 0) {
      feed.selectedLocations = ["All"];
    }
  }

  function resetFilters() {
    feed.selectedLocations = ["All"];
    feed.minSalaryK = "";
    feed.maxSalaryK = "";
    feed.maxYoe = "";
    feed.savedOnly = false;
    showProfileConfirm = false;
  }

  const VALID_LOCATION_IDS = new Set<string>(LOCATION_OPTIONS.map((option) => option.id));

  let profileFilterChanges = $derived.by(() => {
    const changes: string[] = [];
    if (hasLocationFilter) {
      const labels = feed.selectedLocations.map(locationLabel).join(", ");
      changes.push(`Preferred locations: ${labels}`);
    }
    return changes;
  });

  async function saveCompatibleFiltersToProfile() {
    if (savingProfileFilters || profileFilterChanges.length === 0) return;
    savingProfileFilters = true;
    try {
      const locationIds = feed.selectedLocations
        .filter((id): id is LocationId => VALID_LOCATION_IDS.has(id));
      const includesRemote = feed.selectedLocations.includes("Remote");
      const nextProfile = normalizeSearchProfile({
        ...currentProfile,
        location_ids: hasLocationFilter ? locationIds : currentProfile.location_ids,
        work_modes: hasLocationFilter
          ? includesRemote
            ? [...new Set([...currentProfile.work_modes, "remote"])]
            : currentProfile.work_modes.filter((mode) => mode !== "remote")
          : currentProfile.work_modes,
      });
      const saved = await api.preferences.update({
        search_profile: nextProfile,
      });
      currentProfile = normalizeSearchProfile(saved.search_profile);
      await api.interactions.event({
        event_name: "search_profile_adjusted",
        entity_type: "search_profile",
        properties: { source: "feed_filters" },
      }).catch(() => undefined);
      showProfileConfirm = false;
      filtersOpen = false;
      await loadFeed(true);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      savingProfileFilters = false;
    }
  }

  async function applyFilterSheet() {
    filtersOpen = false;
    await applyFeedFilters({
      selectedLocations: [...feed.selectedLocations],
      minSalaryK: feed.minSalaryK,
      maxSalaryK: feed.maxSalaryK,
      maxYoe: feed.maxYoe,
      savedOnly: feed.savedOnly,
    });
  }

  function scheduleSearch(nextValue: string) {
    feed.searchQuery = nextValue;
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer);
    }
    searchTimer = window.setTimeout(() => {
      searchTimer = null;
      void applyFeedFilters({ searchQuery: nextValue });
    }, 220);
  }

  function closeSearch() {
    feed.searchQuery = "";
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
    void syncViewedJobs().catch(() => undefined);
    if (feed.hydrated && feed.jobs.length > 0) {
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

</script>

<div class="page" style="padding-top: 0;">
  <!-- Search bar (toggled from header or always visible) -->
  {#if showSearch || feed.searchQuery}
    <div style="padding: 8px 16px; display: flex; align-items: center; gap: 8px; border-bottom: 0.5px solid var(--color-line);">
      <input
        bind:this={searchInputEl}
        type="text"
        class="input-field"
        style="flex: 1; height: 40px; font-size: var(--fs-md); border-radius: var(--radius-sm);"
        placeholder="Search jobs or companies..."
        value={feed.searchQuery}
        oninput={(e) => scheduleSearch((e.currentTarget as HTMLInputElement).value)}
        onkeydown={(e) => { if (e.key === 'Escape') closeSearch(); }}
      />
      <button
        class="icon-btn icon-btn-sm"
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
    {#if feed.lastPolled}
      <span class:stat-warn={pollStale}>
        {pollStale ? `⚠ data may be stale · updated ${timeAgo(feed.lastPolled)}` : `updated ${timeAgo(feed.lastPolled)}`}
      </span>
    {/if}
  </div>

  <!-- Filters + sort -->
  <div class="feed-controls">
    <div class="feed-controls-bar">
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
      <div class="feed-sort-control">
        <ArrowsDownUp size={14} weight="bold" aria-hidden="true" />
        <select
          aria-label="Sort jobs"
          title={SORT_OPTIONS.find((option) => option.value === feed.sortBy)?.hint}
          value={feed.sortBy}
          onchange={(event) => void applyFeedFilters({
            sortBy: event.currentTarget.value as FeedSort,
          })}
        >
          {#each SORT_OPTIONS as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <CaretDown class="feed-sort-caret" size={12} weight="bold" aria-hidden="true" />
      </div>
    </div>
    {#if filterSummary}
      <div class="filter-summary">{filterSummary}</div>
    {/if}
  </div>

  <div class="divider"></div>

  <!-- Job rows -->
  <div>
    {#if loading}
      {#each Array(6) as _}
        <div style="display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: center; padding: 10px 16px; border-bottom: 0.5px solid var(--color-line);">
          <div class="skeleton" style="width: 24px; height: 24px;"></div>
          <div>
            <div class="skeleton" style="width: 45%; height: 8px; margin-bottom: 6px;"></div>
            <div class="skeleton" style="width: 72%; height: 12px; margin-bottom: 6px;"></div>
            <div class="skeleton" style="width: 50%; height: 8px;"></div>
          </div>
        </div>
      {/each}
    {:else if error}
      <div class="alert alert-error" style="margin: 16px;">
        {error}
      </div>
    {:else if feed.jobs.length === 0}
      <div style="text-align: center; padding: 48px 24px; color: var(--color-ink-3);">
        <h2 class="h-display h-display-sm" style="color: var(--color-ink-2); margin-bottom: 8px;">
          {feed.savedOnly ? "No saved jobs yet" : "Nothing here"}
        </h2>
        <div style="font-size: var(--fs-sm); margin-bottom: 14px;">
          {feed.savedOnly ? "Save roles from the detail view to keep them handy." : "Adjust your filters or check back later."}
        </div>
        <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
          <button class="btn-secondary" onclick={triggerRefresh} disabled={refreshing}>
            {#if refreshing}<Spinner />{/if}
            Refresh now
          </button>
        </div>
      </div>
    {:else}
      {#each feed.jobs as job (job.id)}
        <div animate:flip={{ duration: 240, easing: cubicOut }}>
          <JobRow {job} viewed={viewed.has(job.id)} onDismiss={removeJob} />
        </div>
      {/each}
      {#if loadingMore}
        <div class="loading-label" style="padding: 18px 16px; color: var(--color-ink-3); font-size: var(--fs-sm);" aria-busy="true">
          <Spinner label="Loading more jobs" />
          <span>Loading more jobs</span>
        </div>
      {/if}
      {#if feed.hasMore}
        <div bind:this={loadMoreSentinel} style="height: 1px;"></div>
      {:else}
        <div style="padding: 24px 16px; text-align: center; color: var(--color-ink-4); font-size: var(--fs-xs);">
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
              <div class="section-label">Temporary controls</div>
              <Dialog.Title class="h-display h-display-md">Filter this view</Dialog.Title>
            </div>
            <button class="icon-btn" aria-label="Close filters" onclick={() => (filtersOpen = false)}>
              <X size={18} />
            </button>
          </div>

          <div class="filter-sheet-body">
            <section class="filter-group">
              <div class="filter-group-title">Location</div>
              <div class="filter-option-grid">
                {#each LOCATION_CHOICES as choice}
                  <button
                    class="filter-choice"
                    class:active={feed.selectedLocations.includes(choice.id)}
                    aria-pressed={feed.selectedLocations.includes(choice.id)}
                    onclick={() => toggleLocationFilter(choice.id)}
                  >
                    {choice.label}
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
                    <input inputmode="numeric" placeholder="120" bind:value={feed.minSalaryK} />
                    <span>K</span>
                  </div>
                </label>
                <label>
                  <span>Max</span>
                  <div class="filter-money-input">
                    <span>$</span>
                    <input inputmode="numeric" placeholder="250" bind:value={feed.maxSalaryK} />
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
                    class:active={feed.maxYoe === option.value}
                    aria-pressed={feed.maxYoe === option.value}
                    onclick={() => (feed.maxYoe = option.value)}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            </section>

            <section class="filter-group">
              <div class="filter-toggle" class:active={feed.savedOnly}>
                <span>Saved jobs only</span>
                <Switch
                  checked={feed.savedOnly}
                  onCheckedChange={(value) => (feed.savedOnly = value)}
                  aria-label="Saved jobs only"
                />
              </div>
            </section>
          </div>

          {#if showProfileConfirm}
            <div style="margin: 0 16px 12px; padding: 14px; border: 1px solid var(--color-line-2); border-radius: var(--radius-md); background: var(--color-bg-sunken);">
              <div style="font-size: var(--fs-sm); font-weight: 700; margin-bottom: 7px;">Update your search profile?</div>
              {#each profileFilterChanges as change}
                <div style="font-size: var(--fs-2xs); color: var(--color-ink-3); line-height: 1.5;">{change}</div>
              {/each}
              <div style="font-size: var(--fs-2xs); color: var(--color-ink-4); line-height: 1.4; margin-top: 7px;">
                Salary, experience, sorting, search text, and saved-only remain temporary.
              </div>
              <div class="action-row compact" style="margin-top: 11px;">
                <button class="btn-secondary" onclick={() => { showProfileConfirm = false; }}>Cancel</button>
                <button class="btn-primary btn-accent" onclick={saveCompatibleFiltersToProfile} disabled={savingProfileFilters}>
                  {#if savingProfileFilters}<Spinner />{/if}
                  Update profile
                </button>
              </div>
            </div>
          {/if}

          <div class="filter-sheet-actions action-row">
            <button class="btn-secondary" onclick={resetFilters}>Reset filters</button>
            {#if profileFilterChanges.length > 0 && !showProfileConfirm}
              <button class="btn-secondary" onclick={() => { showProfileConfirm = true; }}>Update profile</button>
            {/if}
            <button class="btn-primary btn-accent" onclick={applyFilterSheet}>Apply filters</button>
          </div>
        </div>
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
