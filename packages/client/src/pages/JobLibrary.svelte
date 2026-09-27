<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { currentRoute, navigate, navigateFromAnchor, routeHref, routeParam } from "../router";
  import { errorMessage, timeAgo } from "../lib/utils";
  import JobRow from "../components/JobRow.svelte";
  import Spinner from "../components/Spinner.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
  import { isIosApp } from "../lib/platform";
  import { ActivationEdge } from "../lib/activation";
  import {
    jobLibrary,
    replaceAppliedJobs,
    replaceSavedJobs,
  } from "../lib/job-library-store";

  let {
    routeOverride,
    active = true,
  }: {
    routeOverride?: string;
    active?: boolean;
  } = $props();

  let loading = $state(!$jobLibrary.savedHydrated || !$jobLibrary.appliedHydrated);
  let error: string | null = $state(null);
  let savedError: string | null = $state(null);
  let appliedError: string | null = $state(null);
  let route = $derived(routeOverride ?? $currentRoute);
  let selectedJobId = $derived(routeParam($currentRoute, "jobId"));
  let activeView: "saved" | "applied" = $derived(
    route.endsWith("/applied") ? "applied" : "saved"
  );
  let visibleJobs = $derived(activeView === "applied" ? $jobLibrary.appliedJobs : $jobLibrary.savedJobs);
  let activeHydrated = $derived(
    activeView === "applied" ? $jobLibrary.appliedHydrated : $jobLibrary.savedHydrated
  );
  const nativeIos = isIosApp();
  let activeError = $derived(nativeIos
    ? (activeView === "applied" ? appliedError : savedError)
    : error);
  const activation = new ActivationEdge();

  function selectView(view: "saved" | "applied", moveFocus = false, event?: MouseEvent) {
    const target = `/library/${view}`;
    if (event) navigateFromAnchor(event, target);
    else navigate(target);
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

  async function loadJobs(silent = false) {
    if (!silent) loading = true;
    error = null;
    savedError = null;
    appliedError = null;
    try {
      if (nativeIos) {
        const [saved, applied] = await Promise.allSettled([
          api.savedJobs.list(),
          api.appliedJobs.list(),
        ]);
        if (saved.status === "fulfilled") replaceSavedJobs(saved.value.jobs ?? []);
        else savedError = errorMessage(saved.reason);
        if (applied.status === "fulfilled") replaceAppliedJobs(applied.value.jobs ?? []);
        else appliedError = errorMessage(applied.reason);
        return;
      }
      const [saved, applied] = await Promise.all([
        api.savedJobs.list(),
        api.appliedJobs.list(),
      ]);
      replaceSavedJobs(saved.jobs ?? []);
      replaceAppliedJobs(applied.jobs ?? []);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadJobs($jobLibrary.savedHydrated && $jobLibrary.appliedHydrated);
  });

  $effect(() => {
    if (activation.becameActive(active)) void loadJobs(true);
  });
</script>

<div class="page root-screen library-page" class:native-layout={nativeIos}>
  <div class="page-frame my-jobs-page">
    <div class="my-jobs-tabs" class:applied-active={activeView === "applied"} role="tablist" aria-label="Your jobs">
      <a
        id="my-jobs-tab-saved"
        href={routeHref("/library/saved")}
        class:active={activeView === "saved"}
        role="tab"
        aria-selected={activeView === "saved"}
        aria-controls="my-jobs-panel"
        tabindex={activeView === "saved" ? 0 : -1}
        onclick={(event) => selectView("saved", false, event)}
        onkeydown={handleTabKeydown}
      >
        <span class="library-tab-icon saved" aria-hidden="true">
          <span class:visible={activeView !== "saved"}><BookmarkSimple size={17} weight="regular" /></span>
          <span class:visible={activeView === "saved"}><BookmarkSimple size={17} weight="fill" /></span>
        </span>
        <span>Saved</span>
        <small>{$jobLibrary.savedJobs.length}</small>
      </a>
      <a
        id="my-jobs-tab-applied"
        href={routeHref("/library/applied")}
        class:active={activeView === "applied"}
        role="tab"
        aria-selected={activeView === "applied"}
        aria-controls="my-jobs-panel"
        tabindex={activeView === "applied" ? 0 : -1}
        onclick={(event) => selectView("applied", false, event)}
        onkeydown={handleTabKeydown}
      >
        <span class="library-tab-icon applied" aria-hidden="true">
          <span class:visible={activeView !== "applied"}><CheckCircle size={17} weight="regular" /></span>
          <span class:visible={activeView === "applied"}><CheckCircle size={17} weight="fill" /></span>
        </span>
        <span>Applied</span>
        <small>{$jobLibrary.appliedJobs.length}</small>
      </a>
    </div>

    <div
      id="my-jobs-panel"
      role="tabpanel"
      aria-labelledby={`my-jobs-tab-${activeView}`}
    >
      {#if loading && !activeHydrated}
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
          {#if nativeIos}
            <EmptyState
              title={activeView === "saved" ? "No saved jobs" : "No applications yet"}
              message={activeView === "saved"
                ? "Save promising roles from their job page and they’ll stay here."
                : "Jobs you mark as applied will become your application history."}
            >
              {#snippet icon()}
                {#if activeView === "saved"}
                  <BookmarkSimple size={24} weight="fill" color="var(--color-accent)" />
                {:else}
                  <CheckCircle size={24} weight="fill" color="var(--color-good)" />
                {/if}
              {/snippet}
              {#snippet actions()}
                <button class="btn-primary btn-accent" onclick={() => navigate("/")}>Browse jobs</button>
              {/snippet}
            </EmptyState>
          {:else}
            <div class="my-jobs-empty">
              {#if activeView === "saved"}
                <BookmarkSimple size={28} weight="regular" />
                <h2>No saved jobs</h2>
                <p>Save promising roles from their job page and they’ll stay here.</p>
              {:else}
                <CheckCircle size={28} weight="regular" />
                <h2>No applications yet</h2>
                <p>Jobs you mark as applied will become your application history.</p>
              {/if}
            </div>
          {/if}
        {:else}
        <div class="my-jobs-list">
          {#each visibleJobs as job (job.id)}
            <JobRow
              {job}
              selected={selectedJobId === job.id}
              surface={nativeIos ? "feed" : "card"}
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
  .native-layout .library-tab-icon.saved {
    color: var(--color-accent);
  }

  .native-layout .library-tab-icon.applied {
    color: var(--color-good);
  }

  .native-layout .my-jobs-list {
    margin-inline: calc(var(--space-4) * -1);
    overflow: visible;
    border: 0;
    border-radius: 0;
  }

  :global(html.native-ios[data-mode="dark"]) .my-jobs-tabs {
    border: 1px solid var(--color-line);
    background: var(--color-control-active-bg);
  }

  :global(html.native-ios[data-mode="dark"]) .my-jobs-tabs::before {
    background: var(--color-control-bg);
  }

</style>
