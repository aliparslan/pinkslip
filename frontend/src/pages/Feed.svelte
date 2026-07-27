<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { timeAgo, errorMessage } from "../lib/utils";
  import { feed, PAGE_SIZE } from "../lib/feed-store.svelte";
  import { syncViewedJobs, viewedJobs } from "../lib/viewed";
  import { removeFeedNavigationJob, setFeedNavigationJobs } from "../lib/feed-navigation";
  import JobRow from "../components/JobRow.svelte";
  import Spinner from "../components/Spinner.svelte";
  import Switch from "../components/Switch.svelte";
  import { Dialog } from "bits-ui";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Check from "phosphor-svelte/lib/Check";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import SlidersHorizontal from "phosphor-svelte/lib/SlidersHorizontal";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import X from "phosphor-svelte/lib/X";
  import { dragDismiss } from "../lib/drag-dismiss";
  import {
    LOCATION_OPTIONS,
    type LocationId,
  } from "../../../shared/search-profile";

  // Compact labels for the shared metro catalog. The filter sends metro
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
    { id: "All", label: "Anywhere" },
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
    { label: "0-3", value: "3" },
  ];

  // Show the staleness warning once the poller is clearly behind its
  // 15-minute schedule (not just between runs).
  const POLL_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

  let loading: boolean = $state(!feed.hydrated && feed.jobs.length === 0);
  let error: string | null = $state(null);
  let filtersOpen: boolean = $state(false);
  let refreshing: boolean = $state(false);
  let loadingMore: boolean = $state(false);
  let lastAutoRefreshAt = 0;
  let searchTimer: number | null = null;
  let loadMoreSentinel: HTMLDivElement | undefined = $state(undefined);
  let requestVersion = 0;
  let draftSelectedLocations: string[] = $state(["All"]);
  let draftMinSalaryK = $state("");
  let draftMaxSalaryK = $state("");
  let draftMaxYoe = $state("");
  let draftSavedOnly = $state(false);

  function removeJob(id: string) {
    feed.jobs = feed.jobs.filter((j) => j.id !== id);
    removeFeedNavigationJob(id);
  }

  let viewed = $derived($viewedJobs);
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
  let draftHasLocationFilter = $derived(
    !(draftSelectedLocations.length === 1 && draftSelectedLocations[0] === "All")
  );
  let draftFilterCount = $derived.by(() => {
    let count = 0;
    if (draftHasLocationFilter) count += 1;
    if (draftMinSalaryK.trim() || draftMaxSalaryK.trim()) count += 1;
    if (draftMaxYoe) count += 1;
    if (draftSavedOnly) count += 1;
    return count;
  });
  let locationSummary = $derived.by(() => {
    if (!hasLocationFilter) return "Anywhere";
    const labels = feed.selectedLocations.map(locationLabel);
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  });
  let draftLocationSummary = $derived.by(() => {
    if (!draftHasLocationFilter) return "Anywhere";
    const labels = draftSelectedLocations.map(locationLabel);
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  });
  let filterSummary = $derived.by(() => {
    const parts: string[] = [];
    if (hasLocationFilter) {
      parts.push(locationSummary);
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

  function buildFeedParams(limit = PAGE_SIZE, offset = 0) {
    const params: Record<string, string> = {
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
        const statsRes = await api.stats.get();

        if (version !== requestVersion) return;

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
    searchQuery?: string;
    savedOnly?: boolean;
    minSalaryK?: string;
    maxSalaryK?: string;
    maxYoe?: string;
  }) {
    if (updates?.selectedLocations !== undefined) {
      feed.selectedLocations = updates.selectedLocations;
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
      draftSelectedLocations = ["All"];
      return;
    }

    const current = draftSelectedLocations.filter((item) => item !== "All");
    draftSelectedLocations = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];

    if (draftSelectedLocations.length === 0) {
      draftSelectedLocations = ["All"];
    }
  }

  function openFilterSheet() {
    draftSelectedLocations = [...feed.selectedLocations];
    draftMinSalaryK = feed.minSalaryK;
    draftMaxSalaryK = feed.maxSalaryK;
    draftMaxYoe = feed.maxYoe;
    draftSavedOnly = feed.savedOnly;
    filtersOpen = true;
  }

  function resetFilters() {
    draftSelectedLocations = ["All"];
    draftMinSalaryK = "";
    draftMaxSalaryK = "";
    draftMaxYoe = "";
    draftSavedOnly = false;
  }

  async function applyFilterSheet() {
    filtersOpen = false;
    await applyFeedFilters({
      selectedLocations: [...draftSelectedLocations],
      minSalaryK: draftMinSalaryK,
      maxSalaryK: draftMaxSalaryK,
      maxYoe: draftMaxYoe,
      savedOnly: draftSavedOnly,
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

  // The feed scrolls at the document level. Lock both roots while the sheet is
  // open so touch gestures belong to the filter surface, not the list behind it.
  $effect(() => {
    if (!filtersOpen) return;
    const rootOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = rootOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  });

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

<div class="page root-screen feed-page">
  <header class="root-screen-header">
    <h1 class="h-display h-display-lg">Feed</h1>
  </header>

  <!-- Search and filtering share one compact control surface. -->
  <div class="feed-controls">
    <div class="feed-toolbar">
      <label class="feed-search">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search"
          aria-label="Search jobs or companies"
          value={feed.searchQuery}
          oninput={(event) => scheduleSearch(event.currentTarget.value)}
        />
      </label>
      <button
        class="filter-button"
        class:active={activeFilterCount > 0}
        onclick={openFilterSheet}
        aria-label="Open filters"
      >
        <SlidersHorizontal size={15} weight="bold" />
        <span>Filters</span>
        {#if activeFilterCount > 0}
          <span class="filter-count">{activeFilterCount}</span>
        {/if}
      </button>
    </div>
    {#if filterSummary}
      <div class="filter-summary">{filterSummary}</div>
    {/if}
  </div>

  {#if pollStale && feed.lastPolled}
    <div class="feed-stale-notice">
      <WarningCircle size={15} weight="bold" aria-hidden="true" />
      <span>Results may be stale · updated {timeAgo(feed.lastPolled)}</span>
      <button onclick={triggerRefresh} disabled={refreshing}>
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  {/if}

  <div class="divider"></div>

  <!-- Job rows -->
  <div>
    {#if loading}
      {#each Array(6) as _}
        <div class="feed-skeleton-row">
          <div class="skeleton feed-skeleton-logo"></div>
          <div class="feed-skeleton-copy">
            <div class="skeleton feed-skeleton-line feed-skeleton-company"></div>
            <div class="skeleton feed-skeleton-line feed-skeleton-title"></div>
            <div class="skeleton feed-skeleton-line feed-skeleton-meta"></div>
          </div>
        </div>
      {/each}
    {:else if error}
      <div class="alert alert-error feed-error">
        {error}
      </div>
    {:else if feed.jobs.length === 0}
      <div class="empty-state">
        <h2 class="h-display h-display-sm empty-state-title">
          {feed.savedOnly ? "No saved jobs yet" : "Nothing here"}
        </h2>
        <div class="empty-state-copy feed-empty-copy">
          {feed.savedOnly ? "Save roles from the detail view to keep them handy." : "Adjust your filters or check back later."}
        </div>
        <div class="button-cluster center">
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
        <div class="loading-label feed-loading-more" aria-busy="true">
          <Spinner label="Loading more jobs" />
          <span>Loading more jobs</span>
        </div>
      {/if}
      {#if feed.hasMore}
        <div bind:this={loadMoreSentinel} class="feed-sentinel"></div>
      {:else}
        <div class="feed-end">
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
            <Dialog.Title class="h-display h-display-md">Filters</Dialog.Title>
            <button class="icon-btn" aria-label="Close filters" onclick={() => (filtersOpen = false)}>
              <X size={18} />
            </button>
          </div>

          <div class="filter-sheet-body">
            <section class="filter-group">
              <div class="filter-group-title">Location</div>
              <details class="filter-location-select">
                <summary>
                  <span>{draftLocationSummary}</span>
                  <CaretDown size={14} weight="bold" aria-hidden="true" />
                </summary>
                <div class="filter-location-options">
                  {#each LOCATION_CHOICES as choice}
                    <button
                      type="button"
                      class:active={draftSelectedLocations.includes(choice.id)}
                      aria-pressed={draftSelectedLocations.includes(choice.id)}
                      onclick={() => toggleLocationFilter(choice.id)}
                    >
                      <span>{choice.label}</span>
                      {#if draftSelectedLocations.includes(choice.id)}
                        <Check size={16} weight="bold" aria-hidden="true" />
                      {/if}
                    </button>
                  {/each}
                </div>
              </details>
            </section>

            <section class="filter-group">
              <div class="filter-group-title">Salary</div>
              <div class="filter-input-grid">
                <label>
                  <span>Min</span>
                  <div class="filter-money-input">
                    <span>$</span>
                    <input inputmode="numeric" placeholder="120" bind:value={draftMinSalaryK} />
                    <span>K</span>
                  </div>
                </label>
                <label>
                  <span>Max</span>
                  <div class="filter-money-input">
                    <span>$</span>
                    <input inputmode="numeric" placeholder="250" bind:value={draftMaxSalaryK} />
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
                    class:active={draftMaxYoe === option.value}
                    aria-pressed={draftMaxYoe === option.value}
                    onclick={() => (draftMaxYoe = option.value)}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            </section>

            <section class="filter-group">
              <div class="filter-toggle" class:active={draftSavedOnly}>
                <span>Saved jobs only</span>
                <Switch
                  checked={draftSavedOnly}
                  onCheckedChange={(value) => (draftSavedOnly = value)}
                  aria-label="Saved jobs only"
                />
              </div>
            </section>
          </div>

          <div class="filter-sheet-actions action-row" class:single={draftFilterCount === 0}>
            {#if draftFilterCount > 0}
              <button class="btn-secondary" onclick={resetFilters}>Reset</button>
            {/if}
            <button class="btn-primary btn-accent" onclick={applyFilterSheet}>Apply</button>
          </div>
        </div>
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
