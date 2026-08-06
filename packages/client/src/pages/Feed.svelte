<script lang="ts">
  import { onMount } from "svelte";
  import { scrollContainer } from "../router";
  import { api, type Job } from "../lib/api";
  import { timeAgo, errorMessage } from "../lib/utils";
  import { feed, markLocationsManuallySet, PAGE_SIZE, type PostedFilter } from "../lib/feed-store.svelte";
  import { syncViewedJobs, viewedJobs } from "../lib/viewed";
  import JobRow from "../components/JobRow.svelte";
  import VirtualJobList from "../components/VirtualJobList.svelte";
  import Spinner from "../components/Spinner.svelte";
  import Switch from "../components/Switch.svelte";
  import Modal from "../components/Modal.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import { Dialog, Slider } from "bits-ui";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Check from "phosphor-svelte/lib/Check";
  import ClockCountdown from "phosphor-svelte/lib/ClockCountdown";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import SlidersHorizontal from "phosphor-svelte/lib/SlidersHorizontal";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import X from "phosphor-svelte/lib/X";
  import { dragDismiss } from "../lib/drag-dismiss";
  import { createFrameBatch, delay } from "../lib/motion";
  import {
    LOCATION_OPTIONS,
    type LocationId,
  } from "../../../../shared/search-profile";
  import { MAX_POSTED_AGE_DAYS } from "../../../../shared/job-policy";
  import { isIosApp } from "../lib/platform";

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

  const POSTED_OPTIONS: Array<{ label: string; value: PostedFilter }> = [
    { label: "All", value: "any" },
    { label: "Evergreen only", value: "evergreen" },
  ];

  // Show the staleness warning once the poller is clearly behind its
  // 15-minute schedule (not just between runs).
  const POLL_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
  // Returning from Job Detail should preserve the exact list. Ambient focus
  // events may refresh it later without changing it underneath back navigation.
  const FEED_REFRESH_AFTER_MS = 5 * 60 * 1000;

  let loading: boolean = $state(!feed.hydrated && feed.jobs.length === 0);
  let error: string | null = $state(null);
  let filtersOpen: boolean = $state(false);
  let refreshing: boolean = $state(false);
  let loadingMore: boolean = $state(false);
  let searchTimer: number | null = null;
  let loadMoreSentinel: HTMLDivElement | undefined = $state(undefined);
  let feedPage: HTMLDivElement | undefined = $state(undefined);
  let pullOffset = $state(0);
  let pullArmed = $state(false);
  let pullSettling = $state(false);
  let pullTimer: number | null = null;
  let pullCandidate = false;
  let pullStartX = 0;
  let pullStartY = 0;
  let requestVersion = 0;
  let handledPreferenceRevision = feed.preferenceRevision;
  let draftSelectedLocations: string[] = $state(["All"]);
  let draftMinSalaryK = $state("");
  let draftMaxSalaryK = $state("");
  let draftYoeRange: number[] = $state([0, 3]);
  let draftSavedOnly = $state(false);
  let draftPostedFilter: PostedFilter = $state("any");
  let blockCandidate: Job | null = $state(null);
  let blockingJob = $state(false);
  const hiddenJobPositions = new Map<string, number>();
  const nativeIos = isIosApp();
  const pullBatch = createFrameBatch<number>((value) => {
    pullOffset = value;
    pullArmed = value >= 44;
  }, nativeIos);

  function removeJob(id: string) {
    const index = feed.jobs.findIndex((job) => job.id === id);
    if (index >= 0) hiddenJobPositions.set(id, index);
    feed.jobs = feed.jobs.filter((j) => j.id !== id);
  }

  function restoreJob(job: Job) {
    if (feed.jobs.some((item) => item.id === job.id)) return;
    const nextJobs = [...feed.jobs];
    const index = Math.min(hiddenJobPositions.get(job.id) ?? 0, nextJobs.length);
    nextJobs.splice(index, 0, job);
    hiddenJobPositions.delete(job.id);
    feed.jobs = nextJobs;
  }

  function markJobSaved(id: string) {
    feed.jobs = feed.jobs.map((job) =>
      job.id === id ? { ...job, saved: 1 } : job
    );
  }

  async function blockJobForEveryone() {
    if (!blockCandidate || blockingJob) return;
    const job = blockCandidate;
    blockingJob = true;
    try {
      await api.jobs.block(job.id);
      removeJob(job.id);
      hiddenJobPositions.delete(job.id);
      blockCandidate = null;
      feedback.success("Job blocked for everyone");
    } catch (e) {
      feedback.error(errorMessage(e, "Could not block that job."));
    } finally {
      blockingJob = false;
    }
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
    if (feed.minYoe !== 0 || feed.maxYoe !== 3) count += 1;
    if (feed.savedOnly) count += 1;
    if (feed.postedFilter !== "any") count += 1;
    return count;
  });
  // Filters the empty state can actually offer to clear. `savedOnly` is excluded:
  // it selects a view rather than narrowing one, so clearing it would bounce the
  // user out of the saved list they deliberately opened.
  let refinableFilterCount = $derived(activeFilterCount - (feed.savedOnly ? 1 : 0));
  let draftHasLocationFilter = $derived(
    !(draftSelectedLocations.length === 1 && draftSelectedLocations[0] === "All")
  );
  let draftFilterCount = $derived.by(() => {
    let count = 0;
    if (draftHasLocationFilter) count += 1;
    if (draftMinSalaryK.trim() || draftMaxSalaryK.trim()) count += 1;
    if ((draftYoeRange[0] ?? 0) !== 0 || (draftYoeRange[1] ?? 3) !== 3) count += 1;
    if (draftSavedOnly) count += 1;
    if (draftPostedFilter !== "any") count += 1;
    return count;
  });
  let draftLocationSummary = $derived.by(() => {
    if (!draftHasLocationFilter) return "Anywhere";
    const labels = draftSelectedLocations.map(locationLabel);
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  });
  let draftMinYoe = $derived(draftYoeRange[0] ?? 0);
  let draftMaxYoe = $derived(draftYoeRange[1] ?? 3);

  function experienceRangeLabel(min: number, max: number): string {
    if (min === 0 && max === 0) return "No experience";
    if (min === max) return `${min} ${min === 1 ? "year" : "years"}`;
    return `${min}–${max} years`;
  }
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
    if (feed.minYoe > 0) params.min_yoe = String(feed.minYoe);
    if (feed.maxYoe < 3) params.max_yoe = String(feed.maxYoe);
    if (feed.postedFilter !== "any") params.posted = feed.postedFilter;

    return params;
  }

  async function loadFeedPage(options?: {
    silent?: boolean;
    append?: boolean;
    mergeFresh?: boolean;
    minimumBusyMs?: number;
    limit?: number;
    offset?: number;
  }) {
    const silent = options?.silent ?? false;
    const append = options?.append ?? false;
    const mergeFresh = options?.mergeFresh ?? false;
    const minimumBusyMs = options?.minimumBusyMs ?? 0;
    const limit = options?.limit ?? PAGE_SIZE;
    const offset = options?.offset ?? 0;
    const hadJobs = feed.jobs.length > 0;
    const previousJobs = feed.jobs;
    const busyStartedAt = performance.now();
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
      let jobsRes: Awaited<ReturnType<typeof api.jobs.list>>;
      if (!append && nativeIos) {
        const [statsRes, nextJobs] = await Promise.all([
          api.stats.get(),
          api.jobs.list(buildFeedParams(limit, offset)),
        ]);
        if (version !== requestVersion) return;
        feed.lastPolled = statsRes.lastPolled ?? null;
        jobsRes = nextJobs;
      } else {
        if (!append) {
          const statsRes = await api.stats.get();
          if (version !== requestVersion) return;
          feed.lastPolled = statsRes.lastPolled ?? null;
        }
        jobsRes = await api.jobs.list(buildFeedParams(limit, offset));
      }
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
        if (nativeIos) {
          const existing = new Set(feed.jobs.map((job) => job.id));
          feed.jobs = [...feed.jobs, ...incoming.filter((job) => !existing.has(job.id))];
        } else {
          feed.jobs = [...feed.jobs, ...incoming];
        }
      } else if (mergeFresh) {
        const freshIds = new Set(incoming.map((job) => job.id));
        feed.jobs = [...incoming, ...previousJobs.filter((job) => !freshIds.has(job.id))];
      } else {
        feed.jobs = incoming;
      }

      feed.hasMore = Boolean(jobsRes.meta?.has_more);
      const serverOffset = jobsRes.meta?.next_offset ?? (offset + incoming.length);
      feed.nextOffset = mergeFresh ? Math.max(previousJobs.length, serverOffset) : serverOffset;
      feed.hydrated = true;
      feed.lastLoadedAt = Date.now();
    } catch (e) {
      if (version !== requestVersion) return;
      if (!hadJobs || !append) {
        error = errorMessage(e);
      }
    } finally {
      if (version === requestVersion) {
        if (append && minimumBusyMs > 0) {
          const remaining = minimumBusyMs - (performance.now() - busyStartedAt);
          if (remaining > 0) await delay(remaining);
        }
        loading = false;
        loadingMore = false;
      }
    }
  }

  async function loadFeed(silent = false, preserveExisting = nativeIos && silent) {
    const preservedCount = Math.max(feed.jobs.length, PAGE_SIZE);
    await loadFeedPage({
      silent,
      append: false,
      mergeFresh: nativeIos && preserveExisting && feed.jobs.length > 0,
      limit: nativeIos ? PAGE_SIZE : preservedCount,
      offset: 0,
    });
  }

  async function loadMore() {
    if (loading || loadingMore || refreshing || !feed.hasMore) return;
    await loadFeedPage({
      silent: true,
      append: true,
      minimumBusyMs: nativeIos ? 320 : 0,
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
    minYoe?: number;
    maxYoe?: number;
    postedFilter?: PostedFilter;
  }) {
    if (updates?.selectedLocations !== undefined) {
      feed.selectedLocations = updates.selectedLocations;
      markLocationsManuallySet();
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
    if (updates?.minYoe !== undefined) {
      feed.minYoe = updates.minYoe;
    }
    if (updates?.maxYoe !== undefined) {
      feed.maxYoe = updates.maxYoe;
    }
    if (updates?.postedFilter !== undefined) {
      feed.postedFilter = updates.postedFilter;
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
    draftYoeRange = [feed.minYoe ?? 0, feed.maxYoe ?? 3];
    draftSavedOnly = feed.savedOnly;
    draftPostedFilter = feed.postedFilter;
    filtersOpen = true;
  }

  // Clears the narrowing filters from the empty state. Omitting `savedOnly` leaves
  // the current view intact; `openFilterSheet` re-syncs the drafts from feed state,
  // so the sheet reflects this the next time it opens.
  async function clearRefinableFilters() {
    await applyFeedFilters({
      selectedLocations: ["All"],
      minSalaryK: "",
      maxSalaryK: "",
      minYoe: 0,
      maxYoe: 3,
      postedFilter: "any",
    });
  }

  function resetFilters() {
    draftSelectedLocations = ["All"];
    draftMinSalaryK = "";
    draftMaxSalaryK = "";
    draftYoeRange = [0, 3];
    draftSavedOnly = false;
    draftPostedFilter = "any";
  }

  async function applyFilterSheet() {
    filtersOpen = false;
    await applyFeedFilters({
      selectedLocations: [...draftSelectedLocations],
      minSalaryK: draftMinSalaryK,
      maxSalaryK: draftMaxSalaryK,
      minYoe: draftMinYoe,
      maxYoe: draftMaxYoe,
      savedOnly: draftSavedOnly,
      postedFilter: draftPostedFilter,
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

  function commitSearch(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer);
      searchTimer = null;
    }
    const input = event.currentTarget as HTMLInputElement;
    input.blur();
    void applyFeedFilters({ searchQuery: input.value });
  }

  async function triggerRefresh() {
    if (refreshing) return;
    refreshing = true;
    error = null;
    await loadFeed(true);
    refreshing = false;
  }

  async function refreshIfStale(force = false) {
    const now = Date.now();
    if (refreshing || loading) return;
    if (!force && feed.hydrated && now - feed.lastLoadedAt < FEED_REFRESH_AFTER_MS) return;
    await loadFeed(true);
  }

  $effect(() => {
    const revision = feed.preferenceRevision;
    if (revision === handledPreferenceRevision) return;
    handledPreferenceRevision = revision;
    void loadFeed(true, false);
  });

  $effect(() => {
    if (!filtersOpen) return;
    const container = scrollContainer();
    if (!container) return;
    const previousOverflow = container.style.overflow;
    container.style.overflow = "hidden";
    return () => {
      container.style.overflow = previousOverflow;
    };
  });

  function finishPull(showStatus: boolean) {
    if (showStatus) {
      pullCandidate = false;
      pullArmed = false;
      pullSettling = true;
      pullOffset = 48;
      void triggerRefresh().finally(() => {
        pullOffset = 0;
        window.setTimeout(() => { pullSettling = false; }, 240);
      });
      return;
    }
    pullCandidate = false;
    pullArmed = showStatus;
    pullSettling = true;
    // The status is visible only while the user is actively overscrolling.
    // Release immediately retracts it instead of pinning the list for 1.25s.
    pullOffset = 0;
    if (pullTimer !== null) window.clearTimeout(pullTimer);
    pullTimer = window.setTimeout(() => {
      pullArmed = false;
      pullSettling = false;
      pullTimer = null;
    }, 240);
  }

  $effect(() => {
    const element = feedPage;
    if (!nativeIos || !element) return;

    const handleTouchStart = (event: TouchEvent) => {
      pullCandidate = false;
      if (pullSettling || filtersOpen || (scrollContainer()?.scrollTop ?? 0) > 0 || event.touches.length !== 1) return;
      const touch = event.touches[0];
      pullStartX = touch.clientX;
      pullStartY = touch.clientY;
      pullCandidate = true;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!pullCandidate) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - pullStartX;
      const dy = touch.clientY - pullStartY;
      if (dy <= 0 || Math.abs(dx) > dy) {
        finishPull(false);
        return;
      }
      if (dy < 6) return;
      event.preventDefault();
      const nextOffset = Math.min(68, Math.round((1 - Math.exp(-dy / 105)) * 82));
      pullBatch.schedule(nextOffset);
    };
    const handleTouchEnd = () => {
      if (!pullCandidate) return;
      pullBatch.flush();
      finishPull(pullArmed);
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
      pullBatch.cancel();
    };
  });

  onMount(() => {
    void syncViewedJobs().catch(() => undefined);
    if (feed.hydrated && feed.jobs.length > 0) {
      loading = false;
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
        refreshIfStale(true);
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
      if (pullTimer !== null) window.clearTimeout(pullTimer);
      pullBatch.cancel();
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
      { root: nativeIos ? scrollContainer() : null, rootMargin: "280px 0px" }
    );

    observer.observe(loadMoreSentinel);

    return () => {
      observer.disconnect();
    };
  });

</script>

<div bind:this={feedPage} class="page root-screen feed-page" class:pull-settling={pullSettling}>
  <!-- Search and filtering share one compact control surface. -->
  <div class="feed-controls">
    <div class="feed-toolbar">
      <label class="feed-search">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <input
          type="search"
          enterkeyhint="search"
          placeholder="Search"
          aria-label="Search jobs or companies"
          value={feed.searchQuery}
          oninput={(event) => scheduleSearch(event.currentTarget.value)}
          onkeydown={commitSearch}
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
          {#key activeFilterCount}
            <span class="filter-count">{activeFilterCount}</span>
          {/key}
        {/if}
      </button>
    </div>
    <div
      class="feed-pull-reveal"
      class:armed={pullArmed}
      style:height={`${pullOffset}px`}
      style:opacity={Math.min(1, pullOffset / 34)}
      role="status"
      aria-hidden={!pullArmed && !refreshing}
    >
      <ClockCountdown size={17} weight="bold" aria-hidden="true" />
      <span>{nativeIos ? (refreshing ? "Refreshing jobs…" : pullArmed ? "Release to refresh" : "Pull to refresh") : "Updates every 15 minutes. You’re caught up."}</span>
    </div>
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

  <div aria-busy={nativeIos ? (loading || refreshing || loadingMore) : undefined}>
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
      <div class="alert alert-error feed-error" role="alert">
        {error}
        {#if nativeIos}<button class="btn-secondary" onclick={() => void loadFeed()}>Try again</button>{/if}
      </div>
    {:else if feed.jobs.length === 0}
      <div class="empty-state">
        <h2 class="h-display h-display-sm empty-state-title">
          {#if refinableFilterCount > 0}
            {feed.savedOnly ? "No saved jobs match your filters" : "No jobs match your filters"}
          {:else if feed.savedOnly}
            No saved jobs yet
          {:else}
            No jobs right now
          {/if}
        </h2>
        <div class="empty-state-copy feed-empty-copy">
          {#if feed.postedFilter === "evergreen"}
            {nativeIos ? "No open longer-term roles match your other filters." : "No standing or aged-but-open roles match your other filters."}
          {:else if refinableFilterCount > 0}
            Try widening or clearing your filters.
          {:else if feed.savedOnly}
            Save roles from the detail view to keep them handy.
          {:else}
            New roles show up here as they’re posted.
          {/if}
        </div>
        <div class="button-cluster center">
          {#if refinableFilterCount > 0}
            <button class="btn-secondary" onclick={clearRefinableFilters}>
              Clear filters
            </button>
          {/if}
          <button class="btn-secondary" onclick={triggerRefresh} disabled={refreshing}>
            {#if refreshing}<Spinner />{/if}
            Refresh now
          </button>
        </div>
      </div>
    {:else}
      {#if nativeIos}
        <VirtualJobList
          jobs={feed.jobs}
          {viewed}
          onDismiss={removeJob}
          onRestore={restoreJob}
          onSaved={markJobSaved}
          onBlockRequest={(candidate) => (blockCandidate = candidate)}
        />
      {:else}
        {#each feed.jobs as job (job.id)}
          <div animate:flip={{ duration: 240, easing: cubicOut }}>
            <JobRow
              {job}
              viewed={viewed.has(job.id)}
              onDismiss={removeJob}
              onRestore={restoreJob}
              onSaved={markJobSaved}
              onBlockRequest={(candidate) => (blockCandidate = candidate)}
            />
          </div>
        {/each}
      {/if}
      {#if loadingMore}
        <div class="loading-label feed-loading-more" aria-busy="true">
          <Spinner label="Loading more jobs" />
          {#if !nativeIos}<span>Loading more jobs</span>{/if}
        </div>
      {/if}
      {#if feed.hasMore}
        <div bind:this={loadMoreSentinel} class="feed-sentinel"></div>
      {:else}
        <div class="feed-end">
          {nativeIos ? "You’re caught up for today." : "You’re all caught up. Go touch grass."}
        </div>
      {/if}
    {/if}
  </div>
</div>

<Dialog.Root bind:open={filtersOpen}>
  <Dialog.Portal>
    <Dialog.Overlay forceMount>
      {#snippet child({ props, open })}
        {#if open}
          <div
            {...props}
            class="sheet-backdrop"
            in:fade={{ duration: 160 }}
            out:fade={{ duration: 120 }}
          ></div>
        {/if}
      {/snippet}
    </Dialog.Overlay>
    <Dialog.Content forceMount restoreScrollDelay={260}>
      {#snippet child({ props, open })}
        {#if open}
          <div
            {...props}
            class="sheet filter-sheet"
            use:dragDismiss={{ onDismiss: () => (filtersOpen = false), base: "translateX(-50%)" }}
            in:fly={{ y: 20, duration: 220, easing: cubicOut }}
            out:fly={{ y: 14, duration: 140, easing: cubicOut }}
          >
          <div class="sheet-handle"></div>
          <div class="filter-sheet-header">
            <Dialog.Title class="h-display h-display-md">Filters</Dialog.Title>
            <button class="icon-btn" aria-label="Close filters" onclick={() => (filtersOpen = false)}>
              <X size={nativeIos ? 20 : 18} weight={nativeIos ? "bold" : "regular"} />
            </button>
          </div>

          <div class="filter-sheet-body">
            <section class="filter-group">
              <div class="filter-group-title">Location</div>
              <details class="filter-location-select">
                <summary>
                  <span class="truncate">{draftLocationSummary}</span>
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
                      <span class="select-check" aria-hidden="true">
                        {#if draftSelectedLocations.includes(choice.id)}
                          <Check size={14} weight="bold" />
                        {/if}
                      </span>
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
              <div class="filter-range-heading">
                <span id="experience-filter-label">Experience required</span>
                <output>
                  {experienceRangeLabel(draftMinYoe, draftMaxYoe)}
                </output>
              </div>
              <div class="filter-range">
                <Slider.Root
                  class="filter-dual-range"
                  type="multiple"
                  bind:value={draftYoeRange}
                  min={0}
                  max={3}
                  step={1}
                  aria-labelledby="experience-filter-label"
                >
                  <Slider.Range class="filter-dual-range-fill" />
                  <Slider.Thumb
                    class="filter-dual-range-thumb"
                    index={0}
                    aria-label="Minimum experience required"
                    aria-valuetext={draftMinYoe === 0 ? "No minimum experience" : `${draftMinYoe} years minimum`}
                  />
                  <Slider.Thumb
                    class="filter-dual-range-thumb"
                    index={1}
                    aria-label="Maximum experience required"
                    aria-valuetext={`${draftMaxYoe} years maximum`}
                  />
                </Slider.Root>
                <div class="filter-range-ticks" aria-hidden="true">
                  <span>0</span><span>1</span><span>2</span><span>3</span>
                </div>
              </div>
            </section>

            <details class="advanced-fields filter-advanced" open={!nativeIos}>
              {#if nativeIos}<summary>Advanced filters</summary>{/if}
            <section class="filter-group">
              <div class="filter-group-title">Listing type</div>
              <div class="filter-option-grid binary">
                {#each POSTED_OPTIONS as option}
                  <button
                    class="filter-choice"
                    class:active={draftPostedFilter === option.value}
                    aria-pressed={draftPostedFilter === option.value}
                    onclick={() => (draftPostedFilter = option.value)}
                  >
                    {nativeIos && option.value === "evergreen" ? "Open longer-term" : option.label}
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
            </details>
          </div>

          <div class="filter-sheet-actions action-row" class:single={draftFilterCount === 0}>
            {#if draftFilterCount > 0}
              <button class="btn-secondary" onclick={resetFilters}>Reset</button>
            {/if}
            <button class="btn-primary btn-accent" onclick={applyFilterSheet}>Apply</button>
          </div>
          </div>
        {/if}
      {/snippet}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

{#if blockCandidate}
  <Modal
    title="Block this job?"
    subtitle={`This permanently hides ${blockCandidate.title} at ${blockCandidate.company_name} from everyone.`}
    busy={blockingJob}
    maxWidth={350}
    onclose={() => (blockCandidate = null)}
  >
    <div class="action-row">
      <button class="btn-secondary flex-fill" onclick={() => (blockCandidate = null)} disabled={blockingJob}>Cancel</button>
      <button class="btn-secondary btn-danger flex-fill" onclick={blockJobForEveryone} disabled={blockingJob}>
        {#if blockingJob}<Spinner />{/if}
        Block job
      </button>
    </div>
  </Modal>
{/if}
