<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Job } from "../lib/api";
  import { currentRoute, navigate } from "../router";
  import { errorMessage, timeAgo } from "../lib/utils";
  import { setFeedNavigationJobs } from "../lib/feed-navigation";
  import JobRow from "../components/JobRow.svelte";
  import Spinner from "../components/Spinner.svelte";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";

  let savedJobs: Job[] = $state([]);
  let appliedJobs: Job[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);
  let route = $derived($currentRoute);
  let activeView: "saved" | "applied" = $derived(
    route.endsWith("/applied") ? "applied" : "saved"
  );
  let visibleJobs = $derived(activeView === "applied" ? appliedJobs : savedJobs);

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

  $effect(() => {
    setFeedNavigationJobs(visibleJobs);
  });

  onMount(() => {
    void loadJobs();
  });
</script>

<div class="page" style="padding-top: 0;">
  <div class="page-frame my-jobs-page">
    <div class="my-jobs-heading">
      <h1 class="h-display h-display-lg">My jobs</h1>
      <p>Your shortlist and application history.</p>
    </div>

    <div class="my-jobs-tabs" role="tablist" aria-label="My jobs">
      <button
        class:active={activeView === "saved"}
        role="tab"
        aria-selected={activeView === "saved"}
        onclick={() => navigate("/my-jobs/saved")}
      >
        <BookmarkSimple size={17} weight={activeView === "saved" ? "fill" : "regular"} />
        <span>Saved</span>
        <small>{savedJobs.length}</small>
      </button>
      <button
        class:active={activeView === "applied"}
        role="tab"
        aria-selected={activeView === "applied"}
        onclick={() => navigate("/my-jobs/applied")}
      >
        <CheckCircle size={17} weight={activeView === "applied" ? "fill" : "regular"} />
        <span>Applied</span>
        <small>{appliedJobs.length}</small>
      </button>
    </div>

    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading jobs" /></div>
    {:else if error}
      <div class="alert alert-error">{error}</div>
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
            swipeActions={false}
            returnTo={`/my-jobs/${activeView}`}
            contextLabel={activeView === "applied" && job.applied_at
              ? `Applied ${timeAgo(job.applied_at)}`
              : undefined}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>
