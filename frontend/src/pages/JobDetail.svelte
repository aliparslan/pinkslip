<script lang="ts">
  import { onDestroy } from "svelte";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import { api, type Job } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { hapticLight } from "../lib/haptics";
  import { shareLink } from "../lib/share";
  import { feed } from "../lib/feed-store.svelte";
  import { sessionAccess } from "../lib/session-access";
  import { markViewed } from "../lib/viewed";
  import { feedback } from "../lib/feedback.svelte";
  import { applicationIntent } from "../lib/application-intent.svelte";
  import { presentPending } from "../lib/task-presentation.svelte";
  import {
    extractPlainTextFromHtml,
    extractSalaryFromHtml,
    normalizeSalaryText,
    sanitizeJobDescriptionHtml,
  } from "../lib/job-content";
  import { DropdownMenu } from "bits-ui";
  import CompanyLogo from "../components/CompanyLogo.svelte";
  import Modal from "../components/Modal.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import MapPin from "phosphor-svelte/lib/MapPin";
  import Money from "phosphor-svelte/lib/Money";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import Export from "phosphor-svelte/lib/Export";
  import DotsThree from "phosphor-svelte/lib/DotsThree";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
  import X from "phosphor-svelte/lib/X";
  import Trash from "phosphor-svelte/lib/Trash";
  import MagicWand from "phosphor-svelte/lib/MagicWand";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import Flag from "phosphor-svelte/lib/Flag";
  import Spinner from "../components/Spinner.svelte";

  let { jobId = null }: { jobId?: string | null } = $props();

  let job = $state<Job | null>(null);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let dismissing: boolean = $state(false);
  let saved: boolean = $state(false);
  let applied: boolean = $state(false);
  let applying: boolean = $state(false);
  let applyingPending: boolean = $state(false);
  let showBlockConfirm: boolean = $state(false);
  let showMore: boolean = $state(false);
  let blocking: boolean = $state(false);
  let descriptionPending: boolean = $state(false);
  let hidingCompany: boolean = $state(false);
  let showReport: boolean = $state(false);
  let reportType: string = $state("incorrect_details");
  let reportNotes: string = $state("");
  let reporting: boolean = $state(false);
  let openedJobId: string | null = null;
  let descriptionRefreshTimer: number | null = null;
  let descriptionRefreshAttempts = 0;

  const MAX_DESCRIPTION_REFRESH_ATTEMPTS = 5;

  function clearDescriptionRefreshTimer() {
    if (descriptionRefreshTimer !== null) {
      window.clearTimeout(descriptionRefreshTimer);
      descriptionRefreshTimer = null;
    }
  }

  function removeFromFeedStore(id: string) {
    feed.jobs = feed.jobs.filter((item) => item.id !== id);
  }

  function syncJobState(nextJob: Job) {
    job = nextJob;
    saved = Boolean(nextJob?.saved);
    applied = Boolean(nextJob?.applied);
    descriptionPending = Boolean(nextJob?.content_pending && !nextJob?.description);
  }

  async function loadJobDetail(silent = false) {
    if (!jobId) return;
    if (!silent) {
      loading = true;
      error = null;
    }

    try {
      const nextJob = await api.jobs.get(jobId);
      syncJobState(nextJob);
      if (openedJobId !== jobId) {
        openedJobId = jobId;
        markViewed(jobId);
        void api.interactions.event({
          event_name: "job_opened",
          entity_type: "job",
          entity_id: jobId,
          properties: {},
        }).catch(() => undefined);
      }

      if (descriptionPending && descriptionRefreshAttempts < MAX_DESCRIPTION_REFRESH_ATTEMPTS) {
        clearDescriptionRefreshTimer();
        descriptionRefreshTimer = window.setTimeout(async () => {
          descriptionRefreshAttempts += 1;
          await loadJobDetail(true);
        }, nextJob.content_refresh_after_ms ?? 1500);
      } else if (descriptionPending) {
        descriptionPending = false;
        clearDescriptionRefreshTimer();
      } else if (!descriptionPending) {
        clearDescriptionRefreshTimer();
      }
    } catch (e) {
      if (!silent || !job) {
        error = errorMessage(e);
      }
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!jobId) return;
    applied = false;
    descriptionRefreshAttempts = 0;
    clearDescriptionRefreshTimer();
    void loadJobDetail();

    return () => {
      clearDescriptionRefreshTimer();
    };
  });

  onDestroy(() => {
    clearDescriptionRefreshTimer();
  });

  async function markApplied() {
    if (!jobId || !job || applying || applied) return;
    applying = true;
    try {
      await presentPending(
        () => api.jobs.markApplied(jobId),
        (pending) => { applyingPending = pending; },
      );
      applied = true;
      removeFromFeedStore(jobId);
      feedback.success("Added to applied jobs");
    } catch (e) {
      feedback.error(errorMessage(e, "Could not mark this job as applied."));
    } finally {
      applying = false;
      applyingPending = false;
    }
  }

  async function openApplication() {
    if (!job?.url) return;
    void api.interactions.event({
      event_name: "apply_clicked",
      entity_type: "job",
      entity_id: jobId ?? undefined,
      properties: {},
    }).catch(() => undefined);
    try {
      await applicationIntent.open(job);
    } catch (e) {
      feedback.error(errorMessage(e, "Could not open the application page."));
    }
  }

  async function handleDismiss() {
    if (!jobId) return;
    dismissing = true;
    try {
      await api.jobs.dismiss(jobId);
      removeFromFeedStore(jobId);
      navigate("/");
    } catch (e) {
      feedback.error(errorMessage(e, "Could not dismiss this job."));
      dismissing = false;
    }
  }

  function shareJob() {
    if (!job) return;
    hapticLight();
    void shareLink({
      title: `${job.title} · ${job.company_name}`,
      text: `${job.title} at ${job.company_name}`,
      url: job.url || window.location.href,
    });
  }

  async function toggleSave() {
    if (!jobId) return;
    const newVal = !saved;
    saved = newVal;
    hapticLight();
    try {
      if (newVal) {
        await api.savedJobs.save(jobId);
      } else {
        await api.savedJobs.unsave(jobId);
      }
    } catch (e) {
      saved = !newVal;
      feedback.error(errorMessage(e, "Could not update your saved jobs."));
    }
  }

  async function handleBlock() {
    if (!jobId || blocking) return;
    blocking = true;
    try {
      await api.jobs.block(jobId);
      removeFromFeedStore(jobId);
      navigate("/");
    } catch (e) {
      feedback.error(errorMessage(e, "Could not block this job."));
      blocking = false;
    }
  }

  async function hideCompany() {
    if (!job?.company_id || hidingCompany) return;
    hidingCompany = true;
    try {
      await api.companies.block(job.company_id);
      feed.jobs = feed.jobs.filter((item) => item.company_id !== job?.company_id);
      navigate("/");
    } catch (e) {
      feedback.error(errorMessage(e, "Could not hide this company."));
      hidingCompany = false;
    }
  }

  async function submitReport() {
    if (!jobId || reporting) return;
    reporting = true;
    try {
      await api.interactions.report({
        job_id: jobId,
        report_type: reportType,
        notes: reportNotes,
      });
      showReport = false;
      reportNotes = "";
      feedback.success("Report sent. Thanks for helping keep listings accurate.");
    } catch (e) {
      feedback.error(errorMessage(e, "Could not send that report."));
    } finally {
      reporting = false;
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  let extractedSalary = $derived(job?.description ? extractSalaryFromHtml(job.description) : null);
  let displaySalary = $derived(normalizeSalaryText(
    job?.salary?.trim() ? job.salary : extractedSalary
  ));
  let matchReasons = $derived(
    job?.match_reasons
      ?.filter((reason) => reason.toLowerCase() !== "new today")
      .slice(0, 4) ?? []
  );
  let sanitizedDescription = $derived(job?.description ? sanitizeJobDescriptionHtml(job.description, {
    title: job.title,
    companyName: job.company_name,
  }) : "");
  let plainDescription = $derived.by(() => {
    return extractPlainTextFromHtml(job?.description);
  });

</script>

<div class="page pushed-screen">
  <ScreenNav
    title=""
    backLabel="Back to feed"
    onBack={() => { if (!requestBack()) navigate("/"); }}
  >
    {#snippet trailing()}
      <div class="job-header-actions">
      <button class="icon-btn" aria-label="Share job" onclick={shareJob}>
        <Export size={19} color="var(--color-ink-3)" />
      </button>
      <button class="icon-btn" aria-label="Save" onclick={toggleSave}>
        <BookmarkSimple size={20} weight={saved ? "fill" : "regular"} color={saved ? "var(--color-accent)" : "var(--color-ink-2)"} />
      </button>
      <DropdownMenu.Root bind:open={showMore}>
        <DropdownMenu.Trigger class="icon-btn" aria-label="More job actions">
          <DotsThree size={22} weight="bold" color="var(--color-ink-3)" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            class="job-more-menu"
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={12}
            strategy="fixed"
            preventScroll={false}
          >
            <DropdownMenu.Item
              class="job-more-menu-item"
              disabled={hidingCompany}
              onSelect={() => void hideCompany()}
            >
              {#if hidingCompany}<Spinner size={16} />{:else}<EyeSlash size={17} />{/if}
              <span>Hide {job?.company_name ?? "company"}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item class="job-more-menu-item" onSelect={() => { showReport = true; }}>
              <Flag size={17} />
              <span>Report listing</span>
            </DropdownMenu.Item>
            {#if $sessionAccess.isAdmin}
              <DropdownMenu.Item class="job-more-menu-item danger" onSelect={() => { showBlockConfirm = true; }}>
                <Trash size={17} />
                <span>Block for everyone</span>
              </DropdownMenu.Item>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      </div>
    {/snippet}
  </ScreenNav>

  <div class="screen-content job-detail-content">
    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else if error}
      <div class="job-detail-error" role="alert">
        <h1 class="h-display h-display-sm">This job didn&rsquo;t load</h1>
        <p>{error.toLowerCase().includes("not found") ? "The listing may have been removed since the alert was sent." : "Check your connection and try once more."}</p>
        <div class="button-cluster">
          <button class="btn-primary btn-accent" onclick={() => void loadJobDetail()}>Try again</button>
          <button class="btn-secondary" onclick={() => { if (!requestBack()) navigate("/"); }}>Back to jobs</button>
        </div>
      </div>
    {:else if job}
      <div class="job-detail-identity">
        <CompanyLogo name={job.company_name ?? "?"} domain={job.company_domain} size={52} />
        <div class="job-detail-heading">
          <div class="job-detail-company-line">
            <div class="section-label job-detail-company">
              {job.company_name}{#if job.posted_at} {" · Posted "}{formatDate(job.posted_at)}{/if}
            </div>
            {#if job.closed_at}
              <div class="tag">closed</div>
            {/if}
          </div>
          <h1 class="h-display h-display-md job-detail-title">
            {job.title}
          </h1>
        </div>
      </div>

      <div class="job-meta-strip job-detail-meta">
        {#if job.location}
          <div class="job-meta-item">
            <MapPin size={15} />
            <span>{job.location}</span>
          </div>
        {/if}
        {#if displaySalary}
          <div class="job-meta-item">
            <Money size={15} />
            <span>{displaySalary}</span>
          </div>
        {/if}
      </div>

      {#if matchReasons.length}
        <section class="job-match-panel" aria-labelledby="job-match-heading">
          <h2 id="job-match-heading">Why it matches</h2>
          <ul>
            {#each matchReasons as reason}
              <li><span aria-hidden="true"></span>{reason}</li>
            {/each}
          </ul>
        </section>
      {/if}

      <div class="job-state-actions">
          <button
            class="btn-secondary btn-action"
            disabled={applied || applying}
            onclick={markApplied}
          >
            {#if applyingPending}<Spinner />{:else}<CheckCircle size={16} />{/if}
            {applied ? "Applied ✓" : "I applied"}
          </button>
          <button
            class="btn-secondary btn-action"
            onclick={handleDismiss}
            disabled={dismissing}
          >
            {#if dismissing}<Spinner />{:else}<X size={15} />{/if}
            Not interested
          </button>
      </div>

      {#if descriptionPending}
        <div class="job-description-section">
          <h2 class="section-title job-description-heading">
            About the role
          </h2>
          <p class="job-description-lede with-action">
            Pulling the full posting now. This usually lands in a second or two.
          </p>
          <button class="btn-secondary btn-mini" onclick={() => { descriptionRefreshAttempts = 0; void loadJobDetail(true); }}>
            Check again
          </button>
        </div>
      {:else if sanitizedDescription}
        <div class="job-description-section">
          <h2 class="section-title job-description-heading">
            About the role
          </h2>
          <div class="job-description">
            {@html sanitizedDescription}
          </div>
          {#if job.url}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-link job-description-link"
            >
              Read full description
              <ArrowSquareOut size={13} />
            </a>
          {/if}
        </div>
      {:else if plainDescription}
        <div class="job-description-section">
          <h2 class="section-title job-description-heading">
            About the role
          </h2>
          <p class="job-description-lede">
            {plainDescription}
          </p>
          {#if job.url}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-link job-description-link"
            >
              Read full description
              <ArrowSquareOut size={13} />
            </a>
          {/if}
        </div>
      {:else}
        <div class="job-description-section">
          <h2 class="section-title job-description-heading">
            About the role
          </h2>
          <p class="job-description-lede with-action">
            We couldn’t pull the full job description yet. The original posting may still have it.
          </p>
          <div class="button-cluster">
            <button class="btn-secondary btn-mini" onclick={() => { descriptionRefreshAttempts = 0; void loadJobDetail(true); }}>
              Try again
            </button>
            {#if job.url}
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                class="btn-secondary btn-mini button-link"
              >
                Open original
              </a>
            {/if}
          </div>
        </div>
      {/if}

    {/if}
  </div>
</div>

{#if !loading && !error && job}
  <div class="job-action-bar-wrap">
    <div class="job-action-bar">
      {#if job.url}
        <button
          type="button"
          class="btn-primary btn-accent btn-action button-link"
          onclick={openApplication}
        >
          <ArrowSquareOut size={18} weight="regular" />
          Apply
        </button>
      {:else}
        <button class="btn-primary btn-accent btn-action" disabled>
          <ArrowSquareOut size={18} weight="regular" />
          Apply
        </button>
      {/if}
      <button
        class="btn-secondary btn-action"
        onclick={() => jobId && navigate(`/tailor/${jobId}`)}
      >
        <MagicWand size={16} />
        Tailor
      </button>
    </div>
  </div>
{/if}

<style>
  .job-detail-error {
    padding: 44px 4px;
  }

  .job-detail-error p {
    max-width: 34ch;
    margin: 8px 0 18px;
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  .job-match-panel {
    padding: var(--space-4);
    margin-bottom: var(--space-4);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
  }

  .job-match-panel h2 {
    margin: 0 0 var(--space-2);
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    font-weight: 600;
    letter-spacing: 0;
  }

  .job-match-panel ul {
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-2);
    list-style: none;
  }

  .job-match-panel li {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    line-height: 1.35;
  }

  .job-match-panel li span {
    width: 5px;
    height: 5px;
    flex: none;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    transform: translateY(-2px);
  }
</style>

{#if showReport}
  <Modal
    title="What looks wrong?"
    subtitle="Reports go to the pinkslip admin queue. They do not contact the employer."
    busy={reporting}
    onclose={() => (showReport = false)}
  >
    <div class="form-stack">
      <select class="input-field" bind:value={reportType}>
        <option value="expired_listing">Listing is closed</option>
        <option value="incorrect_details">Details are incorrect</option>
        <option value="duplicate_listing">Duplicate listing</option>
        <option value="broken_source">Company source is broken</option>
        <option value="other">Something else</option>
      </select>
      <textarea
        class="input-field textarea-field"
        rows="4"
        placeholder="Optional context"
        bind:value={reportNotes}
      ></textarea>
      <div class="action-row">
        <button class="btn-secondary" onclick={() => { showReport = false; }} disabled={reporting}>Cancel</button>
        <button class="btn-primary btn-accent flex-fill" onclick={submitReport} disabled={reporting}>
          {#if reporting}<Spinner />{/if}
          Send report
        </button>
      </div>
    </div>
  </Modal>
{/if}

{#if $sessionAccess.isAdmin && showBlockConfirm}
  <Modal
    title="Block this job?"
    busy={blocking}
    maxWidth={340}
    onclose={() => (showBlockConfirm = false)}
  >
    <p class="modal-copy">
      This will permanently remove <strong>{job?.title}</strong> from all users' feeds. It will never appear again, even in future polls.
      <br /><br />
      If you only want it gone from your own list, use <strong>Not interested</strong> instead.
    </p>
    <div class="stack-sm">
      <button
        class="btn-secondary full-width tall-control"
        onclick={() => { showBlockConfirm = false; handleDismiss(); }}
      >
        <X size={15} />
        Not interested
      </button>
      <button
        class="btn-secondary btn-danger full-width tall-control"
        disabled={blocking}
        onclick={handleBlock}
      >
        {#if blocking}<Spinner />{:else}<Trash size={15} />{/if}
        Block permanently
      </button>
      <button
        class="text-button"
        onclick={() => { showBlockConfirm = false; }}
      >
        Cancel
      </button>
    </div>
  </Modal>
{/if}
