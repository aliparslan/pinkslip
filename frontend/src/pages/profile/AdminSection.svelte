<script lang="ts">
  // Admin-only operations: product metrics, feedback inbox,
  // content reports, and poller controls. Loads its own data on mount so the
  // user-facing Profile page doesn't carry any of this.
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

  let {
    onError,
    onSuccess,
  }: {
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
  } = $props();

  let loading: boolean = $state(true);
  let runs: FetchRun[] = $state([]);
  let productMetrics: ProductMetrics | null = $state(null);
  let reports: ContentReport[] = $state([]);
  let feedbackInbox: FeedbackSubmission[] = $state([]);
  let refreshingAll: boolean = $state(false);
  let refreshLog: string[] = $state([]);

  function formatLatency(seconds: number) {
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${Math.round((seconds / 3600) * 10) / 10} hr`;
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
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  async function moderateFeedback(
    id: string,
    status: "planned" | "resolved" | "declined"
  ) {
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
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  async function refreshAllCompanies() {
    refreshingAll = true;
    try {
      const result = await api.ops.refreshAll();
      refreshLog = result.log ?? [];
      onSuccess(`Polled ${result.companiesPolled} companies · ${result.newJobsFound} new jobs`);
      await loadAdminData();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      refreshingAll = false;
    }
  }

  onMount(() => {
    void loadAdminData();
  });
</script>

{#if loading}
  <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading operations" /></div>
{:else}
  {#if productMetrics}
    <section>
      <h2 class="section-label" style="display: block; margin-bottom: 10px;">Product health · last 30 days</h2>
      <div class="ops-metric-grid">
        <div class="ops-metric"><span>Job to alert</span><strong>{formatLatency(productMetrics.notification_latency_seconds)}</strong></div>
        <div class="ops-metric"><span>Alert open rate</span><strong>{productMetrics.notification_open_rate}%</strong></div>
        <div class="ops-metric"><span>Viable profiles</span><strong>{productMetrics.users_with_enough_matches}/{productMetrics.total_profiles}</strong></div>
        <div class="ops-metric"><span>Onboarding complete</span><strong>{productMetrics.onboarding_completion_rate}%</strong></div>
        <div class="ops-metric"><span>Accounts created</span><strong>{productMetrics.accounts_created}</strong></div>
        <div class="ops-metric"><span>Push registrations</span><strong>{productMetrics.push_registrations}</strong></div>
        <div class="ops-metric"><span>Fast apply clicks</span><strong>{productMetrics.apply_clicks_within_one_hour}</strong></div>
        <div class="ops-metric"><span>High-score dismiss</span><strong>{productMetrics.high_score_dismissal_rate}%</strong></div>
        <div class="ops-metric"><span>Tailor to apply</span><strong>{productMetrics.tailoring_to_application_rate}%</strong></div>
        <div class="ops-metric"><span>Profile adjustments</span><strong>{productMetrics.profile_adjustments}</strong></div>
        <div class="ops-metric"><span>Active feedback</span><strong>{productMetrics.open_feedback}</strong></div>
        <div class="ops-metric"><span>Open reports</span><strong>{productMetrics.open_reports}</strong></div>
      </div>
    </section>
  {/if}

  <section>
    <h2 class="section-label" style="display: block; margin-bottom: 10px;">Feedback inbox</h2>
    <div class="surface-list">
      {#if feedbackInbox.length === 0}
        <div style="padding: 18px; font-size: var(--fs-sm); color: var(--color-ink-3);">No active suggestions.</div>
      {:else}
        {#each feedbackInbox as item, index}
          <div style="padding: 14px 16px; {index > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''}">
            <div style="display: flex; justify-content: space-between; gap: 10px; align-items: flex-start;">
              <div style="min-width: 0;">
                <div style="font-size: var(--fs-md); font-weight: 600;">{item.title}</div>
                <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 3px;">
                  {item.user_name || "User"} · {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                <span class="tag">{item.submission_type.replaceAll("_", " ")}</span>
                {#if item.status === "planned"}
                  <span class="tag">planned</span>
                {/if}
              </div>
            </div>
            {#if item.details}
              <div style="font-size: var(--fs-sm); color: var(--color-ink-2); margin-top: 8px; line-height: 1.45; white-space: pre-wrap;">{item.details}</div>
            {/if}
            {#if item.careers_url}
              <a
                href={item.careers_url}
                target="_blank"
                rel="noopener noreferrer"
                style="display: inline-block; font-size: var(--fs-xs); color: var(--color-accent); margin-top: 8px; overflow-wrap: anywhere;"
              >
                Open careers page
              </a>
            {/if}
            <div class="action-row compact" style="margin-top: 10px;">
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

  <section>
    <h2 class="section-label" style="display: block; margin-bottom: 10px;">Open reports</h2>
    <div class="surface-list">
      {#if reports.length === 0}
        <div style="padding: 18px; font-size: var(--fs-sm); color: var(--color-ink-3);">Nothing needs review.</div>
      {:else}
        {#each reports as report, index}
          <div style="padding: 14px 16px; {index > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''}">
            <div style="display: flex; justify-content: space-between; gap: 10px;">
              <div style="font-size: var(--fs-md); font-weight: 600;">
                {report.job_title ?? report.company_name ?? "Unknown listing"}
              </div>
              <span class="tag">{report.report_type.replaceAll("_", " ")}</span>
            </div>
            {#if report.job_title && report.company_name}
              <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 3px;">{report.company_name}</div>
            {/if}
            {#if report.notes}
              <div style="font-size: var(--fs-sm); color: var(--color-ink-2); margin-top: 8px; line-height: 1.45;">{report.notes}</div>
            {/if}
            <div class="action-row compact" style="margin-top: 10px;">
              <button class="btn-secondary" onclick={() => moderateReport(report.id, "dismissed")}>Dismiss</button>
              <button class="btn-primary btn-accent" onclick={() => moderateReport(report.id, "resolved")}>Resolve</button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <section>
    <h2 class="section-eyebrow">Operations</h2>
    <div class="surface-card" style="padding: 18px; display: flex; flex-direction: column; gap: 14px;">
      <div style="display: flex; flex-direction: column; align-items: stretch; gap: 12px;">
        <div>
          <div style="font-size: var(--fs-md); font-weight: 500;">Force refresh all companies</div>
          <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 2px;">Runs the full poll loop right now for every active company.</div>
        </div>
        <button
          class="btn-secondary"
          style="width: 100%; height: 48px; padding: 0 14px;"
          disabled={refreshingAll}
          onclick={refreshAllCompanies}
        >
          {#if refreshingAll}<Spinner />{/if}
          Run now
        </button>
      </div>
      {#if refreshLog.length > 0}
        <div style="padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-bg-sunken); border: 1px solid var(--color-line-2); font-family: var(--font-mono); font-size: var(--fs-2xs); color: var(--color-ink-3); display: flex; flex-direction: column; gap: 4px;">
          {#each refreshLog.slice(0, 8) as line}
            <div>{line}</div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <section>
    <h2 class="section-eyebrow">Recent fetch runs</h2>
    <div class="surface-list">
      {#if runs.length === 0}
        <div style="padding: 18px; font-size: var(--fs-sm); color: var(--color-ink-3);">
          No fetch runs yet.
        </div>
      {:else}
        {#each runs.slice(0, 12) as run, index}
          <div style="padding: 14px 16px; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; min-width: 0; {index > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''}">
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: var(--fs-md); font-weight: 600; text-transform: capitalize;">
                {run.status} · {run.new_jobs_found} new · {run.companies_succeeded}/{run.companies_attempted}
              </div>
              <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 4px; font-family: var(--font-mono);">
                {new Date(run.started_at).toLocaleString()} · {run.duration_ms ?? 0}ms
              </div>
              {#if run.errors_json}
                <div style="font-size: var(--fs-xs); color: var(--color-bad); margin-top: 6px; overflow-wrap: anywhere;">
                  {run.errors_json}
                </div>
              {/if}
            </div>
            <span class="tag" style="align-self: flex-start;">{run.notifications_sent} pushes</span>
          </div>
        {/each}
      {/if}
    </div>
  </section>
{/if}
