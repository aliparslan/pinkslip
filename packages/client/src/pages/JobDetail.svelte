<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import { api, type Job } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { shareLink } from "../lib/share";
  import { feed } from "../lib/feed-store.svelte";
  import { sessionAccess } from "../lib/session-access";
  import { markViewed } from "../lib/viewed";
  import { feedback } from "../lib/feedback.svelte";
  import { applicationIntent } from "../lib/application-intent.svelte";
  import { jobOriginalTimingLabel, jobTimingLabel } from "../lib/job-timing";
  import { presentPending } from "../lib/task-presentation.svelte";
  import { isIosApp, platform } from "../lib/platform";
  import { roleLabel } from "../../../../shared/search-profile";
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
  import ClockCounterClockwise from "phosphor-svelte/lib/ClockCounterClockwise";
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
  import PageFailure from "../components/PageFailure.svelte";

  let { jobId = null }: { jobId?: string | null } = $props();

  let job = $state<Job | null>(null);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let dismissing: boolean = $state(false);
  let saved: boolean = $state(false);
  let saving: boolean = $state(false);
  let applied: boolean = $state(false);
  let applying: boolean = $state(false);
  let applyingPending: boolean = $state(false);
  let openingApplication: boolean = $state(false);
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
  let interactionRevision = 0;
  let detailRequestGeneration = 0;

  const MAX_DESCRIPTION_REFRESH_ATTEMPTS = 5;
  const nativeIos = isIosApp();

  function clearDescriptionRefreshTimer() {
    if (descriptionRefreshTimer !== null) {
      window.clearTimeout(descriptionRefreshTimer);
      descriptionRefreshTimer = null;
    }
  }

  function removeFromFeedStore(id: string) {
    feed.jobs = feed.jobs.filter((item) => item.id !== id);
  }

  function restoreToFeedStore(nextJob: Job) {
    if (!feed.jobs.some((item) => item.id === nextJob.id)) {
      feed.jobs = [nextJob, ...feed.jobs];
    }
  }

  function syncJobState(nextJob: Job, preserveInteractions = false) {
    job = preserveInteractions
      ? { ...nextJob, saved: saved ? 1 : 0, applied: applied ? 1 : 0 }
      : nextJob;
    if (!preserveInteractions) {
      saved = Boolean(nextJob.saved);
      applied = Boolean(nextJob.applied);
    }
    descriptionPending = Boolean(nextJob?.content_pending && !nextJob?.description);
  }

  async function loadJobDetail(silent = false) {
    if (!jobId) return;
    const requestedJobId = jobId;
    const requestGeneration = ++detailRequestGeneration;
    const interactionRevisionAtRequest = interactionRevision;
    if (!silent) {
      loading = true;
      error = null;
    }

    try {
      const nextJob = await api.jobs.get(requestedJobId);
      if (requestGeneration !== detailRequestGeneration || jobId !== requestedJobId) return;
      syncJobState(nextJob, interactionRevisionAtRequest !== interactionRevision);
      if (openedJobId !== requestedJobId) {
        openedJobId = requestedJobId;
        markViewed(requestedJobId);
        void api.interactions.event({
          event_name: "job_opened",
          entity_type: "job",
          entity_id: requestedJobId,
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
      if (requestGeneration !== detailRequestGeneration || jobId !== requestedJobId) return;
      if (!silent || !job) {
        error = errorMessage(e);
      }
    } finally {
      if (requestGeneration === detailRequestGeneration && jobId === requestedJobId) {
        loading = false;
      }
    }
  }

  $effect(() => {
    if (!jobId) return;
    detailRequestGeneration += 1;
    job = null;
    saved = false;
    applied = false;
    error = null;
    loading = true;
    descriptionRefreshAttempts = 0;
    clearDescriptionRefreshTimer();
    untrack(() => { void loadJobDetail(); });

    return () => {
      clearDescriptionRefreshTimer();
    };
  });

  onDestroy(() => {
    clearDescriptionRefreshTimer();
  });

  async function markApplied() {
    if (!jobId || !job || applying || (!nativeIos && applied)) return;
    interactionRevision += 1;
    applying = true;
    try {
      if (nativeIos && applied) {
        const restored = await presentPending(
          () => api.jobs.unmarkApplied(jobId),
          (pending) => { applyingPending = pending; },
        );
        applied = false;
        job = restored;
        restoreToFeedStore(restored);
        feedback.success("Removed from applied jobs");
        return;
      }
      await presentPending(
        () => api.jobs.markApplied(jobId),
        (pending) => { applyingPending = pending; },
      );
      applied = true;
      job = { ...job, applied: 1 };
      removeFromFeedStore(jobId);
      feedback.success("Added to applied jobs");
    } catch (e) {
      feedback.error(errorMessage(e, "Could not mark this job as applied."));
    } finally {
      applying = false;
      applyingPending = false;
      interactionRevision += 1;
    }
  }

  async function openApplication() {
    if (!job?.url || openingApplication) return;
    openingApplication = true;
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
    } finally {
      openingApplication = false;
    }
  }

  async function handleDismiss() {
    if (!jobId || !job) return;
    const dismissedJob = job;
    dismissing = true;
    try {
      await api.jobs.dismiss(jobId);
      removeFromFeedStore(jobId);
      navigate("/");
      if (nativeIos) {
        feedback.show({
          message: "Job hidden from your feed",
          action: {
            label: "Undo",
            run: async () => {
              const restored = await api.jobs.undismiss(dismissedJob.id);
              restoreToFeedStore(restored);
            },
          },
        });
      }
    } catch (e) {
      feedback.error(errorMessage(e, "Could not dismiss this job."));
      dismissing = false;
    }
  }

  function shareJob() {
    if (!job) return;
    void shareLink({
      title: `${job.title} · ${job.company_name}`,
      text: `${job.title} at ${job.company_name}`,
      url: job.url || window.location.href,
    });
  }

  async function toggleSave() {
    if (!jobId || saving) return;
    interactionRevision += 1;
    const newVal = !saved;
    saving = true;
    saved = newVal;
    if (job) job = { ...job, saved: newVal ? 1 : 0 };
    feed.jobs = feed.jobs.map((item) =>
      item.id === jobId ? { ...item, saved: newVal ? 1 : 0 } : item
    );
    try {
      if (newVal) {
        await api.savedJobs.save(jobId);
      } else {
        await api.savedJobs.unsave(jobId);
      }
    } catch (e) {
      saved = !newVal;
      if (job) job = { ...job, saved: newVal ? 0 : 1 };
      feed.jobs = feed.jobs.map((item) =>
        item.id === jobId ? { ...item, saved: newVal ? 0 : 1 } : item
      );
      feedback.error(errorMessage(e, "Could not update your saved jobs."));
    } finally {
      saving = false;
      interactionRevision += 1;
    }
  }

  async function openNativeJobMenu(event: MouseEvent) {
    const source = event.currentTarget as HTMLButtonElement;
    const rect = source.getBoundingClientRect();
    const action = await platform().actionMenu.present({
      source: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      actions: [
        {
          id: "save",
          title: saved ? "Remove from saved jobs" : "Save job",
          symbol: saved ? "bookmark.fill" : "bookmark",
          disabled: saving,
        },
        { id: "share", title: "Share job", symbol: "square.and.arrow.up" },
        {
          id: "hide-company",
          title: `Hide ${job?.company_name ?? "company"}`,
          symbol: "eye.slash",
          disabled: hidingCompany,
        },
        { id: "report", title: "Report listing", symbol: "exclamationmark.bubble" },
        ...($sessionAccess.isAdmin ? [{
          id: "remove",
          title: "Remove for everyone",
          symbol: "trash",
          destructive: true,
        }] : []),
      ],
    }).catch(() => null);
    if (action === "save") void toggleSave();
    else if (action === "share") shareJob();
    else if (action === "hide-company") void hideCompany();
    else if (action === "report") showReport = true;
    else if (action === "remove") showBlockConfirm = true;
  }

  async function handleBlock() {
    if (!jobId || blocking) return;
    blocking = true;
    try {
      await api.jobs.block(jobId);
      removeFromFeedStore(jobId);
      navigate("/");
    } catch (e) {
      feedback.error(errorMessage(e, nativeIos ? "Could not remove this job." : "Could not block this job."));
      blocking = false;
    }
  }

  async function hideCompany() {
    if (!job?.company_id || hidingCompany) return;
    const companyId = job.company_id;
    const previousJobs = [...feed.jobs];
    hidingCompany = true;
    try {
      await api.companies.block(companyId);
      feed.jobs = feed.jobs.filter((item) => item.company_id !== job?.company_id);
      navigate("/");
      if (nativeIos) {
        feedback.show({
          message: `${job.company_name} hidden`,
          action: {
            label: "Undo",
            run: async () => {
              await api.companies.restore(companyId);
              feed.jobs = previousJobs;
            },
          },
        });
      }
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

  let extractedSalary = $derived(job?.description ? extractSalaryFromHtml(job.description) : null);
  let displaySalary = $derived(normalizeSalaryText(
    job?.salary?.trim() ? job.salary : extractedSalary
  ));
  let originalTiming = $derived(job ? jobOriginalTimingLabel(job) : null);
  let quickFacts = $derived.by(() => {
    if (!job) return [];
    const details: string[] = [];
    if (nativeIos) {
      if (job.sponsorship_available === true) details.push("Sponsorship available");
      if (!displaySalary) details.push("Salary not listed");
      return details;
    }
    if (job.match_fact) details.push(job.match_fact);
    const specialty = job.specialties?.[0];
    if (specialty) details.push(`${roleLabel(specialty)} role`);
    if (job.sponsorship_available === true) details.push("Sponsorship available");
    if (!displaySalary) details.push("Salary not listed");
    if (job.evergreen) details.push("Evergreen listing");
    if (!job.posted_at) details.push("Post date unavailable");
    return [...new Set(details)].slice(0, 4);
  });
  let sanitizedDescription = $derived(job?.description ? sanitizeJobDescriptionHtml(job.description, {
    title: job.title,
    companyName: job.company_name,
  }) : "");
  let plainDescription = $derived.by(() => {
    return extractPlainTextFromHtml(job?.description);
  });

</script>

{#snippet originalPostingLink(url: string, buttonStyle: boolean)}
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    class={buttonStyle
      ? nativeIos ? "btn-secondary btn-mini button-link job-description-link" : "btn-secondary btn-mini button-link"
      : "text-link job-description-link"}
  >
    {#if nativeIos}
      <ArrowSquareOut size={16} weight="bold" aria-hidden="true" />
      Open original posting
    {:else}
      {buttonStyle ? "Open original" : "Read full description"}
      {#if !buttonStyle}<ArrowSquareOut size={13} aria-hidden="true" />{/if}
    {/if}
  </a>
{/snippet}

<div class="page pushed-screen job-detail-page" class:native-layout={nativeIos}>
  <ScreenNav
    title={nativeIos ? job?.title ?? "" : ""}
    collapsible={nativeIos}
    backLabel="Back to jobs"
    onBack={() => { if (!requestBack()) navigate("/"); }}
  >
    {#snippet trailing()}
      <div class="job-header-actions">
        {#if !nativeIos}
          <button class="icon-btn" aria-label="Share job" onclick={shareJob}>
            <Export size={19} color="var(--color-ink-3)" />
          </button>
          <button
            class="icon-btn"
            aria-label={saved ? "Remove from saved jobs" : "Save job"}
            aria-pressed={saved}
            disabled={saving}
            onclick={toggleSave}
          >
            <span class="state-icon" aria-hidden="true">
              <span class:visible={!saved}><BookmarkSimple size={20} weight="regular" color="var(--color-ink-2)" /></span>
              <span class:visible={saved}><BookmarkSimple size={20} weight="fill" color="var(--color-accent)" /></span>
            </span>
          </button>
        {/if}
        {#if nativeIos}
          <button class="icon-btn" aria-label="More job actions" onclick={openNativeJobMenu}>
            <DotsThree size={22} weight="bold" color="var(--color-ink-2)" />
          </button>
        {:else}
          <DropdownMenu.Root bind:open={showMore}>
            <DropdownMenu.Trigger class="icon-btn" aria-label="More job actions">
              <DotsThree size={22} weight="bold" color="var(--color-ink-3)" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                class="menu-surface job-more-menu"
                side="bottom"
                align="end"
                sideOffset={6}
                collisionPadding={12}
                strategy="fixed"
                preventScroll={false}
              >
                <DropdownMenu.Item
                  class="menu-item"
                  disabled={hidingCompany}
                  onSelect={() => void hideCompany()}
                >
                  {#if hidingCompany}<Spinner size={16} />{:else}<EyeSlash size={17} />{/if}
                  <span>Hide {job?.company_name ?? "company"}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item class="menu-item" onSelect={() => { showReport = true; }}>
                  <Flag size={17} />
                  <span>Report listing</span>
                </DropdownMenu.Item>
                {#if $sessionAccess.isAdmin}
                  <DropdownMenu.Item class="menu-item danger" onSelect={() => { showBlockConfirm = true; }}>
                    <Trash size={17} />
                    <span>Block for everyone</span>
                  </DropdownMenu.Item>
                {/if}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        {/if}
      </div>
    {/snippet}
  </ScreenNav>

  <div class="screen-content job-detail-content">
    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else if error}
      {#if nativeIos}
        <PageFailure
          title="This job didn’t load"
          message={error.toLowerCase().includes("not found")
            ? "The listing may have been removed."
            : "Check your connection and try again."}
          onRetry={() => void loadJobDetail()}
        />
      {:else}
        <div class="job-detail-error" role="alert">
          <h1 class="h-display h-display-sm">This job didn&rsquo;t load</h1>
          <p>{error.toLowerCase().includes("not found") ? "The listing may have been removed since the alert was sent." : "Check your connection and try once more."}</p>
          <div class="button-cluster">
            <button class="btn-primary btn-accent" onclick={() => void loadJobDetail()}>Try again</button>
            <button class="btn-secondary" onclick={() => { if (!requestBack()) navigate("/"); }}>Back to jobs</button>
          </div>
        </div>
      {/if}
    {:else if job}
      <div class="job-detail-identity">
        <CompanyLogo name={job.company_name ?? "?"} domain={job.company_domain} size={52} />
        <div class="job-detail-heading">
          <div class="job-detail-company-line">
            <div class="section-label truncate">
              {job.company_name} · {jobTimingLabel(job)}
            </div>
            {#if job.closed_at}
              <div class="tag">closed</div>
            {/if}
          </div>
          <h1 class="h-display h-display-md job-detail-title" data-screen-title-anchor>
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
        {#if originalTiming}
          <div class="job-meta-item">
            <ClockCounterClockwise size={15} />
            <span>{originalTiming}</span>
          </div>
        {/if}
      </div>

      {#if quickFacts.length}
        <section class="job-match-panel" aria-labelledby="quick-facts-heading">
          <h2 id="quick-facts-heading">Quick facts</h2>
          <ul>
            {#each quickFacts as fact}
              <li><span aria-hidden="true"></span>{fact}</li>
            {/each}
          </ul>
        </section>
      {/if}

      <div class="job-state-actions">
          <button
            class="btn-secondary btn-action"
            class:completed={applied}
            disabled={applying || (!nativeIos && applied)}
            aria-pressed={nativeIos ? applied : undefined}
            onclick={markApplied}
          >
            {#if applyingPending}
              <Spinner />
            {:else}
              <span class="state-icon" aria-hidden="true">
                <span class:visible={!applied}><CheckCircle size={16} /></span>
                <span class:visible={applied}><CheckCircle size={16} weight="fill" /></span>
              </span>
            {/if}
            <span class="applied-label">
              <span class:visible={!applied} aria-hidden={applied}>I applied</span>
              <span class:visible={applied} aria-hidden={!applied}>Applied</span>
            </span>
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
            {@render originalPostingLink(job.url, false)}
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
            {@render originalPostingLink(job.url, false)}
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
              {@render originalPostingLink(job.url, true)}
            {/if}
          </div>
        </div>
      {/if}

    {/if}
  </div>
</div>

{#if !loading && !error && job}
  <div class="job-action-bar-wrap" data-nav-snapshot="exclude">
    <div class="job-action-bar">
      {#if job.url}
        <button
          type="button"
          class="btn-primary btn-accent btn-action button-link"
          onclick={openApplication}
          disabled={openingApplication}
        >
          {#if openingApplication}<Spinner />{:else}<ArrowSquareOut size={18} weight="regular" />{/if}
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

  .job-detail-title {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.12;
  }

  .native-layout .job-detail-title {
    font-family: var(--font-display);
    font-size: var(--fs-2xl);
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.12;
  }

  .native-layout .job-description-heading {
    margin-bottom: var(--space-4);
    color: var(--color-ink);
    font-size: var(--fs-xl);
    font-weight: 600;
    letter-spacing: -0.015em;
    line-height: 1.2;
    text-wrap: balance;
  }

  .native-layout .job-description-section {
    padding-bottom: var(--space-2);
  }

  .native-layout .job-detail-content {
    padding-bottom: calc(88px + var(--safe-bottom));
  }

  .native-layout .job-description-link {
    margin-top: var(--space-4);
    gap: var(--space-2);
    font-weight: 600;
  }

  :global(.job-detail-save-menu-item.saved) {
    color: var(--color-accent-soft-ink);
  }

  .state-icon,
  .applied-label {
    display: grid;
    place-items: center;
  }

  .state-icon > span,
  .applied-label > span {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    opacity: 0;
    transform: scale(0.72);
    transition:
      opacity var(--duration-instant) var(--ease-standard),
      transform var(--duration-instant) var(--ease-standard);
  }

  .applied-label > span {
    transform: translateY(3px);
  }

  .state-icon > span.visible,
  .applied-label > span.visible {
    opacity: 1;
    transform: none;
  }

  .btn-secondary.completed:disabled,
  .btn-secondary.completed:disabled:hover {
    opacity: 1;
    border-color: color-mix(in oklch, var(--color-accent) 46%, var(--color-line));
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-ink);
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
      {#if nativeIos}<label for="job-report-type">Reason</label>{/if}
      <select id="job-report-type" class="input-field" aria-label={nativeIos ? undefined : "Reason"} bind:value={reportType}>
        <option value="expired_listing">Listing is closed</option>
        <option value="incorrect_details">Details are incorrect</option>
        <option value="duplicate_listing">Duplicate listing</option>
        <option value="broken_source">Company source is broken</option>
        <option value="other">Something else</option>
      </select>
      {#if nativeIos}<label for="job-report-notes">Details <span class="field-optional">optional</span></label>{/if}
      <textarea
        id="job-report-notes"
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
    title={nativeIos ? "Remove this job?" : "Block this job?"}
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
        {nativeIos ? "Remove permanently" : "Block permanently"}
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
