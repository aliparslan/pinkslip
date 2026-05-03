<script lang="ts">
  import { navigate } from "../router";
  import { api } from "../lib/api";
  import ScoreBadge from "../components/ScoreBadge.svelte";

  let { jobId }: { jobId: string | null } = $props();

  let job: any = $state(null);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let dismissing: boolean = $state(false);

  $effect(() => {
    if (!jobId) return;
    loading = true;
    error = null;
    api.jobs
      .get(jobId)
      .then((j) => {
        job = j;
      })
      .catch((e) => {
        error = e.message;
      })
      .finally(() => {
        loading = false;
      });
  });

  async function handleDismiss() {
    if (!jobId) return;
    dismissing = true;
    try {
      await api.jobs.dismiss(jobId);
      navigate("/");
    } catch (e: any) {
      error = e.message;
      dismissing = false;
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const scoreBreakdownKeys: { label: string; key: string; max: number }[] = [
    { label: "Title", key: "title_score", max: 35 },
    { label: "YOE", key: "yoe_score", max: 25 },
    { label: "Location", key: "location_score", max: 20 },
    { label: "Department", key: "department_score", max: 10 },
    { label: "Recency", key: "recency_score", max: 10 },
  ];
</script>

<div class="flex flex-col min-h-screen">
  <!-- Header -->
  <header class="sticky top-0 z-10 bg-base-100 border-b border-base-300 px-4 py-3 flex items-center gap-3">
    <button class="btn btn-ghost btn-sm btn-circle" aria-label="Back" onclick={() => navigate("/")}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <h1 class="text-lg font-bold">Job Detail</h1>
  </header>

  <main class="flex-1 px-4 py-4">
    {#if loading}
      <div class="flex justify-center items-center py-20">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {:else if error}
      <div class="alert alert-error">
        <span>{error}</span>
      </div>
    {:else if job}
      <div class="flex flex-col gap-4">
        <!-- Title & Meta -->
        <div class="card bg-base-200">
          <div class="card-body gap-2">
            <div class="flex items-start justify-between gap-2">
              <h2 class="text-xl font-bold leading-snug">{job.title}</h2>
              <ScoreBadge score={job.score ?? 0} />
            </div>
            <p class="text-base-content/70 font-medium">{job.company_name}</p>
            {#if job.location}
              <p class="text-sm text-base-content/50">{job.location}</p>
            {/if}
            {#if job.posted_at ?? job.created_at}
              <p class="text-xs text-base-content/40">
                Posted {formatDate(job.posted_at ?? job.created_at)}
              </p>
            {/if}
          </div>
        </div>

        <!-- Score Breakdown -->
        <div class="card bg-base-200">
          <div class="card-body">
            <h3 class="card-title text-base">Score Breakdown</h3>
            <div class="flex flex-col gap-2 mt-1">
              {#each scoreBreakdownKeys as { label, key, max }}
                <div class="flex items-center justify-between text-sm">
                  <span class="text-base-content/70">{label}</span>
                  <div class="flex items-center gap-2">
                    <progress
                      class="progress progress-primary w-24"
                      value={job[key] ?? 0}
                      max={max}
                    ></progress>
                    <span class="font-mono text-xs w-12 text-right">
                      {job[key] ?? 0}/{max}
                    </span>
                  </div>
                </div>
              {/each}
              <div class="divider my-1"></div>
              <div class="flex items-center justify-between text-sm font-semibold">
                <span>Total</span>
                <span class="font-mono">{job.score ?? 0}/100</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          {#if job.url}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-primary flex-1"
            >
              Apply on {job.company_name}
            </a>
          {/if}
          <button
            class="btn btn-error btn-outline"
            onclick={handleDismiss}
            disabled={dismissing}
          >
            {#if dismissing}
              <span class="loading loading-spinner loading-xs"></span>
            {/if}
            Dismiss
          </button>
        </div>
      </div>
    {/if}
  </main>
</div>
