<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Job } from "../lib/api";
  import { currentRoute, navigate } from "../router";
  import { errorMessage, timeAgo } from "../lib/utils";
  import JobRow from "../components/JobRow.svelte";
  import Spinner from "../components/Spinner.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
  import { isIosApp } from "../lib/platform";

  let { routeOverride }: { routeOverride?: string } = $props();

  let savedJobs: Job[] = $state([]);
  let appliedJobs: Job[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);
  let savedError: string | null = $state(null);
  let appliedError: string | null = $state(null);
  let route = $derived(routeOverride ?? $currentRoute);
  let activeView: "saved" | "applied" = $derived(
    route.endsWith("/applied") ? "applied" : "saved"
  );
  let visibleJobs = $derived(activeView === "applied" ? appliedJobs : savedJobs);
  const nativeIos = isIosApp();
  let activeError = $derived(nativeIos
    ? (activeView === "applied" ? appliedError : savedError)
    : error);

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
    savedError = null;
    appliedError = null;
    try {
      if (nativeIos) {
        const [saved, applied] = await Promise.allSettled([
          api.savedJobs.list(),
          api.appliedJobs.list(),
        ]);
        if (saved.status === "fulfilled") savedJobs = saved.value.jobs ?? [];
        else savedError = errorMessage(saved.reason);
        if (applied.status === "fulfilled") appliedJobs = applied.value.jobs ?? [];
        else appliedError = errorMessage(applied.reason);
        return;
      }
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

<div class="page root-screen library-page" class:native-layout={nativeIos}>
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
        <span class="library-tab-icon" class:active={activeView === "saved"} aria-hidden="true">
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
        <span class="library-tab-icon" class:active={activeView === "applied"} aria-hidden="true">
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
      {:else if activeError && visibleJobs.length === 0}
        {#if nativeIos}
          <PageFailure
            title="Your library didn’t load"
            message="Check your connection and try again."
            onRetry={() => void loadJobs()}
          />
        {:else}
          <div class="alert alert-error" role="alert">{activeError}</div>
        {/if}
      {:else}
        {#if activeError}
          <div class="alert alert-error alert-spaced" role="alert">{activeError}</div>
        {/if}
        {#if visibleJobs.length === 0}
        <div class="my-jobs-empty">
          {#if activeView === "saved"}
            <BookmarkSimple size={28} weight={nativeIos ? "fill" : "regular"} color={nativeIos ? "var(--color-accent)" : undefined} />
            <h2>No saved jobs</h2>
            <p>Save promising roles from their job page and they’ll stay here.</p>
          {:else}
            <CheckCircle size={28} weight={nativeIos ? "fill" : "regular"} color={nativeIos ? "var(--color-accent)" : undefined} />
            <h2>No applications yet</h2>
            <p>Jobs you mark as applied will become your application history.</p>
          {/if}
          {#if nativeIos}<button class="btn-primary btn-accent library-browse-action" onclick={() => navigate("/")}>Browse jobs</button>{/if}
        </div>
        {:else}
        <div class="my-jobs-list">
          {#each visibleJobs as job (job.id)}
            <JobRow
              {job}
              surface={nativeIos ? "feed" : "card"}
              swipeActions={false}
              returnTo={`/library/${activeView}`}
              contextLabel={activeView === "applied" && job.applied_at
                ? `Applied ${timeAgo(job.applied_at)}`
                : undefined}
            />
          {/each}
        </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .native-layout .my-jobs-tabs {
    background: color-mix(in oklch, var(--color-accent) 8%, var(--color-bg));
  }

  .native-layout .my-jobs-tabs::before {
    background: var(--color-accent-soft);
    box-shadow: none;
  }

  .native-layout .my-jobs-tabs button.active {
    color: var(--color-accent-soft-ink);
  }

  .native-layout .library-tab-icon.active {
    color: var(--color-accent);
  }

  .native-layout .my-jobs-tabs button.active small {
    background: color-mix(in oklch, var(--color-accent) 16%, transparent);
    color: var(--color-accent-soft-ink);
  }

  .native-layout .my-jobs-list {
    overflow: visible;
    border: 0;
    border-radius: 0;
  }

  .native-layout .library-browse-action {
    margin-top: var(--space-6);
  }
</style>
