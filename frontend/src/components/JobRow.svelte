<script lang="ts">
  import { navigate } from "../router";
  import { api, type Job } from "../lib/api";
  import { extractSalaryFromHtml } from "../lib/job-content";
  import { normalizeJobScore, scoreToneFromPercent } from "../lib/scoring";
  import { timeAgo } from "../lib/utils";
  import { markViewed } from "../lib/viewed";
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
  let swiping: boolean = $state(false);
  let startX: number = 0;
  let startY: number = 0;
  let startOffsetX: number = 0;
  let locked: boolean = false;
  let pointerId: number | null = null;
  let rowEl: HTMLDivElement | undefined = $state(undefined);

  const ACTION_DELETE_WIDTH = 86;
  const ACTION_DISMISS_WIDTH = 94;
  const ACTION_TOTAL_WIDTH = ACTION_DELETE_WIDTH + ACTION_DISMISS_WIDTH;
  const SWIPE_OPEN_THRESHOLD = 58;
  const SWIPE_CLOSE_THRESHOLD = ACTION_TOTAL_WIDTH - 46;
  const MAX_PULL = ACTION_TOTAL_WIDTH + 42;

  let scorePercent = $derived(normalizeJobScore(job.score));
  let scoreColor = $derived(scoreToneFromPercent(scorePercent));
  let displaySalary = $derived(job.salary ?? extractSalaryFromHtml(job.description));
  let actionsOpen = $derived(Math.abs(swipeX) >= ACTION_TOTAL_WIDTH - 4);
  let revealProgress = $derived.by(() => Math.max(0, Math.min(1, Math.abs(swipeX) / ACTION_TOTAL_WIDTH)));

  function handleClick() {
    if (Math.abs(swipeX) > 4) {
      void snapTo(0);
      return;
    }
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

  function snapTo(target: number) {
    swipeX = target;
  }

  function settleSwipe() {
    if (!swiping) return;
    const abs = Math.abs(swipeX);
    const target =
      swipeX < 0 && (abs >= SWIPE_CLOSE_THRESHOLD || (startOffsetX === 0 && abs >= SWIPE_OPEN_THRESHOLD))
        ? -ACTION_TOTAL_WIDTH
        : 0;
    snapTo(target);
    swiping = false;
    pointerId = null;
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startOffsetX = swipeX;
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
      if (Math.abs(dx) > 6) {
        swiping = true;
      }
    }

    if (locked || !swiping) return;

    const raw = Math.min(0, Math.max(-MAX_PULL, startOffsetX + dx));
    const abs = Math.abs(raw);
    swipeX = abs > ACTION_TOTAL_WIDTH
      ? -(ACTION_TOTAL_WIDTH + (abs - ACTION_TOTAL_WIDTH) * 0.18)
      : raw;
    e.preventDefault();
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    rowEl?.releasePointerCapture(e.pointerId);
    settleSwipe();
  }
</script>

<div style="position: relative; overflow: hidden; border-bottom: 0.5px solid var(--color-line); background: var(--color-bg);">
  {#if swipeX !== 0 || actionsOpen}
    <div style="position: absolute; inset: 0; display: flex; justify-content: flex-end; align-items: stretch; background: var(--color-bg);">
      <button
        class="swipe-action swipe-action-delete"
        style="width: {ACTION_DELETE_WIDTH}px; opacity: {0.42 + revealProgress * 0.58}; transform: translateX({(1 - revealProgress) * 10}px);"
        aria-label="Delete for everyone"
        onclick={(event) => {
          event.stopPropagation();
          void blockJob();
        }}
        disabled={dismissing}
      >
        <Trash size={18} weight="regular" />
        <span>Delete</span>
      </button>
      <button
        class="swipe-action swipe-action-dismiss"
        style="width: {ACTION_DISMISS_WIDTH}px; opacity: {0.42 + revealProgress * 0.58}; transform: translateX({(1 - revealProgress) * 6}px);"
        aria-label="Dismiss for me"
        onclick={(event) => {
          event.stopPropagation();
          void dismiss();
        }}
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
    style="display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: center; cursor: pointer; padding: 10px 16px; position: relative; background: var(--color-bg); overflow: hidden; transform: translate3d({swipeX}px, 0, 0); transition: {swiping ? 'none' : 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease'}; will-change: transform; touch-action: pan-y; {viewed ? 'opacity: 0.5;' : ''} {dismissing ? 'opacity: 0; pointer-events: none;' : ''}"
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
    transition: background 0.16s ease, opacity 0.16s ease, transform 0.16s ease;
  }

  .swipe-action-delete {
    color: var(--color-warn);
    background: color-mix(in oklch, var(--color-warn) 12%, var(--color-bg));
  }

  .swipe-action-dismiss {
    color: var(--color-bad);
    background: color-mix(in oklch, var(--color-bad) 12%, var(--color-bg));
  }

  .swipe-action:active {
    filter: brightness(1.04);
  }
</style>
