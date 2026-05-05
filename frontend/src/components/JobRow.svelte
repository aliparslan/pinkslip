<script lang="ts">
  import { navigate } from "../router";
  import { api, type Job } from "../lib/api";
  import { extractSalaryFromHtml } from "../lib/job-content";
  import { normalizeJobScore, scoreToneFromPercent } from "../lib/scoring";
  import { timeAgo } from "../lib/utils";
  import { markViewed } from "../lib/viewed";
  import CompanyLogo from "./CompanyLogo.svelte";

  let { job, viewed = false, onDismiss }: {
    job: Job;
    viewed?: boolean;
    onDismiss?: (id: string) => void;
  } = $props();

  let dismissing: boolean = $state(false);
  let swipeX: number = $state(0);
  let swiping: boolean = $state(false);
  let startX: number = 0;
  let startY: number = 0;
  let locked: boolean = false;
  let rowEl: HTMLDivElement | undefined = $state(undefined);

  const DELETE_THRESHOLD = 80;
  const DISMISS_THRESHOLD = 160;

  let scorePercent = $derived(normalizeJobScore(job.score));
  let scoreColor = $derived(scoreToneFromPercent(scorePercent));
  let displaySalary = $derived(job.salary ?? extractSalaryFromHtml(job.description));

  // Reveal state based on swipe distance
  let revealState = $derived.by(() => {
    const x = Math.abs(swipeX);
    if (x >= DISMISS_THRESHOLD) return "dismiss";
    if (x >= DELETE_THRESHOLD) return "delete";
    return "none";
  });

  function handleClick() {
    if (Math.abs(swipeX) > 4) return;
    markViewed(job.id);
    navigate(`/jobs/${job.id}`);
  }

  async function dismiss() {
    if (dismissing) return;
    dismissing = true;
    try {
      await api.jobs.dismiss(job.id);
      onDismiss?.(job.id);
    } catch {
      dismissing = false;
      swipeX = 0;
    }
  }

  async function blockJob() {
    if (dismissing) return;
    dismissing = true;
    try {
      await api.jobs.block(job.id);
      onDismiss?.(job.id);
    } catch {
      dismissing = false;
      swipeX = 0;
    }
  }

  function onTouchStart(e: TouchEvent) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    locked = false;
    swiping = false;
  }

  function onTouchMove(e: TouchEvent) {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!locked && !swiping) {
      // If vertical motion dominates, lock out swiping
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        locked = true;
        return;
      }
      if (Math.abs(dx) > 8) {
        swiping = true;
      }
    }

    if (locked || !swiping) return;

    // Only allow swipe left (negative), with dampening past threshold
    const raw = Math.min(0, dx);
    const abs = Math.abs(raw);
    if (abs > DISMISS_THRESHOLD) {
      swipeX = -(DISMISS_THRESHOLD + (abs - DISMISS_THRESHOLD) * 0.3);
    } else {
      swipeX = raw;
    }
    e.preventDefault();
  }

  function onTouchEnd() {
    if (!swiping) return;
    const x = Math.abs(swipeX);

    if (x >= DISMISS_THRESHOLD) {
      swipeX = -(rowEl?.offsetWidth ?? 320);
      dismiss();
    } else if (x >= DELETE_THRESHOLD) {
      swipeX = -(rowEl?.offsetWidth ?? 320);
      blockJob();
    } else {
      swipeX = 0;
    }
    swiping = false;
  }
</script>

<div style="position: relative; overflow: hidden; border-bottom: 0.5px solid var(--color-line);">
  <!-- Swipe action background — only visible during swipe -->
  {#if swipeX !== 0}
    <div style="position: absolute; inset: 0; display: flex; align-items: stretch;">
      <div style="flex: 1; background: var(--color-bg);"></div>
      <div style="width: {DELETE_THRESHOLD}px; display: flex; align-items: center; justify-content: center; background: {revealState === 'dismiss' ? 'color-mix(in oklch, var(--color-bad) 20%, var(--color-bg))' : 'color-mix(in oklch, var(--color-warn) 16%, var(--color-bg))'}; transition: background 0.15s;">
        <span style="font-family: var(--font-mono); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-warn);">
          block
        </span>
      </div>
      <div style="width: {DISMISS_THRESHOLD - DELETE_THRESHOLD}px; display: flex; align-items: center; justify-content: center; background: color-mix(in oklch, var(--color-bad) 14%, var(--color-bg));">
        <span style="font-family: var(--font-mono); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-bad);">
          dismiss
        </span>
      </div>
    </div>
  {/if}

  <!-- Row content -->
  <div
    bind:this={rowEl}
    role="button"
    tabindex="0"
    style="display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: center; cursor: pointer; padding: 10px 16px; position: relative; background: var(--color-bg); overflow: hidden; transform: translateX({swipeX}px); transition: {swiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.15s'}; {viewed ? 'opacity: 0.5;' : ''} {dismissing ? 'opacity: 0; pointer-events: none;' : ''}"
    onclick={handleClick}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
    ontouchstart={onTouchStart}
    ontouchmove={onTouchMove}
    ontouchend={onTouchEnd}
  >
    <CompanyLogo name={job.company_name ?? "?"} domain={job.company_domain} size={24} />
    <div style="min-width: 0; overflow: hidden;">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--color-ink-3); font-family: var(--font-mono); margin-bottom: 1px;">
        <span style="font-weight: 600; color: var(--color-ink); flex-shrink: 0;">{job.company_name}</span>
        <span style="opacity: 0.4;">·</span>
        <span style="flex-shrink: 0;">{timeAgo(job.posted_at ?? job.first_seen_at ?? "")}</span>
        {#if !viewed}
          <span style="color: var(--color-accent); font-weight: 700; letter-spacing: 0.04em; flex-shrink: 0;">NEW</span>
        {/if}
        <span style="flex: 1;"></span>
        <span style="background: color-mix(in oklch, {scoreColor} 12%, var(--color-bg)); color: {scoreColor}; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; flex-shrink: 0;">
          {scorePercent}
        </span>
      </div>
      <div style="font-size: 15px; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        {job.title}
      </div>
      {#if job.location || displaySalary}
        <div style="font-size: 12px; color: var(--color-ink-3); display: flex; align-items: center; gap: 6px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          {#if job.location}
            <span>{job.location}</span>
          {/if}
          {#if job.location && displaySalary}
            <span style="opacity: 0.4;">·</span>
          {/if}
          {#if displaySalary}
            <span>{displaySalary}</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
