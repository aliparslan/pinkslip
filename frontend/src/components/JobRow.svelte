<script lang="ts">
  import { navigate } from "../router";
  import { api, type Job } from "../lib/api";
  import { extractSalaryFromHtml } from "../lib/job-content";
  import { normalizeJobScore, scoreToneFromPercent } from "../lib/scoring";
  import { timeAgo } from "../lib/utils";
  import { markViewed } from "../lib/viewed";
  import { hapticLight, hapticMedium } from "../lib/haptics";
  import Trash from "phosphor-svelte/lib/Trash";
  import X from "phosphor-svelte/lib/X";
  import CompanyLogo from "./CompanyLogo.svelte";

  let { job, viewed = false, onDismiss }: {
    job: Job;
    viewed?: boolean;
    onDismiss?: (id: string) => void;
  } = $props();

  let dismissing: boolean = $state(false);
  let swipeX: number = $state(0);
  let committing: boolean = $state(false); // pulled far enough to full-swipe dismiss
  let swiping: boolean = $state(false);
  let startX = 0;
  let startY = 0;
  let startOffsetX = 0;
  let rowWidth = 420;
  let locked = false;
  let pointerId: number | null = null;
  let rowEl: HTMLDivElement | undefined = $state(undefined);

  const ACTION_DELETE_WIDTH = 84;
  const ACTION_DISMISS_WIDTH = 84;
  const ACTION_TOTAL_WIDTH = ACTION_DELETE_WIDTH + ACTION_DISMISS_WIDTH;
  const OPEN_THRESHOLD = 56; // release past this → snap open to the two buttons
  const COMMIT_THRESHOLD = ACTION_TOTAL_WIDTH + 34; // pull past this → full-swipe dismiss
  const RUBBER = 0.5; // resistance once dragged beyond the revealed buttons

  let scorePercent = $derived(normalizeJobScore(job.score));
  let scoreColor = $derived(scoreToneFromPercent(scorePercent));
  let displaySalary = $derived(job.salary ?? extractSalaryFromHtml(job.description));

  function handleClick() {
    if (Math.abs(swipeX) > 4) {
      snapTo(0); // a swipe was open — first tap just closes it
      return;
    }
    markViewed(job.id);
    navigate(`/jobs/${job.id}`);
  }

  function snapTo(target: number) {
    swipeX = target;
  }

  // Slide the row fully off-screen (kept opaque, so it never ghosts over the
  // action buttons), then run the action and remove it — the list flips the gap
  // closed. Used by both the action buttons and the full-swipe gesture.
  async function slideOffAndRemove(action: () => Promise<unknown>) {
    if (dismissing) return;
    dismissing = true;
    swipeX = -(rowEl?.offsetWidth ?? 420);
    await new Promise((r) => setTimeout(r, 320));
    try {
      await action();
      onDismiss?.(job.id);
    } catch {
      dismissing = false;
      committing = false;
      swipeX = 0;
    }
  }

  const dismiss = () => slideOffAndRemove(() => api.jobs.dismiss(job.id));
  const blockJob = () => slideOffAndRemove(() => api.jobs.block(job.id));
  const fullSwipeDismiss = dismiss;

  function settleSwipe() {
    if (!swiping) return;
    swiping = false;
    pointerId = null;
    const abs = Math.abs(swipeX);
    if (committing || abs >= COMMIT_THRESHOLD) {
      void fullSwipeDismiss();
      return;
    }
    if (abs >= OPEN_THRESHOLD) {
      if (swipeX !== -ACTION_TOTAL_WIDTH) hapticLight();
      snapTo(-ACTION_TOTAL_WIDTH);
    } else {
      snapTo(0);
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startOffsetX = swipeX;
    rowWidth = rowEl?.offsetWidth ?? 420;
    locked = false;
    swiping = false;
    rowEl?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!locked && !swiping) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        locked = true;
        return;
      }
      if (Math.abs(dx) > 6) swiping = true;
    }
    if (locked || !swiping) return;
    e.preventDefault();

    const desired = Math.min(0, startOffsetX + dx);
    const abs = -desired;

    let next: number;
    if (abs >= COMMIT_THRESHOLD) {
      next = Math.max(-rowWidth, desired); // follow the finger into the fill
    } else if (abs > ACTION_TOTAL_WIDTH) {
      next = -(ACTION_TOTAL_WIDTH + (abs - ACTION_TOTAL_WIDTH) * RUBBER); // rubber-band
    } else {
      next = desired;
    }
    swipeX = next;

    const nowCommitting = abs >= COMMIT_THRESHOLD;
    if (nowCommitting !== committing) {
      committing = nowCommitting;
      if (nowCommitting) hapticMedium(); // "release to dismiss" tick
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    rowEl?.releasePointerCapture(e.pointerId);
    settleSwipe();
  }
</script>

<div style="position: relative; overflow: hidden; border-bottom: 0.5px solid var(--color-line); background: var(--color-bg);">
  {#if swipeX < -0.5}
    <!-- Action layer sits underneath; the row slides over to uncover it. -->
    <div class="swipe-actions" class:committing>
      <button
        class="swipe-action swipe-action-delete"
        style="width: {ACTION_DELETE_WIDTH}px;"
        aria-label="Delete for everyone"
        onclick={(event) => { event.stopPropagation(); void blockJob(); }}
        disabled={dismissing}
      >
        <Trash size={18} weight="regular" />
        <span>Delete</span>
      </button>
      <button
        class="swipe-action swipe-action-dismiss"
        style={committing ? "flex: 1;" : `width: ${ACTION_DISMISS_WIDTH}px;`}
        aria-label="Dismiss for me"
        onclick={(event) => { event.stopPropagation(); void dismiss(); }}
        disabled={dismissing}
      >
        <X size={18} weight="regular" />
        <span>Dismiss</span>
      </button>
    </div>
  {/if}

  <div
    bind:this={rowEl}
    role="button"
    tabindex="0"
    style="display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: center; cursor: pointer; padding: 10px 16px; position: relative; background: var(--color-bg); overflow: hidden; transform: translate3d({swipeX}px, 0, 0); transition: {swiping ? 'none' : 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease'}; will-change: transform; touch-action: pan-y; {(viewed && Math.abs(swipeX) < 0.5 && !dismissing) ? 'opacity: 0.5;' : ''} {dismissing ? 'pointer-events: none;' : ''}"
    onclick={handleClick}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={settleSwipe}
  >
    <CompanyLogo name={job.company_name ?? "?"} domain={job.company_domain} size={24} />
    <div style="min-width: 0; overflow: hidden;">
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--color-ink-3); font-family: var(--font-sans); margin-bottom: 1px;">
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

<style>
  .swipe-actions {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
    /* When the user pulls into the commit zone, the whole strip reads as the
       dismiss action so the over-pull fills with its colour, not an empty gap. */
    background: color-mix(in oklch, var(--color-bad) 12%, var(--color-bg));
  }

  .swipe-action {
    border: 0;
    border-left: 1px solid var(--color-line);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    background: var(--color-bg-sunken);
  }

  .swipe-action-delete {
    color: var(--color-warn);
    background: color-mix(in oklch, var(--color-warn) 12%, var(--color-bg));
  }

  .swipe-action-dismiss {
    color: var(--color-bad);
    background: color-mix(in oklch, var(--color-bad) 12%, var(--color-bg));
  }

  /* In the commit zone, Delete recedes and Dismiss owns the row. */
  .swipe-actions.committing .swipe-action-delete {
    opacity: 0;
  }

  .swipe-action:active {
    filter: brightness(1.04);
  }
</style>
