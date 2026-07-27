<script lang="ts">
  import { onDestroy } from "svelte";
  import { fly } from "svelte/transition";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import { api, type Job } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { hapticLight } from "../lib/haptics";
  import { shareLink } from "../lib/share";
  import { feed } from "../lib/feed-store.svelte";
  import { sessionAccess } from "../lib/session-access";
  import { markViewed } from "../lib/viewed";
  import {
    extractPlainTextFromHtml,
    extractSalaryFromHtml,
    normalizeSalaryText,
    sanitizeJobDescriptionHtml,
  } from "../lib/job-content";
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
  let toastMsg: string | null = $state(null);
  let dismissing: boolean = $state(false);
  let saved: boolean = $state(false);
  let applied: boolean = $state(false);
  let applying: boolean = $state(false);
  let showBlockConfirm: boolean = $state(false);
  let showMore: boolean = $state(false);
  let blocking: boolean = $state(false);
  let descriptionPending: boolean = $state(false);
  let hidingCompany: boolean = $state(false);
  let showReport: boolean = $state(false);
  let reportType: string = $state("incorrect_details");
  let reportNotes: string = $state("");
  let reporting: boolean = $state(false);
  let reportSent: boolean = $state(false);
  let openedJobId: string | null = null;
  let descriptionRefreshTimer: number | null = null;
  let descriptionRefreshAttempts = 0;
  let toastTimer: number | null = null;

  const MAX_DESCRIPTION_REFRESH_ATTEMPTS = 5;

  function clearDescriptionRefreshTimer() {
    if (descriptionRefreshTimer !== null) {
      window.clearTimeout(descriptionRefreshTimer);
      descriptionRefreshTimer = null;
    }
  }

  function showToast(message: string) {
    toastMsg = message;
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastMsg = null;
      toastTimer = null;
    }, 2500);
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
    if (toastTimer !== null) window.clearTimeout(toastTimer);
  });

  async function markApplied() {
    if (!jobId || !job || applying || applied) return;
    applying = true;
    try {
      await api.jobs.markApplied(jobId);
      applied = true;
      removeFromFeedStore(jobId);
      showToast("Added to applied jobs ✓");
    } catch (e) {
      error = errorMessage(e);
    } finally {
      applying = false;
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
      error = errorMessage(e);
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
      error = errorMessage(e);
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
      error = errorMessage(e);
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
      error = errorMessage(e);
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
      reportSent = true;
      window.setTimeout(() => {
        showReport = false;
        reportSent = false;
        reportNotes = "";
      }, 1000);
    } catch (e) {
      error = errorMessage(e);
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
  let sanitizedDescription = $derived(job?.description ? sanitizeJobDescriptionHtml(job.description, {
    title: job.title,
    companyName: job.company_name,
  }) : "");
  let plainDescription = $derived.by(() => {
    return extractPlainTextFromHtml(job?.description);
  });

</script>

<svelte:window onkeydown={(event) => {
  if (event.key === "Escape") showMore = false;
}} />

<div class="page pushed-screen">
  <ScreenNav
    title={job?.title ?? "Job"}
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
      <button
        class="icon-btn"
        aria-label="More job actions"
        aria-haspopup="menu"
        aria-expanded={showMore}
        onclick={() => { showMore = !showMore; }}
      >
        <DotsThree size={22} weight="bold" color="var(--color-ink-3)" />
      </button>
      {#if showMore}
        <button class="job-more-scrim" aria-label="Close job actions" onclick={() => { showMore = false; }}></button>
        <div class="job-more-menu" role="menu" aria-label="More job actions">
          <button
            role="menuitem"
            disabled={hidingCompany}
            onclick={() => { showMore = false; void hideCompany(); }}
          >
            {#if hidingCompany}<Spinner size={16} />{:else}<EyeSlash size={17} />{/if}
            <span>Hide {job?.company_name ?? "company"}</span>
          </button>
          <button
            role="menuitem"
            onclick={() => { showMore = false; showReport = true; }}
          >
            <Flag size={17} />
            <span>Report listing</span>
          </button>
          {#if $sessionAccess.isAdmin}
            <button
              class="danger"
              role="menuitem"
              onclick={() => { showMore = false; showBlockConfirm = true; }}
            >
              <Trash size={17} />
              <span>Block for everyone</span>
            </button>
          {/if}
        </div>
      {/if}
      </div>
    {/snippet}
  </ScreenNav>

  {#if toastMsg}
    <div class="toast-wrap">
      <div class="toast-pill" in:fly={{ y: -14, duration: 160 }} out:fly={{ y: -10, duration: 120 }}>
        {toastMsg}
      </div>
    </div>
  {/if}

  <div class="screen-content job-detail-content">
    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else if error}
      <div class="alert alert-error">
        {error}
      </div>
    {:else if job}
      <!-- Company + Title header -->
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

      <!-- Metadata row -->
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

      <div class="job-state-actions">
          <button
            class="btn-secondary btn-action"
            disabled={applied || applying}
            onclick={markApplied}
          >
            {#if applying}<Spinner />{:else}<CheckCircle size={16} />{/if}
            {applied ? "Applied ✓" : "I applied"}
          </button>
          <button
            class="btn-secondary btn-action"
            onclick={handleDismiss}
            disabled={dismissing}
          >
            {#if dismissing}<Spinner />{:else}<X size={15} />{/if}
            Dismiss for me
          </button>
      </div>

      <!-- About the role -->
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
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn-secondary btn-mini" onclick={() => void loadJobDetail(true)}>
              Try again
            </button>
            {#if job.url}
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                class="btn-secondary btn-mini"
                style="text-decoration: none;"
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
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          class="btn-primary btn-accent btn-action"
          style="text-decoration: none;"
          onclick={() => {
            void api.interactions.event({
              event_name: "apply_clicked",
              entity_type: "job",
              entity_id: jobId ?? undefined,
              properties: {},
            }).catch(() => undefined);
          }}
        >
          <ArrowSquareOut size={18} weight="regular" />
          Apply
        </a>
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

{#if showReport}
  <Modal
    title="What looks wrong?"
    subtitle="Reports go to the pinkslip admin queue. They do not contact the employer."
    busy={reporting}
    onclose={() => (showReport = false)}
  >
    <select class="input-field" bind:value={reportType} style="margin-bottom: 10px;">
      <option value="expired_listing">Listing is closed</option>
      <option value="incorrect_details">Details are incorrect</option>
      <option value="duplicate_listing">Duplicate listing</option>
      <option value="broken_source">Company source is broken</option>
      <option value="other">Something else</option>
    </select>
    <textarea
      class="input-field"
      rows="4"
      placeholder="Optional context"
      bind:value={reportNotes}
      style="height: auto; resize: vertical; margin-bottom: 14px;"
    ></textarea>
    <div class="action-row">
      <button class="btn-secondary" onclick={() => { showReport = false; }} disabled={reporting}>Cancel</button>
      <button class="btn-primary btn-accent" style="flex: 1;" onclick={submitReport} disabled={reporting || reportSent}>
        {#if reporting}<Spinner />{/if}
        {reportSent ? "Reported" : "Send report"}
      </button>
    </div>
  </Modal>
{/if}

<!-- Block confirmation (admin) -->
{#if $sessionAccess.isAdmin && showBlockConfirm}
  <Modal
    title="Block this job?"
    busy={blocking}
    maxWidth={340}
    onclose={() => (showBlockConfirm = false)}
  >
    <p style="font-size: var(--fs-sm); color: var(--color-ink-2); line-height: 1.5; margin: 0 0 20px;">
      This will permanently remove <strong>{job?.title}</strong> from all users' feeds. It will never appear again, even in future polls.
      <br /><br />
      If you only want it gone from your own list, use <strong>Dismiss for me</strong> instead.
    </p>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <button
        class="btn-secondary"
        style="width: 100%; height: 48px;"
        onclick={() => { showBlockConfirm = false; handleDismiss(); }}
      >
        <X size={15} />
        Dismiss for me
      </button>
      <button
        class="btn-secondary btn-danger"
        style="width: 100%; height: 48px;"
        disabled={blocking}
        onclick={handleBlock}
      >
        {#if blocking}<Spinner />{:else}<Trash size={15} />{/if}
        Block permanently
      </button>
      <button
        style="appearance: none; border: 0; background: transparent; cursor: pointer; font-size: var(--fs-sm); color: var(--color-ink-3); padding: 8px 0;"
        onclick={() => { showBlockConfirm = false; }}
      >
        Cancel
      </button>
    </div>
  </Modal>
{/if}
