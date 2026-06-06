<script lang="ts">
  import { onDestroy } from "svelte";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import { api } from "../lib/api";
  import { hapticLight } from "../lib/haptics";
  import { shareLink } from "../lib/share";
  import { getAdjacentJobIds } from "../lib/feed-navigation";
  import {
    extractPlainTextFromHtml,
    extractSalaryFromHtml,
    sanitizeJobDescriptionHtml,
  } from "../lib/job-content";
  import {
    normalizeJobScore,
    scoreLabelFromPercent,
    scoreToneFromPercent,
  } from "../lib/scoring";
  import CompanyLogo from "../components/CompanyLogo.svelte";
  import ArrowLeft from "phosphor-svelte/lib/ArrowLeft";
  import ArrowRight from "phosphor-svelte/lib/ArrowRight";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import MapPin from "phosphor-svelte/lib/MapPin";
  import Money from "phosphor-svelte/lib/Money";
  import CalendarBlank from "phosphor-svelte/lib/CalendarBlank";
  import ClockCounterClockwise from "phosphor-svelte/lib/ClockCounterClockwise";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import ShareNetwork from "phosphor-svelte/lib/ShareNetwork";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
  import X from "phosphor-svelte/lib/X";
  import Trash from "phosphor-svelte/lib/Trash";
  import Warning from "phosphor-svelte/lib/Warning";
  import MagicWand from "phosphor-svelte/lib/MagicWand";

  let { jobId }: { jobId: string | null } = $props();

  let job: any = $state(null);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let dismissing: boolean = $state(false);
  let saved: boolean = $state(false);
  let applied: boolean = $state(false);
  let applying: boolean = $state(false);
  let scoreExpanded: boolean = $state(false);
  let showBlockConfirm: boolean = $state(false);
  let blocking: boolean = $state(false);
  let descriptionPending: boolean = $state(false);
  let descriptionRefreshTimer: number | null = $state(null);
  let descriptionRefreshAttempts: number = $state(0);

  const MAX_DESCRIPTION_REFRESH_ATTEMPTS = 5;

  function clearDescriptionRefreshTimer() {
    if (descriptionRefreshTimer !== null) {
      window.clearTimeout(descriptionRefreshTimer);
      descriptionRefreshTimer = null;
    }
  }

  function syncJobState(nextJob: any) {
    job = nextJob;
    saved = Boolean(nextJob?.saved);
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

      if (descriptionPending && descriptionRefreshAttempts < MAX_DESCRIPTION_REFRESH_ATTEMPTS) {
        clearDescriptionRefreshTimer();
        descriptionRefreshTimer = window.setTimeout(async () => {
          descriptionRefreshAttempts += 1;
          await loadJobDetail(true);
        }, nextJob.content_refresh_after_ms ?? 1500);
      } else if (!descriptionPending) {
        clearDescriptionRefreshTimer();
      }
    } catch (e: any) {
      if (!silent || !job) {
        error = e.message;
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

  async function handleDismiss() {
    if (!jobId) return;
    dismissing = true;
    try {
      await api.jobs.dismiss(jobId);
      navigate("/");
    } catch (e: any) {
      error = e.message;
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
    } catch (e: any) {
      saved = !newVal;
      error = e.message;
    }
  }

  async function handleBlock() {
    if (!jobId || blocking) return;
    blocking = true;
    try {
      await api.jobs.block(jobId);
      navigate("/");
    } catch (e: any) {
      error = e.message;
      blocking = false;
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  let scoreRaw = $derived(job?.score ?? 0);
  let scorePercent = $derived(normalizeJobScore(scoreRaw));
  let scoreLabel = $derived(scoreLabelFromPercent(scorePercent));
  let scoreColor = $derived(scoreToneFromPercent(scorePercent));
  let adjacentJobs = $derived(getAdjacentJobIds(jobId));

  const scoreBreakdownKeys = [
    { label: "Title", key: "title_score", max: 30 },
    { label: "YOE", key: "yoe_score", max: 25 },
    { label: "Location", key: "location_score", max: 20 },
    { label: "Department", key: "department_score", max: 10 },
    { label: "Recency", key: "recency_score", max: 10 },
  ];

  let extractedSalary = $derived(job?.description ? extractSalaryFromHtml(job.description) : null);
  let displaySalary = $derived(job?.salary ?? extractedSalary);
  let sanitizedDescription = $derived(job?.description ? sanitizeJobDescriptionHtml(job.description) : "");
  let plainDescription = $derived.by(() => {
    return extractPlainTextFromHtml(job?.description);
  });

  function navigateToAdjacent(id: string | null) {
    if (!id) return;
    navigate(`/jobs/${id}`);
  }
</script>

<div class="page" style="padding-top: 0;">
  <!-- Header -->
  <header class="page-replacement-header">
    <button class="icon-btn" aria-label="Back" onclick={() => { if (!requestBack()) navigate("/"); }}>
      <ArrowLeft size={18} />
    </button>
    {#if job?.closed_at}
      <div class="tag" style="height: 22px;">closed</div>
    {/if}
    <div style="display: flex; gap: 2px;">
      {#if job?.url}
        <a
          class="icon-btn"
          aria-label="Open original posting"
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ArrowSquareOut size={18} color="var(--color-ink-3)" />
        </a>
      {/if}
      <button class="icon-btn" aria-label="Share job" onclick={shareJob}>
        <ShareNetwork size={18} color="var(--color-ink-3)" />
      </button>
      <button class="icon-btn" aria-label="Block job" onclick={() => { showBlockConfirm = true; }}>
        <Trash size={18} color="var(--color-ink-3)" />
      </button>
      <button class="icon-btn" aria-label="Save" onclick={toggleSave}>
        <BookmarkSimple size={20} weight={saved ? "fill" : "regular"} color={saved ? "var(--color-accent)" : "var(--color-ink-2)"} />
      </button>
    </div>
  </header>

  <div style="padding: 18px 20px 112px;">
    {#if loading}
      <div style="text-align: center; padding: 48px 0; color: var(--color-ink-3); font-size: 12px;">
        Loading...
      </div>
    {:else if error}
      <div style="padding: 16px 18px; border-radius: var(--radius-md); background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 14px;">
        {error}
      </div>
    {:else if job}
      <!-- Company + Title header -->
      <div style="display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px;">
        <CompanyLogo name={job.company_name ?? "?"} domain={job.company_domain} size={52} />
        <div style="flex: 1; min-width: 0;">
          <div class="section-label" style="margin-bottom: 4px;">
            {job.company_name}{#if job.department} {" · "}{job.department}{/if}
          </div>
          <h1 class="h-display" style="font-size: 24px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; margin-top: 0;">
            {job.title}
          </h1>
        </div>
      </div>

      <!-- Metadata row -->
      <div class="job-meta-strip" style="margin-bottom: 16px;">
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
        {#if job.posted_at}
          <div class="job-meta-item">
            <CalendarBlank size={15} />
            <span>posted {formatDate(job.posted_at)}</span>
          </div>
        {/if}
        {#if job.first_seen_at}
          <div class="job-meta-item">
            <ClockCounterClockwise size={15} />
            <span>seen {formatDate(job.first_seen_at)}</span>
          </div>
        {/if}
      </div>

      <div style="height: 0.5px; background: var(--color-line); margin-bottom: 16px;"></div>

      <!-- Match score -->
      <div class="surface-card-padded" style="margin-bottom: 16px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px;">
          <div>
            <div class="section-label">
              Match score
            </div>
            <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 2px;">
              <span style="font-family: var(--font-display); font-weight: 700; font-size: 36px; color: {scoreColor}; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;">
                {scorePercent}
              </span>
              <span style="font-size: 14px; font-weight: 600; color: var(--color-ink);">
                {scoreLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onclick={() => scoreExpanded = !scoreExpanded}
            class="btn-secondary"
            style="height: 32px; padding: 0 10px; font-size: 12px;"
          >
            why?
            <CaretDown size={12} style="transition: transform .2s; transform: rotate({scoreExpanded ? '180deg' : '0'});" />
          </button>
        </div>

        {#if scoreExpanded}
          <div style="display: flex; flex-direction: column;">
            {#each scoreBreakdownKeys as { label, key, max }}
              <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 7px 0; border-top: 0.5px solid var(--color-line);">
                <span style="font-size: 13px; color: var(--color-ink); font-weight: 500;">{label}</span>
                <div style="width: 80px; height: 4px; background: var(--color-line-2); border-radius: 999px; overflow: hidden;">
                  <div style="height: 100%; background: {(job[key] ?? 0) === max ? 'var(--color-good)' : 'var(--color-accent)'}; width: {((job[key] ?? 0) / max) * 100}%; border-radius: 999px;"></div>
                </div>
                <span style="font-family: var(--font-mono); font-size: 12px; color: var(--color-ink-3); font-variant-numeric: tabular-nums; min-width: 40px; text-align: right;">
                  {job[key] ?? 0}/{max}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button
            class="btn-secondary btn-action"
            disabled={applied || applying}
            onclick={async () => {
              if (!jobId || !job) return;
              applying = true;
              try {
                await api.applications.create({
                  job_id: jobId,
                  company_name: job.company_name,
                  title: job.title,
                  url: job.url ?? "",
                });
                applied = true;
                await api.jobs.dismiss(jobId);
                navigate("/");
              } catch (e: any) {
                error = e.message;
                applying = false;
              }
            }}
          >
            <CheckCircle size={16} />
            {applied ? "Tracked" : applying ? "..." : "Mark as applied"}
          </button>
          <button
            class="btn-secondary btn-action"
            onclick={handleDismiss}
            disabled={dismissing}
          >
            <X size={15} />
            {dismissing ? "..." : "Dismiss for me"}
          </button>
        </div>
      </div>

      <div style="height: 0.5px; background: var(--color-line);"></div>

      <!-- About the role -->
      {#if descriptionPending}
        <div style="padding: 16px 0 24px;">
          <div class="section-title" style="margin-bottom: 8px;">
            About the role
          </div>
          <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.55; color: var(--color-ink-2);">
            Pulling the full posting now. This usually lands in a second or two.
          </p>
          <button class="btn-secondary btn-mini" onclick={() => { descriptionRefreshAttempts = 0; void loadJobDetail(true); }}>
            Check again
          </button>
        </div>
      {:else if sanitizedDescription}
        <div style="padding: 16px 0 24px;">
          <div class="section-title" style="margin-bottom: 10px;">
            About the role
          </div>
          <div class="job-description">
            {@html sanitizedDescription}
          </div>
          {#if job.url}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              style="display: inline-flex; align-items: center; gap: 5px; margin-top: 10px; border: none; background: transparent; color: var(--color-accent); cursor: pointer; padding: 0; font-size: 13px; font-weight: 600; text-decoration: none;"
            >
              Read full description
              <ArrowSquareOut size={13} />
            </a>
          {/if}
        </div>
      {:else if plainDescription}
        <div style="padding: 16px 0 24px;">
          <div class="section-title" style="margin-bottom: 8px;">
            About the role
          </div>
          <p style="margin: 0; font-size: 14px; line-height: 1.55; color: var(--color-ink-2);">
            {plainDescription}
          </p>
          {#if job.url}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              style="display: inline-flex; align-items: center; gap: 5px; margin-top: 10px; border: none; background: transparent; color: var(--color-accent); cursor: pointer; padding: 0; font-size: 13px; font-weight: 600; text-decoration: none;"
            >
              Read full description
              <ArrowSquareOut size={13} />
            </a>
          {/if}
        </div>
      {:else}
        <div style="padding: 16px 0 24px;">
          <div class="section-title" style="margin-bottom: 8px;">
            About the role
          </div>
          <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.55; color: var(--color-ink-2);">
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
      <button
        class="icon-btn icon-btn-surface job-step-btn"
        aria-label="Previous job"
        disabled={!adjacentJobs.previousId}
        onclick={() => navigateToAdjacent(adjacentJobs.previousId)}
      >
        <ArrowLeft size={18} />
      </button>
      {#if job.url}
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          class="btn-primary btn-accent btn-action"
          style="text-decoration: none;"
        >
          Apply
          <ArrowSquareOut size={18} weight="regular" />
        </a>
      {:else}
        <button class="btn-primary btn-accent btn-action" disabled>
          Apply
          <ArrowSquareOut size={18} weight="regular" />
        </button>
      {/if}
      <button
        class="btn-secondary btn-action"
        onclick={() => jobId && navigate(`/tailor/${jobId}`)}
      >
        Tailor
        <MagicWand size={16} />
      </button>
      <button
        class="icon-btn icon-btn-surface job-step-btn"
        aria-label="Next job"
        disabled={!adjacentJobs.nextId}
        onclick={() => navigateToAdjacent(adjacentJobs.nextId)}
      >
        <ArrowRight size={18} />
      </button>
    </div>
  </div>
{/if}

<!-- Block confirmation modal -->
{#if showBlockConfirm}
  <div
    style="position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
    role="presentation"
    onclick={() => { showBlockConfirm = false; }}
    onkeydown={(e) => { if (e.key === 'Escape') showBlockConfirm = false; }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-title"
      tabindex="-1"
      style="width: 100%; max-width: 340px; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 18px; padding: 24px; animation: fade-in 0.15s;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') showBlockConfirm = false; }}
    >
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); display: flex; align-items: center; justify-content: center;">
          <Warning size={18} color="var(--color-bad)" />
        </div>
        <div id="block-title" style="font-size: 17px; font-weight: 600;">Block this job?</div>
      </div>
      <p style="font-size: 13px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 20px;">
        This will permanently remove <strong>{job?.title}</strong> from all users' feeds. It will never appear again, even in future polls.
        <br /><br />
        If you only want it gone from your own list, use <strong>Dismiss just for me</strong> instead.
      </p>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button
          class="btn-secondary"
          style="width: 100%; height: 48px;"
          onclick={() => { showBlockConfirm = false; handleDismiss(); }}
        >
          <X size={15} />
          Dismiss just for me
        </button>
        <button
          class="btn-secondary btn-danger"
          style="width: 100%; height: 48px;"
          disabled={blocking}
          onclick={handleBlock}
        >
          <Trash size={15} />
          {blocking ? "..." : "Block permanently"}
        </button>
        <button
          style="appearance: none; border: 0; background: transparent; cursor: pointer; font-size: 13px; color: var(--color-ink-3); padding: 8px 0;"
          onclick={() => { showBlockConfirm = false; }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
