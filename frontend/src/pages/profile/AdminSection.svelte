<script lang="ts">
  import { onMount } from "svelte";
  import {
    api,
    type ContentReport,
    type FeedbackSubmission,
    type FetchRun,
    type ProductMetrics,
  } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import Spinner from "../../components/Spinner.svelte";
  import CaretDown from "phosphor-svelte/lib/CaretDown";

  let {
    view = "overview",
    onError,
    onSuccess,
  }: {
    view?: "overview" | "inbox" | "runs";
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
  } = $props();

  type RunIssue = {
    companyName?: string;
    error?: string;
  };

  let loading = $state(true);
  let runs: FetchRun[] = $state([]);
  let productMetrics: ProductMetrics | null = $state(null);
  let reports: ContentReport[] = $state([]);
  let feedbackInbox: FeedbackSubmission[] = $state([]);
  let refreshingAll = $state(false);
  let refreshLog: string[] = $state([]);
  let refreshProgress = $state("");

  function formatLatency(seconds: number) {
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${Math.round((seconds / 3600) * 10) / 10} hr`;
  }

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

  async function loadAdminData() {
    loading = true;
    try {
      [runs, productMetrics, reports, feedbackInbox] = await Promise.all([
        api.runs.list(50).then((result) => result.runs ?? []).catch(() => []),
        api.metrics.get().catch(() => null),
        api.interactions.reports("open").then((result) => result.reports).catch(() => []),
        api.interactions.feedback("active").then((result) => result.feedback).catch(() => []),
      ]);
    } finally {
      loading = false;
    }
  }

  async function moderateReport(id: string, status: "resolved" | "dismissed") {
    try {
      await api.interactions.updateReport(id, { status });
      reports = reports.filter((report) => report.id !== id);
      if (productMetrics) {
        productMetrics = {
          ...productMetrics,
          open_reports: Math.max(0, productMetrics.open_reports - 1),
        };
      }
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  async function moderateFeedback(id: string, status: "planned" | "resolved" | "declined") {
    try {
      await api.interactions.updateFeedback(id, { status });
      if (status === "planned") {
        feedbackInbox = feedbackInbox.map((item) =>
          item.id === id ? { ...item, status: "planned", updated_at: new Date().toISOString() } : item
        );
      } else {
        feedbackInbox = feedbackInbox.filter((item) => item.id !== id);
        if (productMetrics) {
          productMetrics = {
            ...productMetrics,
            open_feedback: Math.max(0, productMetrics.open_feedback - 1),
          };
        }
      }
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  const MANUAL_SWEEP_BATCHES = 5;

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
      await loadAdminData();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      refreshingAll = false;
      refreshProgress = "";
    }
  }

  onMount(() => {
    void loadAdminData();
  });
</script>

{#if loading}
  <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading operations" /></div>
{:else}
  {#if view === "overview" && productMetrics}
    <section class="admin-section">
      <div class="admin-section-heading">
        <h2>Product health</h2>
        <span>Last {productMetrics.period_days} days</span>
      </div>

      <div class="metric-summary">
        <section class="metric-group">
          <h3>Alerts</h3>
          <dl>
            <div><dt>Job to alert</dt><dd>{formatLatency(productMetrics.notification_latency_seconds)}</dd></div>
            <div><dt>Alert open rate</dt><dd>{productMetrics.notification_open_rate}%</dd></div>
            <div><dt>Alerts sent</dt><dd>{productMetrics.notifications_sent}</dd></div>
            <div><dt>Devices registered</dt><dd>{productMetrics.push_registrations}</dd></div>
          </dl>
        </section>

        <section class="metric-group">
          <h3>Search quality</h3>
          <dl>
            <div><dt>Viable profiles</dt><dd>{productMetrics.users_with_enough_matches}/{productMetrics.total_profiles}</dd></div>
            <div><dt>Onboarding completion</dt><dd>{productMetrics.onboarding_completion_rate}%</dd></div>
            <div><dt>High-match dismissals</dt><dd>{productMetrics.high_score_dismissal_rate}%</dd></div>
            <div><dt>Profile changes</dt><dd>{productMetrics.profile_adjustments}</dd></div>
          </dl>
        </section>

        <section class="metric-group">
          <h3>Conversion</h3>
          <dl>
            <div><dt>Quick apply clicks</dt><dd>{productMetrics.apply_clicks_within_one_hour}</dd></div>
            <div><dt>Tailor to apply</dt><dd>{productMetrics.tailoring_to_application_rate}%</dd></div>
            <div><dt>New accounts</dt><dd>{productMetrics.accounts_created}</dd></div>
          </dl>
        </section>

        <section class="metric-group">
          <h3>Inbox</h3>
          <dl>
            <div><dt>Active feedback</dt><dd>{productMetrics.open_feedback}</dd></div>
            <div><dt>Open reports</dt><dd>{productMetrics.open_reports}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  {/if}

  {#if view === "inbox"}
    <section class="admin-section">
      <div class="admin-section-heading"><h2>Feedback</h2><span>{feedbackInbox.length} active</span></div>
      <div class="surface-list">
        {#if feedbackInbox.length === 0}
          <div class="surface-empty">No active suggestions.</div>
        {:else}
          {#each feedbackInbox as item}
            <div class="list-entry">
              <div class="list-entry-header">
                <div class="list-entry-copy">
                  <div class="list-entry-title">{item.title}</div>
                  <div class="list-entry-meta">
                    {item.user_name || "User"} · {new Date(item.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div class="tag-cluster">
                  <span class="tag">{item.submission_type.replaceAll("_", " ")}</span>
                  {#if item.status === "planned"}<span class="tag">Planned</span>{/if}
                </div>
              </div>
              {#if item.details}<div class="list-entry-detail">{item.details}</div>{/if}
              {#if item.careers_url}
                <a href={item.careers_url} target="_blank" rel="noopener noreferrer" class="text-link list-entry-link">
                  Open careers page
                </a>
              {/if}
              <div class="action-row compact list-entry-actions">
                <button class="btn-secondary" onclick={() => moderateFeedback(item.id, "declined")}>Decline</button>
                {#if item.status !== "planned"}
                  <button class="btn-secondary" onclick={() => moderateFeedback(item.id, "planned")}>Plan</button>
                {/if}
                <button class="btn-primary btn-accent" onclick={() => moderateFeedback(item.id, "resolved")}>Resolve</button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>

    <section class="admin-section">
      <div class="admin-section-heading"><h2>Listing reports</h2><span>{reports.length} open</span></div>
      <div class="surface-list">
        {#if reports.length === 0}
          <div class="surface-empty">Nothing needs review.</div>
        {:else}
          {#each reports as report}
            <div class="list-entry">
              <div class="list-entry-header">
                <div class="list-entry-title">{report.job_title ?? report.company_name ?? "Unknown listing"}</div>
                <span class="tag">{report.report_type.replaceAll("_", " ")}</span>
              </div>
              {#if report.job_title && report.company_name}<div class="list-entry-meta">{report.company_name}</div>{/if}
              {#if report.notes}<div class="list-entry-detail">{report.notes}</div>{/if}
              <div class="action-row compact list-entry-actions">
                <button class="btn-secondary" onclick={() => moderateReport(report.id, "dismissed")}>Dismiss</button>
                <button class="btn-primary btn-accent" onclick={() => moderateReport(report.id, "resolved")}>Resolve</button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  {#if view === "runs"}
    <section class="admin-section">
      <div class="admin-section-heading"><h2>Operations</h2></div>
      <div class="surface-list">
        <div class="grouped-row run-operation">
          <div class="grouped-row-copy">
            <div class="row-title">Refresh every source</div>
            <div class="helper-text">{refreshProgress || "Run the full company poll now."}</div>
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
          <div class="surface-empty">No fetch runs yet.</div>
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
{/if}

<style>
  .admin-section + .admin-section { margin-top: 28px; }

  .admin-section-heading {
    min-height: 24px;
    margin-bottom: 9px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .admin-section-heading h2,
  .metric-group h3 {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-base);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .admin-section-heading span {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
  }

  .metric-summary {
    overflow: hidden;
    border: 1px solid var(--color-line-2);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elev);
  }

  .metric-group { padding: 14px 16px 8px; }
  .metric-group + .metric-group { border-top: 0.5px solid var(--color-line); }

  .metric-group h3 {
    margin-bottom: 7px;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .metric-group dl { margin: 0; }

  .metric-group dl > div {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .metric-group dt {
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
  }

  .metric-group dd {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

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
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    overflow-wrap: anywhere;
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
  .run-issue-more summary { min-height: 32px; display: flex; align-items: center; justify-content: space-between; gap: 8px; color: currentColor; font-weight: 600; cursor: pointer; list-style: none; }
  .run-issue-more summary::-webkit-details-marker { display: none; }
  .run-issue-more summary :global(svg) { flex: none; transition: transform var(--duration-fast) var(--ease-standard); }
  .run-issue-more[open] summary :global(svg) { transform: rotate(180deg); }
  .run-issue-more-list { padding: 2px 0 3px; display: grid; gap: 8px; }

  @media (min-width: 760px) {
    .metric-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .metric-group + .metric-group { border-top: 0; }
    .metric-group:nth-child(even) { border-left: 0.5px solid var(--color-line); }
    .metric-group:nth-child(n + 3) { border-top: 0.5px solid var(--color-line); }
  }
</style>
