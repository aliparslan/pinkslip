<script lang="ts">
  import { onMount } from "svelte";
  import { api, type FetchRun } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import Spinner from "../../components/Spinner.svelte";
  import EmptyState from "../../components/EmptyState.svelte";
  import InlineFailure from "../../components/InlineFailure.svelte";
  import CaretDown from "phosphor-svelte/lib/CaretDown";

  let {
    onError,
    onSuccess,
    nativeIos = false,
  }: {
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    nativeIos?: boolean;
  } = $props();

  type RunIssue = {
    companyName?: string;
    error?: string;
  };

  const MANUAL_SWEEP_BATCHES = 5;

  let loading = $state(true);
  let loadError: string | null = $state(null);
  let runs: FetchRun[] = $state([]);
  let refreshingAll = $state(false);
  let refreshLog: string[] = $state([]);
  let refreshProgress = $state("");

  function formatDuration(milliseconds: number | null) {
    const value = milliseconds ?? 0;
    if (value < 1000) return `${value} ms`;
    if (value < 60_000) return `${Math.round(value / 100) / 10} sec`;
    return `${Math.floor(value / 60_000)} min ${Math.round((value % 60_000) / 1000)} sec`;
  }

  function formatRunDate(value: string) {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function friendlyRunError(value: string) {
    return value
      .replace(/Request timed out after (\d+)ms/gi, (_match, milliseconds: string) =>
        `Timed out after ${Math.round(Number(milliseconds) / 1000)} sec`)
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseRunIssues(value: string | null): RunIssue[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [{ error: friendlyRunError(value) }];
      return parsed
        .filter((issue): issue is RunIssue => Boolean(issue && typeof issue === "object"))
        .map((issue) => ({
          companyName: typeof issue.companyName === "string" ? issue.companyName : undefined,
          error: typeof issue.error === "string" ? friendlyRunError(issue.error) : "Unknown source error",
        }));
    } catch {
      return [{ error: friendlyRunError(value) }];
    }
  }

  async function loadRuns() {
    loading = true;
    loadError = null;
    try {
      const result = await api.runs.list(50);
      runs = result.runs ?? [];
    } catch (caught) {
      loadError = errorMessage(caught);
      if (!nativeIos) onError(loadError);
    } finally {
      loading = false;
    }
  }

  async function refreshAllCompanies() {
    refreshingAll = true;
    let totalPolled = 0;
    let totalNewJobs = 0;
    try {
      for (let batch = 1; batch <= MANUAL_SWEEP_BATCHES; batch += 1) {
        refreshProgress = `Polling — batch ${batch} of ${MANUAL_SWEEP_BATCHES}…`;
        const result = await api.ops.refreshAll();
        refreshLog = result.log ?? [];
        totalPolled += result.companiesPolled;
        totalNewJobs += result.newJobsFound;
      }
      onSuccess(`Polled ${totalPolled} companies · ${totalNewJobs} new jobs`);
      await loadRuns();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      refreshingAll = false;
      refreshProgress = "";
    }
  }

  onMount(() => {
    void loadRuns();
  });
</script>

{#if loading}
  <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading runs" /></div>
{:else if nativeIos && loadError}
  <InlineFailure title="Runs didn’t load" onRetry={() => void loadRuns()} />
{:else}
  <section class="admin-section">
    <div class="admin-section-heading"><h2>Operations</h2></div>
    <div class="surface-list">
      <div class="grouped-row run-operation">
        <div class="grouped-row-copy">
          <div class="row-title">Refresh every source</div>
          <div class="helper-text" aria-live="polite">{refreshProgress || "Run the full company poll now."}</div>
        </div>
        <button class="btn-secondary" disabled={refreshingAll} onclick={refreshAllCompanies}>
          {#if refreshingAll}<Spinner />{/if}
          Run now
        </button>
      </div>
    </div>
    {#if refreshLog.length > 0}
      <details class="run-log">
        <summary>View latest poll log</summary>
        <div>
          {#each refreshLog.slice(0, 8) as line}<span>{line}</span>{/each}
        </div>
      </details>
    {/if}
  </section>

  <section class="admin-section">
    <div class="admin-section-heading"><h2>Recent runs</h2><span>{runs.length} loaded</span></div>
    <div class="surface-list">
      {#if runs.length === 0}
        {#if nativeIos}
          <EmptyState compact title="No fetch runs yet" message="New fetch runs will appear here." />
        {:else}
          <div class="surface-empty">No fetch runs yet.</div>
        {/if}
      {:else}
        {#each runs.slice(0, 12) as run}
          {@const issues = parseRunIssues(run.errors_json)}
          <article class="run-row">
            <div class="run-row-header">
              <div class="run-result">
                <span class="run-status" class:bad={run.status === "error"}></span>
                <strong>{run.status === "error" ? "Completed with errors" : run.status === "running" ? "Running" : "Completed"}</strong>
              </div>
              <span class="tag">{run.notifications_sent} {run.notifications_sent === 1 ? "push" : "pushes"}</span>
            </div>
            <div class="run-summary">
              {run.new_jobs_found} new · {run.companies_succeeded}/{run.companies_attempted} sources · {formatDuration(run.duration_ms)}
            </div>
            <div class="run-date">{formatRunDate(run.started_at)}</div>
            {#if issues.length > 0}
              <div class="run-issues">
                {#each issues.slice(0, 2) as issue}
                  <div class="run-issue-item">
                    {#if issue.companyName}<strong>{issue.companyName}</strong>{/if}
                    <span>{issue.error}</span>
                  </div>
                {/each}
                {#if issues.length > 2}
                  <details class="run-issue-more">
                    <summary>
                      <span>Show {issues.length - 2} more failing {issues.length - 2 === 1 ? "source" : "sources"}</span>
                      <CaretDown size={13} weight="bold" aria-hidden="true" />
                    </summary>
                    <div class="run-issue-more-list">
                      {#each issues.slice(2) as issue}
                        <div class="run-issue-item">
                          {#if issue.companyName}<strong>{issue.companyName}</strong>{/if}
                          <span>{issue.error}</span>
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}
              </div>
            {/if}
          </article>
        {/each}
      {/if}
    </div>
  </section>
{/if}

<style>
  .run-operation { min-height: 70px; }
  .run-operation .btn-secondary { flex-shrink: 0; }

  .run-log {
    margin-top: 10px;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .run-log summary { cursor: pointer; font-weight: 600; }
  .run-log > div {
    margin-top: 8px;
    padding: 10px 12px;
    display: grid;
    gap: 4px;
    overflow-wrap: anywhere;
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
  }

  .run-row { padding: 14px 16px; }
  .run-row + .run-row { border-top: 0.5px solid var(--color-line); }

  .run-row-header,
  .run-result {
    display: flex;
    align-items: center;
  }

  .run-row-header { justify-content: space-between; gap: 12px; }
  .run-result { min-width: 0; gap: 8px; }
  .run-result strong { font-size: var(--fs-sm); font-weight: 600; }

  .run-status {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: var(--radius-full);
    background: var(--color-good);
  }

  .run-status.bad { background: var(--color-bad); }

  .run-summary {
    margin-top: 6px;
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    line-height: 1.4;
  }

  .run-date {
    margin-top: 2px;
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
  }

  .run-issues {
    margin-top: 10px;
    padding: 9px 11px;
    display: grid;
    gap: 7px;
    border-radius: var(--radius-sm);
    background: var(--color-bad-soft);
    color: var(--color-bad);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .run-issue-item { display: flex; flex-wrap: wrap; gap: 4px; }
  .run-issues strong::after { content: " ·"; }

  .run-issue-more { border-top: 1px solid color-mix(in oklch, currentColor 18%, transparent); }
  .run-issue-more summary {
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: currentColor;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }
  .run-issue-more summary::-webkit-details-marker { display: none; }
  .run-issue-more summary :global(svg) { flex: none; transition: transform var(--duration-fast) var(--ease-standard); }
  .run-issue-more[open] summary :global(svg) { transform: rotate(180deg); }
  .run-issue-more-list { padding: 2px 0 3px; display: grid; gap: 8px; }
</style>
