<script lang="ts">
  import { onMount } from "svelte";
  import {
    api,
    type ClassificationCall,
    type ClassificationDisagreement,
    type ClassificationDisagreements,
    type ClassificationVerdict,
  } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import { openInAppBrowser } from "../../lib/application-browser";
  import Spinner from "../../components/Spinner.svelte";
  import EmptyState from "../../components/EmptyState.svelte";
  import InlineFailure from "../../components/InlineFailure.svelte";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";

  let {
    onError,
    nativeIos = false,
  }: {
    onError: (message: string) => void;
    nativeIos?: boolean;
  } = $props();

  const VERDICTS: Array<{ id: ClassificationVerdict; label: string }> = [
    { id: "rules", label: "Rules right" },
    { id: "jev", label: "Jev right" },
    { id: "neither", label: "Both wrong" },
    { id: "unclear", label: "Not sure" },
  ];

  const REASONS: Record<string, string> = {
    location: "outside the US",
    management: "management role",
    no_technical_signal: "not a technical role",
    non_technical_function: "not a technical role",
    other_engineering_discipline: "non-software engineering",
    seniority: "too senior",
    clearance: "needs a clearance",
  };

  let loading = $state(true);
  let loadError: string | null = $state(null);
  let report = $state<ClassificationDisagreements | null>(null);
  let view: "open" | "reviewed" = $state("open");
  let saving: string | null = $state(null);

  let rows = $derived(report?.disagreements ?? []);
  let open = $derived(rows.filter((row) => !row.review));
  let reviewed = $derived(rows.filter((row) => row.review));
  let visible = $derived(view === "open" ? open : reviewed);
  let counts = $derived(report?.counts);
  let compared = $derived(counts ? counts.agree + counts.rules_only + counts.jev_only : 0);
  let tally = $derived((verdict: ClassificationVerdict) =>
    reviewed.filter((row) => row.review?.verdict === verdict).length);

  function describeCall(call: ClassificationCall) {
    if (call.decision === "include") return "Include";
    if (call.decision === "unsure") return "Unsure";
    return call.reason ? `Exclude · ${REASONS[call.reason] ?? call.reason.replaceAll("_", " ")}` : "Exclude";
  }

  function readable(value: string) {
    return value.replaceAll("_", " ");
  }

  function percent(value: number | null) {
    return value === null ? "" : ` · ${Math.round(value * 100)}%`;
  }

  function verdictLabel(verdict: ClassificationVerdict) {
    return VERDICTS.find((option) => option.id === verdict)?.label ?? verdict;
  }

  async function load() {
    loading = true;
    loadError = null;
    try {
      report = await api.classification.disagreements();
    } catch (caught) {
      loadError = errorMessage(caught);
      if (!nativeIos) onError(loadError);
    } finally {
      loading = false;
    }
  }

  function replaceReview(cacheKey: string, review: ClassificationDisagreement["review"]) {
    if (!report?.disagreements) return;
    report = {
      ...report,
      disagreements: report.disagreements.map((row) => row.cache_key === cacheKey ? { ...row, review } : row),
    };
  }

  async function record(row: ClassificationDisagreement, verdict: ClassificationVerdict) {
    saving = row.cache_key;
    try {
      replaceReview(row.cache_key, await api.classification.review(row.cache_key, verdict));
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      saving = null;
    }
  }

  async function reopen(row: ClassificationDisagreement) {
    saving = row.cache_key;
    try {
      await api.classification.clearReview(row.cache_key);
      replaceReview(row.cache_key, null);
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      saving = null;
    }
  }

  onMount(() => {
    void load();
  });
</script>

