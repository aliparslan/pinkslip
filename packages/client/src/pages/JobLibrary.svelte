<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Job } from "../lib/api";
  import { currentRoute, navigate } from "../router";
  import { errorMessage, timeAgo } from "../lib/utils";
  import JobRow from "../components/JobRow.svelte";
  import Spinner from "../components/Spinner.svelte";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";

  let { routeOverride }: { routeOverride?: string } = $props();

  let savedJobs: Job[] = $state([]);
  let appliedJobs: Job[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);
  let route = $derived(routeOverride ?? $currentRoute);
  let activeView: "saved" | "applied" = $derived(
    route.endsWith("/applied") ? "applied" : "saved"
  );
  let visibleJobs = $derived(activeView === "applied" ? appliedJobs : savedJobs);

  function selectView(view: "saved" | "applied", moveFocus = false) {
    navigate(`/library/${view}`);
    if (moveFocus) {
      window.requestAnimationFrame(() => {
        document.getElementById(`my-jobs-tab-${view}`)?.focus();
      });
    }
  }

  function handleTabKeydown(event: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "ArrowLeft" || event.key === "Home" ? "saved" : "applied";
    selectView(next, true);
  }

  async function loadJobs() {
    loading = true;
    error = null;
    try {
      const [saved, applied] = await Promise.all([
        api.savedJobs.list(),
        api.appliedJobs.list(),
      ]);
      savedJobs = saved.jobs ?? [];
      appliedJobs = applied.jobs ?? [];
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadJobs();
  });
</script>

<div class="page root-screen library-page">
  <div class="page-frame my-jobs-page">
    <div class="my-jobs-tabs" class:applied-active={activeView === "applied"} role="tablist" aria-label="Your jobs">
      <button
        id="my-jobs-tab-saved"
        type="button"
        class:active={activeView === "saved"}
        role="tab"
        aria-selected={activeView === "saved"}
        aria-controls="my-jobs-panel"
        tabindex={activeView === "saved" ? 0 : -1}
        onclick={() => selectView("saved")}
        onkeydown={handleTabKeydown}
      >
        <span class="library-tab-icon" aria-hidden="true">
          <span class:visible={activeView !== "saved"}><BookmarkSimple size={17} weight="regular" /></span>
          <span class:visible={activeView === "saved"}><BookmarkSimple size={17} weight="fill" /></span>
        </span>
        <span>Saved</span>
        <small>{savedJobs.length}</small>
      </button>
      <button
        id="my-jobs-tab-applied"
        type="button"
        class:active={activeView === "applied"}
        role="tab"
        aria-selected={activeView === "applied"}
        aria-controls="my-jobs-panel"
        tabindex={activeView === "applied" ? 0 : -1}
        onclick={() => selectView("applied")}
        onkeydown={handleTabKeydown}
      >
        <span class="library-tab-icon" aria-hidden="true">
          <span class:visible={activeView !== "applied"}><CheckCircle size={17} weight="regular" /></span>
          <span class:visible={activeView === "applied"}><CheckCircle size={17} weight="fill" /></span>
        </span>
        <span>Applied</span>
        <small>{appliedJobs.length}</small>
      </button>
    </div>

    <div
      id="my-jobs-panel"
      role="tabpanel"
      aria-labelledby={`my-jobs-tab-${activeView}`}
    >
      {#if loading}
        <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading jobs" /></div>
      {:else if error}
        <div class="alert alert-error" role="alert">{error}</div>
      {:else if visibleJobs.length === 0}
        <div class="my-jobs-empty">
          {#if activeView === "saved"}
            <BookmarkSimple size={28} />
            <h2>No saved jobs</h2>
            <p>Save promising roles from their job page and they’ll stay here.</p>
          {:else}
            <CheckCircle size={28} />
            <h2>No applications yet</h2>
            <p>Jobs you mark as applied will become your application history.</p>
          {/if}
        </div>
      {:else}
        <div class="my-jobs-list">
          {#each visibleJobs as job (job.id)}
            <JobRow
              {job}
              surface="card"
              swipeActions={false}
              returnTo={`/library/${activeView}`}
              contextLabel={activeView === "applied" && job.applied_at
                ? `Applied ${timeAgo(job.applied_at)}`
                : undefined}
            />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
