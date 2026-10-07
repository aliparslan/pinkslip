<script lang="ts">
  import { onMount } from "svelte";
  import { currentRoute, routeParam, scrollContainer } from "../router";
  import { api, type Job, type JobsListParams } from "@pinkslip/core/api";
  import { jobReadPresentation, readJobsList } from "../lib/job-read-cache";
  import { timeAgo, errorMessage } from "@pinkslip/core/utils";
  import {
    ALL_CAREER_STAGES,
    ALL_FEED_ROLE_IDS,
    feed,
    markLocationsManuallySet,
    PAGE_SIZE,
    type PostedFilter,
  } from "../lib/feed-store.svelte";
  import { syncViewedJobs, viewedJobs } from "../lib/viewed";
  import JobRow from "../components/JobRow.svelte";
  import VirtualJobList from "../components/VirtualJobList.svelte";
  import Spinner from "../components/Spinner.svelte";
  import Switch from "../components/Switch.svelte";
  import Modal from "../components/Modal.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import { Dialog } from "bits-ui";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Check from "phosphor-svelte/lib/Check";
  import ArrowClockwise from "phosphor-svelte/lib/ArrowClockwise";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import SlidersHorizontal from "phosphor-svelte/lib/SlidersHorizontal";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import X from "phosphor-svelte/lib/X";
  import { dragDismiss } from "../lib/drag-dismiss";
  import {
    createFrameBatch,
    delay,
    motionDistance,
    motionDuration,
  } from "../lib/motion";
  import { hapticLight } from "../lib/haptics";
  import {
    CAREER_STAGE_OPTIONS,
    LOCATION_OPTIONS,
    ROLE_OPTIONS,
    type CareerStage,
    type LocationId,
    type RoleId,
  } from "../../../../shared/search-profile";
  import { MAX_POSTED_AGE_DAYS } from "../../../../shared/job-policy";
  import { isIosApp } from "../lib/platform";
  import { sessionAccess } from "../lib/session-access";
  import { headerChrome } from "../lib/header-chrome.svelte";
  import { ActivationEdge } from "../lib/activation";
  import { careerStageQuery, sameCareerStages } from "@pinkslip/core/career-stage-filter";

  let { active = true }: { active?: boolean } = $props();
  let selectedJobId = $derived(routeParam($currentRoute, "jobId"));

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
  let filterTrigger: HTMLButtonElement | undefined = $state();
  let filterAnchorEnd = $state(0);
  let filterAnchorTop = $state(0);
  let refreshing: boolean = $state(false);
  let loadingMore: boolean = $state(false);
  let criteriaLoads = $state(0);
  let feedResultTotal = $state(feed.hasMore ? -1 : feed.jobs.length);
  let resultAnnouncement = $state("");
  let searchTimer: number | null = null;
  let loadMoreSentinel: HTMLDivElement | undefined = $state(undefined);
  let feedPage: HTMLDivElement | undefined = $state(undefined);
  let pullOffset = $state(0);
  let pullArmed = $state(false);
  let pullSettling = $state(false);
  let pullTimer: number | null = null;
  let pullCandidate = false;
  let pullHapticFired = false;
  let pullStartX = 0;
  let pullStartY = 0;
  let requestVersion = 0;
  let handledPreferenceRevision = feed.preferenceRevision;
  let handledNotificationRevision = feed.notificationRevision;
  let draftSelectedLocations: string[] = $state(["All"]);
  let draftSelectedRoles: RoleId[] = $state([...ALL_FEED_ROLE_IDS]);
  let draftMinSalaryK = $state("");
  let draftMaxSalaryK = $state("");
  let draftSelectedCareerStages: CareerStage[] = $state([...ALL_CAREER_STAGES]);
  let draftSavedOnly = $state(false);
  let draftPostedFilter: PostedFilter = $state("any");
  let blockCandidate: Job | null = $state(null);
  let blockingJob = $state(false);
  const activation = new ActivationEdge();
  const hiddenJobPositions = new Map<string, number>();
  const nativeIos = isIosApp();
  type FeedCriteria = Pick<typeof feed,
    | "selectedLocations"
    | "selectedRoles"
    | "searchQuery"
    | "savedOnly"
    | "minSalaryK"
    | "maxSalaryK"
    | "availableCareerStages"
    | "selectedCareerStages"
    | "postedFilter"
  >;
  type FeedLoadOutcome = "success" | "failure" | "stale";

  function captureFeedCriteria(): FeedCriteria {
    return {
      selectedLocations: [...feed.selectedLocations],
      selectedRoles: [...feed.selectedRoles],
      searchQuery: feed.searchQuery,
      savedOnly: feed.savedOnly,
      minSalaryK: feed.minSalaryK,
      maxSalaryK: feed.maxSalaryK,
      availableCareerStages: [...feed.availableCareerStages],
      selectedCareerStages: [...feed.selectedCareerStages],
      postedFilter: feed.postedFilter,
    };
  }

  function restoreFeedCriteria(criteria: FeedCriteria) {
    feed.selectedLocations = [...criteria.selectedLocations];
    feed.selectedRoles = [...criteria.selectedRoles];
    feed.searchQuery = criteria.searchQuery;
    feed.savedOnly = criteria.savedOnly;
    feed.minSalaryK = criteria.minSalaryK;
    feed.maxSalaryK = criteria.maxSalaryK;
    feed.availableCareerStages = [...criteria.availableCareerStages];
    feed.selectedCareerStages = [...criteria.selectedCareerStages];
    feed.postedFilter = criteria.postedFilter;
  }

  let appliedCriteria: FeedCriteria = captureFeedCriteria();
  let showOlderJobsFilter = $derived(!nativeIos || $sessionAccess.isAdmin);
  let effectiveSavedOnly = $derived(!nativeIos && feed.savedOnly);
  const pullBatch = createFrameBatch<number>((value) => {
    const nextArmed = value >= 44;
    if (!pullHapticFired && nextArmed) {
      pullHapticFired = true;
      hapticLight();
    }
    pullOffset = value;
    pullArmed = nextArmed;
  }, nativeIos);

  function announceResults(message: string) {
    resultAnnouncement = "";
    window.requestAnimationFrame(() => {
      resultAnnouncement = message;
    });
  }

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

  function markJobSaved(id: string, saved = true) {
    feed.jobs = feed.jobs.map((job) =>
      job.id === id ? { ...job, saved: saved ? 1 : 0 } : job
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
      if (!nativeIos) feedback.success("Job blocked for everyone");
    } catch (e) {
      feedback.error(errorMessage(e, nativeIos ? "Could not remove that job." : "Could not block that job."));
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
  let hasRoleFilter = $derived(
    nativeIos && !(
      feed.selectedRoles.length === ALL_FEED_ROLE_IDS.length
      && ALL_FEED_ROLE_IDS.every((role) => feed.selectedRoles.includes(role))
    )
  );
  let hasCareerStageFilter = $derived(
    !sameCareerStages(feed.selectedCareerStages, feed.availableCareerStages)
  );
  let activeFilterCount = $derived.by(() => {
    let count = 0;
    if (hasRoleFilter) count += 1;
    if (hasLocationFilter) count += 1;
    if (feed.minSalaryK.trim() || feed.maxSalaryK.trim()) count += 1;
    if (hasCareerStageFilter) count += 1;
    if (effectiveSavedOnly) count += 1;
    if (showOlderJobsFilter && feed.postedFilter !== "any") count += 1;
    return count;
  });
  // Filters the empty state can actually offer to clear. `savedOnly` is excluded:
  // it selects a view rather than narrowing one, so clearing it would bounce the
  // user out of the saved list they deliberately opened.
  let refinableFilterCount = $derived(activeFilterCount - (effectiveSavedOnly ? 1 : 0));
  let feedEmptyTitle = $derived(
    refinableFilterCount > 0
      ? effectiveSavedOnly ? "No saved jobs match your filters" : "No jobs match your filters"
      : effectiveSavedOnly ? "No saved jobs yet" : "No jobs right now"
  );
  let feedEmptyMessage = $derived(
    feed.postedFilter === "evergreen"
      ? nativeIos
        ? "No older jobs match your other filters."
        : "No standing or aged-but-open roles match your other filters."
      : refinableFilterCount > 0
        ? "Try widening or clearing your filters."
        : effectiveSavedOnly
          ? "Save roles from the detail view to keep them handy."
          : "New roles show up here as they’re posted."
  );
  let draftHasLocationFilter = $derived(
    !(draftSelectedLocations.length === 1 && draftSelectedLocations[0] === "All")
  );
  let draftHasRoleFilter = $derived(
    nativeIos && !(
      draftSelectedRoles.length === ALL_FEED_ROLE_IDS.length
      && ALL_FEED_ROLE_IDS.every((role) => draftSelectedRoles.includes(role))
    )
  );
  let draftHasCareerStageFilter = $derived(
    !sameCareerStages(draftSelectedCareerStages, feed.availableCareerStages)
  );
  let draftFilterCount = $derived.by(() => {
    let count = 0;
    if (draftHasRoleFilter) count += 1;
    if (draftHasLocationFilter) count += 1;
    if (draftMinSalaryK.trim() || draftMaxSalaryK.trim()) count += 1;
    if (draftHasCareerStageFilter) count += 1;
    if (!nativeIos && draftSavedOnly) count += 1;
    if (showOlderJobsFilter && draftPostedFilter !== "any") count += 1;
    return count;
  });
  let draftLocationSummary = $derived.by(() => {
    if (!draftHasLocationFilter) return "Anywhere";
    const labels = draftSelectedLocations.map(locationLabel);
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  });
  function buildFeedParams(
    limit = PAGE_SIZE,
    offset = 0,
    criteria = captureFeedCriteria(),
  ) {
    const params: JobsListParams = {
      limit: String(limit),
      offset: String(offset),
    };

    if (criteria.searchQuery.trim()) {
      params.q = criteria.searchQuery.trim();
    }
    const criteriaHasLocationFilter = !(
      criteria.selectedLocations.length === 1
      && criteria.selectedLocations[0] === "All"
    );
    if (criteriaHasLocationFilter) {
      params.locations = criteria.selectedLocations.join(",");
    }
    const criteriaHasRoleFilter = nativeIos && !(
      criteria.selectedRoles.length === ALL_FEED_ROLE_IDS.length
      && ALL_FEED_ROLE_IDS.every((role) => criteria.selectedRoles.includes(role))
    );
    if (criteriaHasRoleFilter) params.roles = criteria.selectedRoles.join(",");
    if (!nativeIos && criteria.savedOnly) {
      params.saved = "true";
    }
    const minSalary = parseInt(criteria.minSalaryK, 10);
    const maxSalary = parseInt(criteria.maxSalaryK, 10);
    if (Number.isFinite(minSalary)) params.min_salary = String(minSalary * 1000);
    if (Number.isFinite(maxSalary)) params.max_salary = String(maxSalary * 1000);
    const stages = careerStageQuery(
      criteria.selectedCareerStages,
      criteria.availableCareerStages,
    );
    if (stages) params.stages = stages as JobsListParams["stages"];
    if (showOlderJobsFilter && criteria.postedFilter !== "any") params.posted = criteria.postedFilter;

    return params;
  }

  async function loadFeedPage(options?: {
    silent?: boolean;
    append?: boolean;
    mergeFresh?: boolean;
    minimumBusyMs?: number;
    limit?: number;
    offset?: number;
    criteriaChange?: boolean;
  }): Promise<FeedLoadOutcome> {
    const silent = options?.silent ?? false;
    const append = options?.append ?? false;
    const mergeFresh = options?.mergeFresh ?? false;
    const minimumBusyMs = options?.minimumBusyMs ?? 0;
    const limit = options?.limit ?? PAGE_SIZE;
    const offset = options?.offset ?? 0;
    const hadJobs = feed.jobs.length > 0;
    const previousJobs = feed.jobs;
    const requestedCriteria = captureFeedCriteria();
    const requestParams = buildFeedParams(limit, offset, requestedCriteria);
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
      let jobsRes: Awaited<ReturnType<typeof readJobsList>>;
      if (!append && nativeIos) {
        const [statsRes, nextJobs] = await Promise.all([
          // Polling health is useful context, but it must never turn a healthy
          // jobs response into a full-feed failure.
          api.stats.get().catch(() => null),
          readJobsList(requestParams),
        ]);
        if (version !== requestVersion) return "stale";
        if (statsRes) feed.lastPolled = statsRes.lastPolled ?? null;
        jobsRes = nextJobs;
      } else {
        if (!append) {
          const statsRes = await api.stats.get().catch(() => null);
          if (version !== requestVersion) return "stale";
          if (statsRes) feed.lastPolled = statsRes.lastPolled ?? null;
        }
        jobsRes = await readJobsList(requestParams);
      }
      if (version !== requestVersion) return "stale";

      // A first-page cache fallback keeps the current rows useful, but it does
      // not confirm that newly requested filter criteria reached the server.
      // Treat it as a failed Apply so every client restores the last applied
      // criteria and pagination while the saved-copy presentation stays visible.
      if (options?.criteriaChange && jobsRes.source === "cache") {
        return "failure";
      }

      const incoming = jobsRes.jobs ?? [];
      if (!append && jobsRes.source === "network" && incoming.length > 0) {
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

      feed.hasMore = jobsRes.source === "network" && Boolean(jobsRes.meta?.has_more);
      feedResultTotal = Math.max(jobsRes.meta.total ?? feed.jobs.length, feed.jobs.length);
      const serverOffset = jobsRes.meta?.next_offset ?? (offset + incoming.length);
      feed.nextOffset = mergeFresh ? Math.max(previousJobs.length, serverOffset) : serverOffset;
      feed.hydrated = true;
      feed.lastLoadedAt = Date.now();
      if (!append) appliedCriteria = requestedCriteria;
      announceResults(
        append
          ? `${feed.jobs.length} of ${feedResultTotal} jobs loaded.`
          : `${feedResultTotal} ${feedResultTotal === 1 ? "job" : "jobs"} found.`
      );
      return "success";
    } catch (e) {
      if (version !== requestVersion) return "stale";
      if (!hadJobs) {
        error = errorMessage(e);
      } else if (append) {
        feedback.error(errorMessage(e, "Couldn’t load more jobs."), {
          dedupeKey: "feed-load-more",
          action: { label: "Retry", run: loadMore },
        });
      } else {
        // A background refresh or filter retry should never replace a usable
        // feed with a full-page failure state. Keep the rendered rows stable
        // and surface the recoverable network problem as transient feedback.
        feedback.error(errorMessage(
          e,
          options?.criteriaChange
            ? "Couldn’t update jobs. Your previous results are still here."
            : "Couldn’t refresh jobs.",
        ));
      }
      return "failure";
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
    if (
      $jobReadPresentation.readOnly
      || loading
      || loadingMore
      || refreshing
      || criteriaLoads > 0
      || !feed.hasMore
    ) return;
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
    selectedRoles?: RoleId[];
    searchQuery?: string;
    savedOnly?: boolean;
    minSalaryK?: string;
    maxSalaryK?: string;
    selectedCareerStages?: CareerStage[];
    postedFilter?: PostedFilter;
  }) {
    const hadExistingJobs = feed.jobs.length > 0;
    const previousCriteria = captureFeedCriteria();
    const previousPagination = { hasMore: feed.hasMore, nextOffset: feed.nextOffset };
    criteriaLoads += 1;
    if (updates?.selectedLocations !== undefined) {
      feed.selectedLocations = updates.selectedLocations;
      markLocationsManuallySet();
    }
    if (updates?.selectedRoles !== undefined) {
      feed.selectedRoles = updates.selectedRoles;
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
    if (updates?.selectedCareerStages !== undefined) {
      const constrained = feed.availableCareerStages.filter((stage) => (
        updates.selectedCareerStages?.includes(stage)
      ));
      feed.selectedCareerStages = constrained.length > 0
        ? constrained
        : [...feed.availableCareerStages];
    }
    if (updates?.postedFilter !== undefined) {
      feed.postedFilter = updates.postedFilter;
    }
    error = null;
    feed.hasMore = true;
    feed.nextOffset = 0;
    try {
      const outcome = await loadFeedPage({
        silent: true,
        append: false,
        limit: PAGE_SIZE,
        offset: 0,
        criteriaChange: true,
      });
      if (outcome === "failure" && hadExistingJobs) {
        // Restore the state that existed immediately before this Apply. A
        // long-lived applied snapshot can be overtaken by an ambient refresh,
        // while this per-operation snapshot cannot drift during the request.
        restoreFeedCriteria(previousCriteria);
        appliedCriteria = previousCriteria;
        feed.hasMore = previousPagination.hasMore;
        feed.nextOffset = previousPagination.nextOffset;
      }
    } finally {
      criteriaLoads = Math.max(0, criteriaLoads - 1);
    }
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

  function chooseNoRolePreference() {
    draftSelectedRoles = [...ALL_FEED_ROLE_IDS];
  }

  function toggleRoleFilter(role: RoleId) {
    if (!draftHasRoleFilter) {
      draftSelectedRoles = [role];
      return;
    }
    const next = draftSelectedRoles.includes(role)
      ? draftSelectedRoles.filter((item) => item !== role)
      : [...draftSelectedRoles, role];
    draftSelectedRoles = next.length === 0 || next.length === ALL_FEED_ROLE_IDS.length
      ? [...ALL_FEED_ROLE_IDS]
      : next;
  }

  function toggleCareerStageFilter(stage: CareerStage) {
    const next = draftSelectedCareerStages.includes(stage)
      ? draftSelectedCareerStages.filter((item) => item !== stage)
      : feed.availableCareerStages.filter((item) => (
          item === stage || draftSelectedCareerStages.includes(item)
        ));
    if (next.length > 0) draftSelectedCareerStages = next;
  }

  function openFilterSheet() {
    const triggerRect = filterTrigger?.getBoundingClientRect();
    if (triggerRect) {
      filterAnchorEnd = Math.max(0, window.innerWidth - triggerRect.right);
      filterAnchorTop = triggerRect.bottom;
    }
    draftSelectedLocations = [...feed.selectedLocations];
    draftSelectedRoles = [...feed.selectedRoles];
    draftMinSalaryK = feed.minSalaryK;
    draftMaxSalaryK = feed.maxSalaryK;
    draftSelectedCareerStages = [...feed.selectedCareerStages];
    draftSavedOnly = effectiveSavedOnly;
    draftPostedFilter = showOlderJobsFilter ? feed.postedFilter : "any";
    filtersOpen = true;
  }

  // Clears the narrowing filters from the empty state. Omitting `savedOnly` leaves
  // the current view intact; `openFilterSheet` re-syncs the drafts from feed state,
  // so the sheet reflects this the next time it opens.
  async function clearRefinableFilters() {
    await applyFeedFilters({
      selectedLocations: ["All"],
      selectedRoles: [...ALL_FEED_ROLE_IDS],
      minSalaryK: "",
      maxSalaryK: "",
      selectedCareerStages: [...feed.availableCareerStages],
      postedFilter: "any",
    });
  }

  function resetFilters() {
    draftSelectedLocations = ["All"];
    draftSelectedRoles = [...ALL_FEED_ROLE_IDS];
    draftMinSalaryK = "";
    draftMaxSalaryK = "";
    draftSelectedCareerStages = [...feed.availableCareerStages];
    draftSavedOnly = false;
    draftPostedFilter = "any";
  }

  async function applyFilterSheet() {
    filtersOpen = false;
    await applyFeedFilters({
      selectedLocations: [...draftSelectedLocations],
      selectedRoles: [...draftSelectedRoles],
      minSalaryK: draftMinSalaryK,
      maxSalaryK: draftMaxSalaryK,
      selectedCareerStages: [...draftSelectedCareerStages],
      savedOnly: nativeIos ? false : draftSavedOnly,
      postedFilter: showOlderJobsFilter ? draftPostedFilter : "any",
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
    submitSearch((event.currentTarget as HTMLInputElement).value);
    (event.currentTarget as HTMLInputElement).blur();
  }

  function submitSearch(value: string) {
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer);
      searchTimer = null;
    }
    void applyFeedFilters({ searchQuery: value });
  }

  function clearSearch() {
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer);
      searchTimer = null;
    }
    feed.searchQuery = "";
    void applyFeedFilters({ searchQuery: "" });
  }

  async function triggerRefresh() {
    if (refreshing || criteriaLoads > 0) return;
    refreshing = true;
    error = null;
    await loadFeed(true);
    refreshing = false;
  }

  async function refreshIfStale(force = false) {
    // The notification effect owns this refresh, including when returning
    // from its detail route or waiting for another request to finish.
    if (feed.notificationRevision !== handledNotificationRevision) return;
    const now = Date.now();
    if (refreshing || loading) return;
    if (!force && feed.hydrated && now - feed.lastLoadedAt < FEED_REFRESH_AFTER_MS) return;
    await loadFeed(true);
  }

  $effect(() => {
    if (activation.becameActive(active)) void refreshIfStale();
  });

  $effect(() => {
    const revision = feed.notificationRevision;
    if (!active || loading || refreshing || criteriaLoads > 0) return;
    if (revision === handledNotificationRevision) return;
    handledNotificationRevision = revision;
    void triggerRefresh();
  });

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
        window.setTimeout(() => { pullSettling = false; }, motionDuration(240));
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
    }, motionDuration(240));
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
      pullHapticFired = false;
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
    const unregisterHeaderSearch = nativeIos
      ? headerChrome.registerSearch({
          id: "feed",
          placeholder: "Search jobs or companies",
          value: () => feed.searchQuery,
          onInput: scheduleSearch,
          onSubmit: submitSearch,
        })
      : () => undefined;
    void syncViewedJobs().catch(() => undefined);
    if (feed.hydrated && feed.jobs.length > 0) {
      loading = false;
    } else {
      loadFeed();
    }
    const handleVisibility = () => {
      if (active && document.visibilityState === "visible") {
        refreshIfStale();
      }
    };
    const handleFocus = () => {
      if (active) refreshIfStale();
    };
    const handlePageShow = () => {
      if (active) refreshIfStale();
    };
    const handleForegroundPush = () => {
      if (!nativeIos) refreshIfStale(true);
    };
    const handleReconnect = () => {
      if (!nativeIos) refreshIfStale(true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pinkslip:push", handleForegroundPush);
    window.addEventListener("online", handleReconnect);

    return () => {
      unregisterHeaderSearch();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pinkslip:push", handleForegroundPush);
      window.removeEventListener("online", handleReconnect);
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

{#snippet listingTypeFilter()}
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
          {nativeIos && option.value === "evergreen" ? "Older jobs" : option.label}
        </button>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet savedJobsFilter()}
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
{/snippet}

<div bind:this={feedPage} class="page root-screen feed-page" class:pull-settling={pullSettling}>
  <div class="feed-result-status" role="status" aria-live="polite" aria-atomic="true">
    {resultAnnouncement}
  </div>
  <!-- Search and filtering share one compact control surface. -->
  <div class="feed-controls">
    <div class="feed-toolbar">
      <div class="feed-search" role="search">
        <MagnifyingGlass size={17} weight="bold" aria-hidden="true" />
        <input
          type="search"
          enterkeyhint="search"
          placeholder="Search"
          aria-label="Search jobs or companies"
          disabled={$jobReadPresentation.readOnly}
          value={feed.searchQuery}
          oninput={(event) => scheduleSearch(event.currentTarget.value)}
          onkeydown={commitSearch}
        />
        {#if nativeIos && feed.searchQuery}
          <button type="button" class="feed-search__clear" aria-label="Clear search" onclick={clearSearch}>
            <X size={18} weight="bold" aria-hidden="true" />
          </button>
        {/if}
      </div>
      <button
        bind:this={filterTrigger}
        class="filter-button"
        class:active={activeFilterCount > 0}
        disabled={$jobReadPresentation.readOnly}
        onclick={openFilterSheet}
        aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters"}
        aria-haspopup="dialog"
        aria-controls={filtersOpen ? "feed-filter-sheet" : undefined}
        aria-expanded={filtersOpen}
      >
        <SlidersHorizontal size={15} weight="bold" aria-hidden="true" />
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
      class:refreshing={refreshing}
      style:height={`${pullOffset}px`}
      style:opacity={Math.min(1, pullOffset / 34)}
      role="status"
      aria-hidden={!pullArmed && !refreshing}
    >
      <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
      <span>{nativeIos
        ? refreshing
          ? "Refreshing jobs…"
          : pullArmed
            ? "Release to refresh"
            : "Pull to refresh"
        : "Updates every 15 minutes. You’re caught up."}</span>
    </div>
  </div>

  {#if $jobReadPresentation.readOnly}
    <div class="feed-stale-notice web-offline-copy" role="status">
      <WarningCircle size={15} weight="bold" aria-hidden="true" />
      <span>
        Saved copy{#if $jobReadPresentation.savedAt} · from {timeAgo(new Date($jobReadPresentation.savedAt).toISOString())}{/if}.
        Actions and filters return when you’re online.
      </span>
      <button onclick={triggerRefresh} disabled={refreshing || criteriaLoads > 0}>
        {refreshing || criteriaLoads > 0 ? "Checking…" : "Try again"}
      </button>
    </div>
  {/if}

  {#if pollStale && feed.lastPolled}
    <div class="feed-stale-notice">
      <WarningCircle size={15} weight="bold" aria-hidden="true" />
      <span>Results may be stale · updated {timeAgo(feed.lastPolled)}</span>
      <button onclick={triggerRefresh} disabled={refreshing}>
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  {/if}

  <div aria-busy={loading || refreshing || loadingMore || criteriaLoads > 0}>
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
      <PageFailure
        title="Jobs didn’t load"
        message="Check your connection and try again."
        onRetry={() => void loadFeed()}
      />
    {:else if feed.jobs.length === 0}
      <EmptyState title={feedEmptyTitle} message={feedEmptyMessage}>
        {#snippet actions()}
          {#if refinableFilterCount > 0 && !$jobReadPresentation.readOnly}
            <button class="btn-secondary" onclick={clearRefinableFilters}>
              Clear filters
            </button>
          {/if}
          <button class="btn-secondary" onclick={triggerRefresh} disabled={refreshing}>
            {#if refreshing}<Spinner />{/if}
            Refresh now
          </button>
        {/snippet}
      </EmptyState>
    {:else}
      {#if nativeIos}
        <VirtualJobList
          jobs={feed.jobs}
          total={feedResultTotal}
          {viewed}
          onDismiss={removeJob}
          onRestore={restoreJob}
          onSaved={markJobSaved}
          onBlockRequest={(candidate) => (blockCandidate = candidate)}
        />
      {:else}
        {#each feed.jobs as job (job.id)}
          <div animate:flip={{ duration: motionDuration(240), easing: cubicOut }}>
            <JobRow
              {job}
              selected={selectedJobId === job.id}
              viewed={viewed.has(job.id)}
              swipeActions={false}
              onDismiss={$jobReadPresentation.readOnly ? undefined : removeJob}
              onRestore={$jobReadPresentation.readOnly ? undefined : restoreJob}
              onSaved={$jobReadPresentation.readOnly ? undefined : markJobSaved}
              onBlockRequest={$jobReadPresentation.readOnly ? undefined : (candidate) => (blockCandidate = candidate)}
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
            in:fade={{ duration: motionDuration(160) }}
            out:fade={{ duration: motionDuration(120) }}
          ></div>
        {/if}
      {/snippet}
    </Dialog.Overlay>
    <Dialog.Content forceMount restoreScrollDelay={motionDuration(260)}>
      {#snippet child({ props, open })}
        {#if open}
          <div
            {...props}
            id="feed-filter-sheet"
            class="sheet filter-sheet"
            style:--filter-anchor-end={`${filterAnchorEnd}px`}
            style:--filter-anchor-top={`${filterAnchorTop}px`}
            use:dragDismiss={{ onDismiss: () => (filtersOpen = false), base: "translateX(-50%)" }}
            in:fly={{ y: motionDistance(20), duration: motionDuration(220), easing: cubicOut }}
            out:fly={{ y: motionDistance(14), duration: motionDuration(140), easing: cubicOut }}
          >
          <div class="sheet-handle"></div>
          <div class="filter-sheet-header">
            <Dialog.Title class="h-display h-display-md">Filters</Dialog.Title>
            <button class="icon-btn" aria-label="Close filters" onclick={() => (filtersOpen = false)}>
              <X size={nativeIos ? 20 : 18} weight={nativeIos ? "bold" : "regular"} aria-hidden="true" />
            </button>
          </div>

          <div class="filter-sheet-body">
            {#if nativeIos}
              <section class="filter-group">
                <div class="filter-group-title">Role</div>
                <div class="filter-option-grid role-filter-grid" role="group" aria-label="Role">
                  <button
                    type="button"
                    class="filter-choice"
                    class:active={!draftHasRoleFilter}
                    aria-pressed={!draftHasRoleFilter}
                    onclick={chooseNoRolePreference}
                  >
                    No preference
                  </button>
                  {#each ROLE_OPTIONS as role}
                    <button
                      type="button"
                      class="filter-choice"
                      class:active={draftHasRoleFilter && draftSelectedRoles.includes(role.id)}
                      aria-pressed={draftHasRoleFilter && draftSelectedRoles.includes(role.id)}
                      onclick={() => toggleRoleFilter(role.id)}
                    >
                      {role.shortLabel}
                    </button>
                  {/each}
                </div>
              </section>
            {/if}

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
              <div id="career-stage-filter-label" class="filter-group-title">Career stage</div>
              <div
                class="filter-option-grid career-stage-filter-grid"
                role="group"
                aria-labelledby="career-stage-filter-label"
              >
                {#each CAREER_STAGE_OPTIONS.filter((option) => feed.availableCareerStages.includes(option.id)) as option}
                  <button
                    type="button"
                    class="filter-choice"
                    class:active={draftSelectedCareerStages.includes(option.id)}
                    aria-pressed={draftSelectedCareerStages.includes(option.id)}
                    aria-disabled={draftSelectedCareerStages.includes(option.id) && draftSelectedCareerStages.length === 1}
                    onclick={() => toggleCareerStageFilter(option.id)}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
              <p class="filter-group-help">Choose at least one of your saved career stages.</p>
            </section>

            {#if nativeIos}
              {#if showOlderJobsFilter}{@render listingTypeFilter()}{/if}
            {:else}
              <details class="advanced-fields filter-advanced" open>
                {@render listingTypeFilter()}
                {@render savedJobsFilter()}
              </details>
            {/if}
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
    title={nativeIos ? "Remove this job?" : "Block this job?"}
    subtitle={`This permanently removes ${blockCandidate.title} at ${blockCandidate.company_name} for everyone.`}
    busy={blockingJob}
    maxWidth={350}
    onclose={() => (blockCandidate = null)}
  >
    <div class="action-row">
      <button class="btn-secondary flex-fill" onclick={() => (blockCandidate = null)} disabled={blockingJob}>Cancel</button>
      <button class="btn-secondary btn-danger flex-fill" onclick={blockJobForEveryone} disabled={blockingJob}>
        {#if blockingJob}<Spinner />{/if}
        {nativeIos ? "Remove job" : "Block job"}
      </button>
    </div>
  </Modal>
{/if}

<style>
  .feed-result-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .career-stage-filter-grid {
    grid-template-columns: 1fr;
  }

  .career-stage-filter-grid .filter-choice {
    height: auto;
    min-height: var(--tap-min);
    white-space: normal;
  }

  .filter-group-help {
    margin: 0;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: var(--leading-body);
  }
</style>
