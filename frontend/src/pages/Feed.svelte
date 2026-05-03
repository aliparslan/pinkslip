<script lang="ts">
  import { api } from "../lib/api";
  import JobCard from "../components/JobCard.svelte";
  import FilterChips from "../components/FilterChips.svelte";

  const LOCATIONS = ["All", "Remote", "NYC", "SF", "Dallas"];

  let jobs: any[] = $state([]);
  let newToday: number = $state(0);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let selectedLocation: string = $state("All");

  let filteredJobs = $derived(
    selectedLocation === "All"
      ? jobs
      : jobs.filter((j) =>
          (j.location ?? "").toLowerCase().includes(selectedLocation.toLowerCase())
        )
  );

  $effect(() => {
    loading = true;
    error = null;
    Promise.all([api.jobs.list(), api.stats.get()])
      .then(([jobsRes, statsRes]) => {
        jobs = jobsRes.jobs ?? [];
        newToday = statsRes.newToday ?? 0;
      })
      .catch((e) => {
        error = e.message;
      })
      .finally(() => {
        loading = false;
      });
  });
</script>

<div class="flex flex-col min-h-screen">
  <!-- Header -->
  <header class="sticky top-0 z-10 bg-base-100 border-b border-base-300 px-4 py-3">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">JobRadar</h1>
      {#if newToday > 0}
        <span class="badge badge-primary">{newToday} new today</span>
      {/if}
    </div>
    <div class="mt-2">
      <FilterChips
        filters={LOCATIONS}
        selected={selectedLocation}
        onSelect={(f) => (selectedLocation = f)}
      />
    </div>
  </header>

  <!-- Body -->
  <main class="flex-1 px-4 py-4">
    {#if loading}
      <div class="flex justify-center items-center py-20">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {:else if error}
      <div class="alert alert-error">
        <span>{error}</span>
      </div>
    {:else if filteredJobs.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-base-content/50">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-sm">No jobs found</p>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each filteredJobs as job (job.id)}
          <JobCard {job} />
        {/each}
      </div>
    {/if}
  </main>
</div>
