<script lang="ts">
  import { navigate } from "../router";
  import { setJobDetailReturnRoute } from "../lib/job-navigation";
  import { api, type Job } from "../lib/api";
  import { extractSalaryFromHtml, formatCompactSalaryText, formatJobLocation } from "../lib/job-content";
  import { timeAgo } from "../lib/utils";
  import { markViewed } from "../lib/viewed";
  import { sessionAccess } from "../lib/session-access";
  import { hapticLight, hapticMedium } from "../lib/haptics";
  import Trash from "phosphor-svelte/lib/Trash";
  import X from "phosphor-svelte/lib/X";
  import CompanyLogo from "./CompanyLogo.svelte";

  let { job, viewed = false, onDismiss, returnTo = "/", swipeActions = true, contextLabel }: {
    job: Job;
    viewed?: boolean;
    onDismiss?: (id: string) => void;
    returnTo?: string;
    swipeActions?: boolean;
    contextLabel?: string;
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
  const OPEN_THRESHOLD = 56; // release past this → snap open to the two buttons
  const RUBBER = 0.5; // resistance once dragged beyond the revealed buttons

  // "NEW" only while the badge is honest: unviewed AND actually fresh.
  // (A 36-day-old listing labelled NEW undermines the whole speed pitch.)
  const NEW_BADGE_WINDOW_MS = 48 * 60 * 60 * 1000;

  let actionTotalWidth = $derived(
    $sessionAccess.isAdmin
      ? ACTION_DELETE_WIDTH + ACTION_DISMISS_WIDTH
      : ACTION_DISMISS_WIDTH
  );
  let commitThreshold = $derived(actionTotalWidth + 34);
  let displaySalary = $derived(formatCompactSalaryText(
    job.salary?.trim() ? job.salary : extractSalaryFromHtml(job.description)
  ));
  let displayLocation = $derived(formatJobLocation(job.location));
  let isFresh = $derived(
    Boolean(job.first_seen_at && Date.now() - new Date(job.first_seen_at).getTime() < NEW_BADGE_WINDOW_MS)
  );

  function handleClick() {
    if (Math.abs(swipeX) > 4) {
      snapTo(0); // a swipe was open — first tap just closes it
      return;
    }
    markViewed(job.id);
    setJobDetailReturnRoute(returnTo);
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
    if (committing || abs >= commitThreshold) {
      void fullSwipeDismiss();
      return;
    }
    if (abs >= OPEN_THRESHOLD) {
      if (swipeX !== -actionTotalWidth) hapticLight();
      snapTo(-actionTotalWidth);
    } else {
      snapTo(0);
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (!swipeActions) return;
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
    if (abs >= commitThreshold) {
      next = Math.max(-rowWidth, desired); // follow the finger into the fill
    } else if (abs > actionTotalWidth) {
      next = -(actionTotalWidth + (abs - actionTotalWidth) * RUBBER); // rubber-band
    } else {
      next = desired;
    }
    swipeX = next;

    const nowCommitting = abs >= commitThreshold;
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

<div class="job-row-wrap">
  {#if swipeActions && swipeX < -0.5}
    <!-- Action layer sits underneath; the row slides over to uncover it. -->
    <div class="swipe-actions" class:committing>
      {#if $sessionAccess.isAdmin}
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
      {/if}
      <button
        class="swipe-action swipe-action-dismiss"
        style={committing ? "flex: 1;" : `width: ${ACTION_DISMISS_WIDTH}px;`}
        aria-label="Not interested"
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
    class="job-row"
    class:viewed={viewed && Math.abs(swipeX) < 0.5 && !dismissing}
    class:dismissing
    role="button"
    tabindex="0"
    style="transform: translate3d({swipeX}px, 0, 0); transition: {swiping ? 'none' : 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease'};"
    onclick={handleClick}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={settleSwipe}
  >
    <CompanyLogo name={job.company_name ?? "?"} domain={job.company_domain} size={24} />
    <div class="job-row__body">
      <div class="job-row__meta">
        <span class="job-row__company">{job.company_name}</span>
        <span class="job-row__dot">·</span>
        <span class="job-row__time">{contextLabel ?? timeAgo(job.posted_at ?? job.first_seen_at ?? "")}</span>
        {#if !contextLabel && !viewed && isFresh}
          <span class="job-row__new">NEW</span>
        {/if}
      </div>
      <div class="job-row__title">{job.title}</div>
      {#if displayLocation || displaySalary}
        <div class="job-row__sub">
          {#if displayLocation}
            <span class="job-row__location">{displayLocation}</span>
          {/if}
          {#if displayLocation && displaySalary}
            <span class="job-row__dot">·</span>
          {/if}
          {#if displaySalary}
            <span class="job-row__salary">{displaySalary}</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .job-row-wrap {
    position: relative;
    overflow: hidden;
    border-bottom: 0.5px solid var(--color-line);
    background: var(--color-bg);
  }

  .job-row {
    display: grid;
    grid-template-columns: 24px 1fr;
    gap: 10px;
    align-items: center;
    padding: 10px var(--space-4);
    position: relative;
    background: var(--color-bg);
    overflow: hidden;
    cursor: pointer;
    will-change: transform;
    touch-action: pan-y;
  }
  .job-row.viewed { opacity: 0.5; }
  .job-row.dismissing { pointer-events: none; }

  .job-row__body { min-width: 0; overflow: hidden; }

  .job-row__meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 1px;
    font-family: var(--font-sans);
    font-size: var(--fs-2xs);
    color: var(--color-ink-3);
  }
  .job-row__company { flex-shrink: 0; font-weight: 600; color: var(--color-ink); }
  .job-row__dot { flex-shrink: 0; opacity: 0.4; }
  .job-row__time { flex-shrink: 0; }
  .job-row__new {
    flex-shrink: 0;
    color: var(--color-accent);
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .job-row__title {
    font-size: var(--fs-base);
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .job-row__sub {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    font-size: var(--fs-xs);
    color: var(--color-ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .job-row__location {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .job-row__salary { flex-shrink: 0; }
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