{#if loading}
  <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading Jev comparisons" /></div>
{:else if loadError || !report}
  {#if nativeIos}
    <InlineFailure title="Comparisons didn’t load" onRetry={() => void load()} />
  {:else}
    <div class="surface-empty">Comparisons didn’t load.</div>
  {/if}
{:else if !report.available}
  <div class="surface-empty">Run the latest database migration to review Jev comparisons.</div>
{:else}
  <section class="admin-section">
    <div class="admin-section-heading">
      <h2>Rules vs Jev</h2>
      <span>${(report.month_spent_usd ?? 0).toFixed(2)} of ${(report.monthly_budget_usd ?? 0).toFixed(2)} this month</span>
    </div>
    <div class="surface-list">
      <div class="jev-summary">
        {#if compared === 0}
          <p>No jobs compared yet. Jev checks a sample of new listings four times an hour.</p>
        {:else}
          <p>
            <strong>{counts?.agree ?? 0} of {compared}</strong> compared jobs got the same call.
            The rules took {counts?.rules_only ?? 0} that Jev would skip, and Jev took {counts?.jev_only ?? 0} that the rules skipped.
          </p>
          <p class="jev-summary-detail">
            {#if reviewed.length > 0}
              You’ve reviewed {reviewed.length}: rules right {tally("rules")},
              Jev right {tally("jev")}, both wrong {tally("neither")}.
            {:else}
              Review the disagreements below to measure who’s more often right.
            {/if}
            {#if counts && counts.jev_unsure > 0}Jev was unsure on {counts.jev_unsure}.{/if}
          </p>
        {/if}
      </div>
    </div>
  </section>

  <section class="admin-section">
    <div class="admin-section-heading">
      <h2>Disagreements</h2>
      <div class="segmented-control" role="group" aria-label="Disagreement filter">
        <button type="button" class:active={view === "open"} aria-pressed={view === "open"} onclick={() => (view = "open")}>
          To review {open.length}
        </button>
        <button type="button" class:active={view === "reviewed"} aria-pressed={view === "reviewed"} onclick={() => (view = "reviewed")}>
          Reviewed {reviewed.length}
        </button>
      </div>
    </div>
    <div class="surface-list">
      {#if visible.length === 0}
        {#if nativeIos}
          <EmptyState
            compact
            title={view === "open" ? "Nothing to review" : "No reviews yet"}
            message={view === "open" ? "New disagreements will appear here." : "Jobs you review will appear here."}
          />
        {:else}
          <div class="surface-empty">{view === "open" ? "Nothing to review." : "No reviews yet."}</div>
        {/if}
      {:else}
        {#each visible as row (row.cache_key)}
          <article class="list-entry jev-entry" aria-busy={saving === row.cache_key ? "true" : undefined}>
            <div class="list-entry-title">{row.title ?? "Untitled listing"}</div>
            <div class="list-entry-meta">{row.location ? `${row.company} · ${row.location}` : row.company}</div>

            <dl class="jev-calls">
              <div class:jev-include={row.rules.decision === "include"}>
                <dt>Rules</dt>
                <dd>{describeCall(row.rules)}</dd>
              </div>
              <div class:jev-include={row.jev.decision === "include"}>
                <dt>Jev</dt>
                <dd>{describeCall(row.jev)}</dd>
              </div>
            </dl>

            {#if row.truncated}
              <p class="jev-note">Jev only saw the first 12,000 characters of this posting.</p>
            {/if}

            <details class="jev-fields">
              <summary>Compare answers</summary>
              <table>
                <thead>
                  <tr><th scope="col"></th><th scope="col">Rules</th><th scope="col">Jev</th></tr>
                </thead>
                <tbody>
                  {#each row.fields as field (field.field)}
                    <tr class:jev-mismatch={field.mismatch}>
                      <th scope="row">{field.label}</th>
                      <td>{readable(field.rules)}</td>
                      <td>{readable(field.jev)}{percent(field.confidence)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </details>

            <div class="jev-links">
              {#if row.job_url}
                {#if nativeIos}
                  <button type="button" class="text-button jev-source" onclick={() => void openInAppBrowser(row.job_url!)}>
                    <ArrowSquareOut size={15} aria-hidden="true" />
                    Posting
                  </button>
                {:else}
                  <a class="text-button jev-source" href={row.job_url} target="_blank" rel="noopener noreferrer">
                    <ArrowSquareOut size={15} aria-hidden="true" />
                    Posting<span class="sr-only"> (opens in a new tab)</span>
                  </a>
                {/if}
              {/if}
            </div>

            {#if row.review}
              <div class="action-row compact list-entry-actions jev-reviewed">
                <span>{verdictLabel(row.review.verdict)}</span>
                <button class="btn-secondary btn-mini" disabled={saving !== null} onclick={() => void reopen(row)}>
                  {#if saving === row.cache_key}<Spinner />{/if}
                  Change
                </button>
              </div>
            {:else}
              <div class="action-row compact list-entry-actions jev-verdicts" role="group" aria-label="Who got it right?">
                {#each VERDICTS as option (option.id)}
                  <button class="btn-secondary btn-mini" disabled={saving !== null} onclick={() => void record(row, option.id)}>
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      {/if}
    </div>
  </section>
{/if}

<style>
  .jev-summary {
    padding: var(--space-4);
    display: grid;
    gap: var(--space-1);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }

  .jev-summary p { margin: 0; color: var(--color-ink-2); }
  .jev-summary strong { color: var(--color-ink); font-weight: 600; }
  .jev-summary-detail { color: var(--color-ink-3); }

  .jev-calls {
    margin: var(--space-3) 0 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .jev-calls div {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-sunken);
  }

  .jev-calls .jev-include { background: var(--color-good-soft); }
  .jev-calls dt { color: var(--color-ink-3); font-size: var(--fs-2xs); font-weight: 600; }
  .jev-calls dd { margin: 0; color: var(--color-ink); font-size: var(--fs-sm); }

  .jev-note {
    margin: var(--space-2) 0 0;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .jev-fields { margin-top: var(--space-2); font-size: var(--fs-xs); }

  .jev-fields summary {
    min-height: var(--tap-min);
    display: inline-flex;
    align-items: center;
    color: var(--color-ink-2);
    font-weight: 500;
    cursor: pointer;
  }

  .jev-fields table { width: 100%; border-collapse: collapse; }

  .jev-fields th,
  .jev-fields td {
    padding: var(--space-1) var(--space-2);
    color: var(--color-ink-2);
    font-weight: 400;
    text-align: left;
  }

  .jev-fields thead th { color: var(--color-ink-4); font-weight: 500; }
  .jev-fields tbody th { color: var(--color-ink-3); }
  .jev-fields .jev-mismatch td { color: var(--color-bad); font-weight: 500; }

  .jev-links {
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    font-size: var(--fs-xs);
  }

  .jev-source {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-accent);
    font-size: var(--fs-xs);
  }

  .jev-verdicts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 720px) {
    .jev-verdicts { display: flex; }
  }

  .jev-reviewed {
    align-items: center;
    justify-content: space-between;
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    font-weight: 500;
  }
</style>
