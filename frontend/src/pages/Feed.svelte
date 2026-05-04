<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Job } from "../lib/api";
  import { timeAgo } from "../lib/utils";
  import JobCard from "../components/JobCard.svelte";
  import FilterChips from "../components/FilterChips.svelte";

  const LOCATIONS = ["All", "Remote", "NYC", "SF Bay Area", "Chicago", "Boston", "DC"];

  let jobs: Job[] = $state([]);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let selectedLocation: string = $state("All");
  let sortBy: "time" | "score" = $state("time");
  let lastPolled: string | null = $state(null);
  let refreshing: boolean = $state(false);
  let pullDistance: number = $state(0);
  let pullReady: boolean = $state(false);
  let touchStartY: number = $state(0);
  let draggingPull: boolean = $state(false);

  const locationAliases: Record<string, string[]> = {
    "NYC": ["new york", "nyc", "brooklyn"],
    "SF Bay Area": ["san francisco", "bay area", "sf", "palo alto", "mountain view", "sunnyvale", "san jose", "menlo park", "redwood city"],
    "Chicago": ["chicago"],
    "Boston": ["boston", "cambridge, ma"],
    "DC": ["washington", "d.c.", "dc", "arlington, va", "mclean, va"],
    "Remote": ["remote"],
  };

  let filteredJobs = $derived.by(() => {
    let result = selectedLocation === "All"
      ? [...jobs]
      : jobs.filter((j) => {
          const loc = (j.location ?? "").toLowerCase();
          const aliases = locationAliases[selectedLocation];
          if (aliases) return aliases.some((a) => loc.includes(a));
          return loc.includes(selectedLocation.toLowerCase());
        });
    if (sortBy === "score") {
      result.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else {
      result.sort((a, b) => {
        const aTime = Date.parse(a.posted_at ?? a.first_seen_at ?? "") || 0;
        const bTime = Date.parse(b.posted_at ?? b.first_seen_at ?? "") || 0;
        return bTime - aTime;
      });
    }
    return result;
  });

  let newToday = $derived.by(() => {
    const today = new Date().toISOString().slice(0, 10);
    return jobs.filter((j) => j.first_seen_at?.startsWith(today)).length;
  });

  async function loadFeed(silent = false) {
    if (!silent) loading = true;
    error = null;
    try {
      const [jobsRes, statsRes] = await Promise.all([
        api.jobs.list({ min_score: "40" }),
        api.stats.get(),
      ]);
      jobs = jobsRes.jobs ?? [];
      lastPolled = statsRes.lastPolled ?? null;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function triggerRefresh() {
    refreshing = true;
    pullDistance = 44;
    await loadFeed(true);
    refreshing = false;
    pullDistance = 0;
    pullReady = false;
  }

  function handleTouchStart(event: TouchEvent) {
    if (window.scrollY > 0 || refreshing) return;
    touchStartY = event.touches[0]?.clientY ?? 0;
    draggingPull = true;
  }

  function handleTouchMove(event: TouchEvent) {
    if (!draggingPull || refreshing) return;
    if (window.scrollY > 0) {
      draggingPull = false;
      return;
    }
    const delta = Math.max(0, (event.touches[0]?.clientY ?? 0) - touchStartY);
    pullDistance = Math.min(84, delta * 0.45);
    pullReady = pullDistance >= 42;
  }

  function handleTouchEnd() {
    if (!draggingPull) return;
    draggingPull = false;
    if (pullReady) {
      triggerRefresh();
    } else {
      pullDistance = 0;
      pullReady = false;
    }
  }

  onMount(() => {
    loadFeed();
  });

</script>

<div class="page" role="presentation" ontouchstart={handleTouchStart} ontouchmove={handleTouchMove} ontouchend={handleTouchEnd}>
  <div
    style="position: sticky; top: 62px; z-index: 20; display: flex; justify-content: center; pointer-events: none; height: 0;"
  >
    <div
      style="transform: translateY({pullDistance - 44}px); opacity: {Math.min(1, pullDistance / 44)}; transition: {draggingPull || refreshing ? 'none' : 'transform .2s, opacity .2s'}; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 999px; padding: 8px 14px; font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3);"
    >
      {refreshing ? "Refreshing…" : pullReady ? "Release to refresh" : "Pull for latest"}
    </div>
  </div>
  <div style="padding: 0 22px 10px;">
    <h1 class="h-display" style="font-size: 30px; margin-bottom: 14px;">
      New roles
    </h1>
    <div class="stat-row">
      <span><strong style="color: var(--color-ink);">{newToday}</strong> new today</span>
      <span><strong style="color: var(--color-ink);">{filteredJobs.length}</strong> showing</span>
      {#if lastPolled}
        <span>polled {timeAgo(lastPolled)}</span>
      {/if}
      {#if refreshing}
        <span>refreshing now</span>
      {/if}
    </div>
  </div>

  <!-- Filter chips + sort -->
  <div style="padding: 0 22px 10px; display: flex; align-items: center; gap: 10px;">
    <div style="flex: 1;">
      <FilterChips
        filters={LOCATIONS}
        selected={selectedLocation}
        onSelect={(f) => (selectedLocation = f)}
      />
    </div>
    <div style="display: flex; flex-shrink: 0; border-radius: 8px; overflow: hidden; border: 1px solid var(--color-line);">
      <button
        style="padding: 6px 14px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; background: {sortBy === 'time' ? 'var(--color-accent)' : 'var(--color-bg-elev)'}; color: {sortBy === 'time' ? 'var(--color-accent-ink)' : 'var(--color-ink-3)'};"
        onclick={() => sortBy = "time"}
      >
        New
      </button>
      <button
        style="padding: 6px 14px; font-size: 12px; font-weight: 600; border: none; border-left: 1px solid var(--color-line); cursor: pointer; background: {sortBy === 'score' ? 'var(--color-accent)' : 'var(--color-bg-elev)'}; color: {sortBy === 'score' ? 'var(--color-accent-ink)' : 'var(--color-ink-3)'};"
        onclick={() => sortBy = "score"}
      >
        Match
      </button>
    </div>
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
    {:else if filteredJobs.length === 0}
      <div style="text-align: center; padding: 48px 24px; color: var(--color-ink-3);">
        <div class="h-display" style="font-size: 24px; color: var(--color-ink-2); margin-bottom: 8px;">
          Nothing here
        </div>
        <div style="font-size: 13.5px;">Adjust your filters or check back later.</div>
      </div>
    {:else}
      {#each filteredJobs as job (job.id)}
        <JobCard {job} onDismiss={(id) => { jobs = jobs.filter(j => j.id !== id); }} />
      {/each}
      <div style="text-align: center; padding: 16px 0 4px; font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4);">
        — go touch grass —
      </div>
    {/if}
  </div>
</div>
