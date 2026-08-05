<script lang="ts">
  import { onMount } from "svelte";
  import {
    api,
    type ContentReport,
    type FeedbackSubmission,
    type FetchRun,
    type JobReview,
    type ProductMetrics,
  } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import { feedback } from "../../lib/feedback.svelte";
  import { openInAppBrowser } from "../../lib/application-browser";
  import Spinner from "../../components/Spinner.svelte";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";

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
  let jobReviews: JobReview[] = $state([]);
  let jobReviewTotal = $state(0);
  let jobReviewsHaveMore = $state(false);
  let jobReviewNextOffset = $state(0);
  let loadingMoreReviews = $state(false);
  let reviewsExpanded = $state(false);
  let reviewNotes: Record<string, string> = $state({});
  let reviewNoteOpen: Record<string, boolean> = $state({});
  let moderatingReviewId: string | null = $state(null);
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

  function reviewReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      ambiguous_title_level: "Title level is ambiguous",
      experience_requirement_unparsed: "Experience requirement is unclear",
      advanced_degree_uncertain: "Advanced degree may be required",
    };
    return labels[reason] ?? reason.replaceAll("_", " ");
  }

  async function loadAdminData() {
    loading = true;
    try {
      const [nextRuns, nextMetrics, nextReports, nextFeedback, reviewResult] = await Promise.all([
        api.runs.list(50).then((result) => result.runs ?? []).catch(() => []),
        api.metrics.get().catch(() => null),
        api.interactions.reports("open").then((result) => result.reports).catch(() => []),
        api.interactions.feedback("active").then((result) => result.feedback).catch(() => []),
        api.interactions.jobReviews("needs_review", 3, 0).catch(() => ({
          reviews: [],
          meta: { total: 0, count: 0, has_more: false, next_offset: 0 },
        })),
      ]);
      runs = nextRuns;
      productMetrics = nextMetrics;
      reports = nextReports;
      feedbackInbox = nextFeedback;
      jobReviews = reviewResult.reviews;
      jobReviewTotal = reviewResult.meta.total;
      jobReviewsHaveMore = reviewResult.meta.has_more;
      jobReviewNextOffset = reviewResult.meta.next_offset;
    } finally {
      loading = false;
    }
  }

  async function loadMoreJobReviews() {
    if (loadingMoreReviews || !jobReviewsHaveMore) return;
    loadingMoreReviews = true;
    try {
      const result = await api.interactions.jobReviews("needs_review", 100, jobReviewNextOffset);
      const loadedIds = new Set(jobReviews.map((review) => review.job_id));
      jobReviews = [
        ...jobReviews,
        ...result.reviews.filter((review) => !loadedIds.has(review.job_id)),
      ];
      jobReviewTotal = result.meta.total;
      jobReviewsHaveMore = result.meta.has_more;
      jobReviewNextOffset = result.meta.next_offset;
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      loadingMoreReviews = false;
    }
  }

  async function expandJobReviews() {
    reviewsExpanded = true;
    if (jobReviewsHaveMore && jobReviews.length <= 3) {
      await loadMoreJobReviews();
    }
  }

  async function moderateJobReview(jobId: string, state: "approved" | "rejected") {
    if (moderatingReviewId) return;
    const review = jobReviews.find((item) => item.job_id === jobId);
    if (!review) return;
    const note = reviewNotes[jobId]?.trim() || undefined;
    moderatingReviewId = jobId;
    try {
      await api.interactions.updateJobReview(jobId, {
        state,
        admin_note: note,
      });
      jobReviews = jobReviews.filter((review) => review.job_id !== jobId);
      jobReviewTotal = Math.max(0, jobReviewTotal - 1);
      jobReviewNextOffset = Math.max(0, jobReviewNextOffset - 1);
      const nextNotes = { ...reviewNotes };
      delete nextNotes[jobId];
      reviewNotes = nextNotes;
      const nextOpenNotes = { ...reviewNoteOpen };
      delete nextOpenNotes[jobId];
      reviewNoteOpen = nextOpenNotes;
      feedback.success(state === "approved" ? "Job approved" : "Job rejected", {
        action: {
          label: "Undo",
          run: async () => {
            try {
              await api.interactions.updateJobReview(jobId, {
                state: "needs_review",
                admin_note: note,
              });
              if (!jobReviews.some((item) => item.job_id === jobId)) {
                jobReviews = [
                  { ...review, state: "needs_review", admin_note: note ?? null, reviewed_at: null },
                  ...jobReviews,
                ];
                jobReviewTotal += 1;
                jobReviewNextOffset += 1;
              }
              if (note) reviewNotes = { ...reviewNotes, [jobId]: note };
              onSuccess("Review restored");
            } catch (caught) {
              onError(errorMessage(caught));
            }
          },
        },
      });
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      moderatingReviewId = null;
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
            <div><dt>Eligible-job dismissals</dt><dd>{productMetrics.eligible_job_dismissal_rate}%</dd></div>
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
          <div class="surface-empty">No open reports.</div>
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

    <section class="admin-section review-section">
      <div class="admin-section-heading">
        <h2>Needs review</h2>
        <span>{jobReviewTotal} open</span>
      </div>
      <div class="surface-list">
        {#if jobReviews.length === 0}
          <div class="surface-empty">Nothing needs review.</div>
        {:else}
          {#each (reviewsExpanded ? jobReviews : jobReviews.slice(0, 3)) as review}
            <article class="list-entry review-entry">
              <div class="list-entry-title">{review.title}</div>
              <div class="list-entry-meta">{review.company_name} · {review.location}</div>

              <div class="review-reasons">
                <span>Flagged because</span>
                <ul>
                  {#each review.reason_codes as reason}
                    <li>{reviewReasonLabel(reason)}</li>
                  {/each}
                </ul>
              </div>

              <div class="review-links">
                <button type="button" class="text-button source-button" onclick={() => void openInAppBrowser(review.url)}>
                  <ArrowSquareOut size={15} aria-hidden="true" />
                  Source
                </button>
                <button
                  type="button"
                  class="text-button review-note-toggle"
                  aria-expanded={reviewNoteOpen[review.job_id] === true}
                  aria-controls={`review-note-${review.job_id}`}
                  onclick={() => {
                    reviewNoteOpen = {
                      ...reviewNoteOpen,
                      [review.job_id]: !reviewNoteOpen[review.job_id],
                    };
                  }}
                >{reviewNoteOpen[review.job_id] ? "Hide note" : "Add note"}</button>
              </div>

              {#if reviewNoteOpen[review.job_id]}
                <div class="review-note">
                  <textarea
                    id={`review-note-${review.job_id}`}
                    class="input-field textarea-field"
                    aria-label="Review note"
                    rows="2"
                    placeholder="Optional note"
                    value={reviewNotes[review.job_id] ?? ""}
                    oninput={(event) => {
                      reviewNotes = { ...reviewNotes, [review.job_id]: event.currentTarget.value };
                    }}
                  ></textarea>
                </div>
              {/if}

              <div class="action-row compact list-entry-actions">
                <button
                  class="btn-secondary"
                  disabled={moderatingReviewId !== null}
                  onclick={() => moderateJobReview(review.job_id, "rejected")}
                >Reject</button>
                <button
                  class="btn-primary btn-accent"
                  disabled={moderatingReviewId !== null}
                  onclick={() => moderateJobReview(review.job_id, "approved")}
                >
                  {#if moderatingReviewId === review.job_id}<Spinner />{/if}
                  Approve
                </button>
              </div>
            </article>
          {/each}

          {#if !reviewsExpanded && (jobReviewsHaveMore || jobReviewTotal > jobReviews.length)}
            <button class="review-disclosure" type="button" disabled={loadingMoreReviews} onclick={expandJobReviews}>
              {#if loadingMoreReviews}<Spinner />{/if}
              <span>View all {jobReviewTotal}</span>
              <CaretDown size={16} weight="bold" aria-hidden="true" />
            </button>
          {:else if reviewsExpanded}
            <div class="review-pagination">
              {#if jobReviewsHaveMore}
                <button class="btn-secondary full-width" disabled={loadingMoreReviews} onclick={loadMoreJobReviews}>
                  {#if loadingMoreReviews}<Spinner />{/if}
                  Load more
                </button>
              {/if}
              <button class="text-button" type="button" onclick={() => (reviewsExpanded = false)}>Show less</button>
            </div>
          {/if}
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
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.3;
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
    letter-spacing: 0;
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

  .admin-section :global(.list-entry-title) {
    font-size: var(--fs-sm);
    font-weight: 600;
    line-height: 1.4;
  }

  .admin-section :global(.list-entry-detail) {
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  .review-entry {
    padding-block: 16px;
  }

  .review-reasons {
    margin-top: 12px;
    display: grid;
    gap: 3px;
    font-size: var(--fs-xs);
    line-height: 1.45;
  }

  .review-reasons > span {
    color: var(--color-ink-4);
  }

  .review-reasons ul {
    margin: 0;
    padding-inline-start: 18px;
    color: var(--color-ink-2);
  }

  .review-links {
    min-height: 36px;
    margin-top: 7px;
    display: flex;
    align-items: center;
    gap: 18px;
    font-size: var(--fs-xs);
  }

  .source-button {
    min-height: 36px;
    padding-block: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--color-accent);
    font-size: var(--fs-xs);
  }

  .review-note-toggle {
    min-height: 36px;
    padding-block: 0;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .review-note {
    margin-top: 6px;
    display: block;
  }

  .review-note :global(.textarea-field) {
    min-height: 76px;
  }

  .review-disclosure {
    width: 100%;
    min-height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    border-top: 0.5px solid var(--color-line);
    background: transparent;
    color: var(--color-accent);
    font-size: var(--fs-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .review-disclosure:hover { background: var(--color-bg-sunken); }

  .review-pagination {
    padding: 12px 16px;
    display: grid;
    justify-items: center;
    gap: 4px;
    border-top: 0.5px solid var(--color-line);
  }

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
