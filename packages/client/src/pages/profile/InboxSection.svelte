<script lang="ts">
  import { onMount } from "svelte";
  import {
    api,
    type ContentReport,
    type FeedbackSubmission,
    type JobReview,
  } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
  import { feedback } from "../../lib/feedback.svelte";
  import { openInAppBrowser } from "../../lib/application-browser";
  import Spinner from "../../components/Spinner.svelte";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import EmptyState from "../../components/EmptyState.svelte";
  import InlineFailure from "../../components/InlineFailure.svelte";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";

  let {
    onError,
    onSuccess,
    nativeIos = false,
  }: {
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    nativeIos?: boolean;
  } = $props();

  const NATIVE_JOB_REVIEW_PAGE_SIZE = 5;
  const DESKTOP_JOB_REVIEW_PAGE_SIZE = 100;

  let loading = $state(true);
  let feedbackLoadError: string | null = $state(null);
  let reportsLoadError: string | null = $state(null);
  let reviewsLoadError: string | null = $state(null);
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
  let moderatingReview: { jobId: string; state: "approved" | "rejected" } | null = $state(null);

  function reviewReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      ambiguous_title_level: "Title level is ambiguous",
      experience_requirement_unparsed: "Experience requirement is unclear",
      advanced_degree_uncertain: "Advanced degree may be required",
    };
    return labels[reason] ?? reason.replaceAll("_", " ");
  }

  async function loadInbox() {
    loading = true;
    feedbackLoadError = null;
    reportsLoadError = null;
    reviewsLoadError = null;
    try {
      const [reportsResult, feedbackResult, reviewsResult] = await Promise.allSettled([
        api.interactions.reports("open"),
        api.interactions.feedback("active"),
        api.interactions.jobReviews("needs_review", nativeIos ? NATIVE_JOB_REVIEW_PAGE_SIZE : 3, 0),
      ]);
      if (reportsResult.status === "fulfilled") {
        reports = reportsResult.value.reports;
      } else {
        reportsLoadError = errorMessage(reportsResult.reason);
      }
      if (feedbackResult.status === "fulfilled") {
        feedbackInbox = feedbackResult.value.feedback;
      } else {
        feedbackLoadError = errorMessage(feedbackResult.reason);
      }
      if (reviewsResult.status === "fulfilled") {
        jobReviews = reviewsResult.value.reviews;
        jobReviewTotal = reviewsResult.value.meta.total;
        jobReviewsHaveMore = reviewsResult.value.meta.has_more;
        jobReviewNextOffset = reviewsResult.value.meta.next_offset;
      } else {
        reviewsLoadError = errorMessage(reviewsResult.reason);
      }
      const failures = [reportsLoadError, feedbackLoadError, reviewsLoadError].filter(Boolean);
      if (failures.length > 0 && !nativeIos) onError(failures[0] ?? "Could not load the inbox.");
    } finally {
      loading = false;
    }
  }

  async function loadMoreJobReviews() {
    if (loadingMoreReviews || !jobReviewsHaveMore) return;
    loadingMoreReviews = true;
    try {
      const result = await api.interactions.jobReviews(
        "needs_review",
        nativeIos ? NATIVE_JOB_REVIEW_PAGE_SIZE : DESKTOP_JOB_REVIEW_PAGE_SIZE,
        jobReviewNextOffset
      );
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

  async function moderateJobReview(jobId: string, state: "approved" | "rejected") {
    if (moderatingReview) return;
    const review = jobReviews.find((item) => item.job_id === jobId);
    if (!review) return;
    const note = reviewNotes[jobId]?.trim() || undefined;
    moderatingReview = { jobId, state };
    try {
      await api.interactions.updateJobReview(jobId, {
        state,
        admin_note: note,
      });
      jobReviews = jobReviews.filter((item) => item.job_id !== jobId);
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
      moderatingReview = null;
    }
  }

  async function expandJobReviews() {
    reviewsExpanded = true;
    if (jobReviewsHaveMore && jobReviews.length <= 3) await loadMoreJobReviews();
  }

  async function moderateReport(id: string, status: "resolved" | "dismissed") {
    try {
      await api.interactions.updateReport(id, { status });
      reports = reports.filter((report) => report.id !== id);
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
      }
    } catch (caught) {
      onError(errorMessage(caught));
    }
  }

  onMount(() => {
    void loadInbox();
  });
</script>

{#if loading}
  <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading inbox" /></div>
{:else}
  <section class="admin-section">
    <div class="admin-section-heading"><h2>Feedback</h2><span>{feedbackInbox.length} active</span></div>
    <div class="surface-list">
      {#if nativeIos && feedbackLoadError}
        <InlineFailure title="Feedback didn’t load" onRetry={() => void loadInbox()} />
      {:else if feedbackInbox.length === 0}
        {#if nativeIos}
          <EmptyState compact title="No active feedback" message="New feedback will appear here." />
        {:else}
          <div class="surface-empty">No active suggestions.</div>
        {/if}
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
      {#if nativeIos && reportsLoadError}
        <InlineFailure title="Reports didn’t load" onRetry={() => void loadInbox()} />
      {:else if reports.length === 0}
        {#if nativeIos}
          <EmptyState compact title="No open reports" message="New listing reports will appear here." />
        {:else}
          <div class="surface-empty">No open reports.</div>
        {/if}
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
      {#if nativeIos && reviewsLoadError}
        <InlineFailure title="Reviews didn’t load" onRetry={() => void loadInbox()} />
      {:else if jobReviews.length === 0}
        {#if nativeIos}
          <EmptyState compact title="Review queue is clear" message="Flagged jobs will appear here." />
        {:else}
          <div class="surface-empty">Nothing needs review.</div>
        {/if}
      {:else}
        {#each nativeIos || reviewsExpanded ? jobReviews : jobReviews.slice(0, 3) as review}
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
                disabled={moderatingReview !== null}
                onclick={() => moderateJobReview(review.job_id, "rejected")}
              >
                {#if moderatingReview?.jobId === review.job_id && moderatingReview.state === "rejected"}<Spinner />{/if}
                Reject
              </button>
              <button
                class="btn-primary btn-accent"
                disabled={moderatingReview !== null}
                onclick={() => moderateJobReview(review.job_id, "approved")}
              >
                {#if moderatingReview?.jobId === review.job_id && moderatingReview.state === "approved"}<Spinner />{/if}
                Approve
              </button>
            </div>
          </article>
        {/each}

        {#if nativeIos && jobReviewsHaveMore}
          <div class="review-pagination">
            <button class="btn-secondary full-width" disabled={loadingMoreReviews} onclick={loadMoreJobReviews}>
              {#if loadingMoreReviews}<Spinner />{/if}
              Load more reviews
            </button>
            <span class="review-progress" aria-live="polite">Showing {jobReviews.length} of {jobReviewTotal}</span>
          </div>
        {:else if !nativeIos && !reviewsExpanded && (jobReviewsHaveMore || jobReviewTotal > jobReviews.length)}
          <button class="review-disclosure" type="button" disabled={loadingMoreReviews} onclick={expandJobReviews}>
            {#if loadingMoreReviews}<Spinner />{/if}
            <span>View all {jobReviewTotal}</span>
            <CaretDown size={16} weight="bold" aria-hidden="true" />
          </button>
        {:else if !nativeIos && reviewsExpanded}
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

<style>
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
    gap: var(--space-2);
    border-top: 0.5px solid var(--color-line);
  }

  .review-progress {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
  }
</style>
