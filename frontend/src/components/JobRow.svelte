<script lang="ts">
  import { navigate } from "../router";
  import { setJobDetailReturnRoute } from "../lib/job-navigation";
  import { api, type Job } from "../lib/api";
  import { extractSalaryFromHtml, formatCompactSalaryText, formatJobLocation } from "../lib/job-content";
  import { timeAgo } from "../lib/utils";
  import { markViewed } from "../lib/viewed";
  import { feedback } from "../lib/feedback.svelte";
  import { hapticLight } from "../lib/haptics";
  import { sessionAccess } from "../lib/session-access";
  import { markMenuDismissed, wasMenuJustDismissed } from "../lib/menu-dismiss-guard";
  import { DropdownMenu } from "bits-ui";
  import DotsThreeVertical from "phosphor-svelte/lib/DotsThreeVertical";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import Prohibit from "phosphor-svelte/lib/Prohibit";
  import CompanyLogo from "./CompanyLogo.svelte";

  let { job, viewed = false, onDismiss, onRestore, onBlockRequest, returnTo = "/", swipeActions = true, contextLabel, surface = "feed" }: {
    job: Job;
    viewed?: boolean;
    onDismiss?: (id: string) => void;
    onRestore?: (job: Job) => void;
    onBlockRequest?: (job: Job) => void;
    returnTo?: string;
    swipeActions?: boolean;
    contextLabel?: string;
    surface?: "feed" | "card";
  } = $props();

  let dismissing: boolean = $state(false);
  let swipeX: number = $state(0);
  let swiping: boolean = $state(false);
  let startX = 0;
  let startY = 0;
  let startOffsetX = 0;
  let locked = false;
  let pointerId: number | null = null;
  let rowEl: HTMLDivElement | undefined = $state(undefined);

  const ACTION_PADDING = 12;
  const ACTION_GAP = 6;
  const SINGLE_ACTION_WIDTH = 80;
  const ADMIN_ACTION_WIDTH = 74;
  const MAX_OVERDRAG = 18;
  const RUBBER = 0.16;

  // "NEW" only while the badge is honest: unviewed AND actually fresh.
  // (A 36-day-old listing labelled NEW undermines the whole speed pitch.)
  const NEW_BADGE_WINDOW_MS = 48 * 60 * 60 * 1000;

  let hasAdminAction = $derived($sessionAccess.isAdmin && Boolean(onBlockRequest));
  let showRowMenu = $derived(swipeActions && (Boolean(onDismiss) || hasAdminAction));
  let rowMenuOpen = $state(false);
  let actionButtonWidth = $derived(hasAdminAction ? ADMIN_ACTION_WIDTH : SINGLE_ACTION_WIDTH);
  let actionTotalWidth = $derived(
    ACTION_PADDING + actionButtonWidth * (hasAdminAction ? 2 : 1) + (hasAdminAction ? ACTION_GAP : 0)
  );
  let openThreshold = $derived(Math.min(64, actionTotalWidth * 0.42));
  let displaySalary = $derived(formatCompactSalaryText(
    job.salary?.trim() ? job.salary : extractSalaryFromHtml(job.description)
  ));
  let displayLocation = $derived(formatJobLocation(job.location));
  let matchReason = $derived(
    job.match_reasons?.find((reason) => reason.toLowerCase() !== "new today")
      ?? job.match_reasons?.[0]
      ?? null
  );
  let isFresh = $derived(
    Boolean(job.first_seen_at && Date.now() - new Date(job.first_seen_at).getTime() < NEW_BADGE_WINDOW_MS)
  );

  function handleClick() {
    if (wasMenuJustDismissed()) return;
    if (Math.abs(swipeX) > 4) {
      snapTo(0); // a swipe was open — first tap just closes it
      return;
    }
    markViewed(job.id);
    setJobDetailReturnRoute(returnTo);
    navigate(`/jobs/${job.id}`);
  }

  $effect(() => {
    if (!rowMenuOpen) return;
    const closeOnScroll = () => { rowMenuOpen = false; };
    window.addEventListener("scroll", closeOnScroll, true);
    return () => window.removeEventListener("scroll", closeOnScroll, true);
  });

  function handleRowMenuOpenChange(open: boolean) {
    if (!open) markMenuDismissed();
  }

  function snapTo(target: number) {
    swipeX = target;
  }

  async function slideOffAndRemove(action: () => Promise<unknown>): Promise<boolean> {
    if (dismissing) return false;
    dismissing = true;
    swipeX = -(rowEl?.offsetWidth ?? 420);
    await new Promise((resolve) => setTimeout(resolve, 240));
    try {
      await action();
      onDismiss?.(job.id);
      return true;
    } catch {
      dismissing = false;
      swipeX = 0;
      feedback.error("Could not hide that job. Try again.");
      return false;
    }
  }

  async function dismiss() {
    const hidden = await slideOffAndRemove(() => api.jobs.dismiss(job.id));
    if (!hidden) return;

    feedback.show({
      message: "Job hidden from your feed",
      action: {
        label: "Undo",
        run: async () => {
          try {
            await api.jobs.undismiss(job.id);
            onRestore?.(job);
          } catch {
            feedback.error("Could not restore that job.");
          }
        },
      },
    });
  }

  function settleSwipe() {
    if (!swiping) return;
    swiping = false;
    pointerId = null;
    if (Math.abs(swipeX) >= openThreshold) {
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
    swipeX = abs > actionTotalWidth
      ? -(actionTotalWidth + Math.min(MAX_OVERDRAG, (abs - actionTotalWidth) * RUBBER))
      : desired;
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    rowEl?.releasePointerCapture(e.pointerId);
    settleSwipe();
  }
</script>

<div class="job-row-wrap" class:card-surface={surface === "card"}>
  {#if swipeActions && swipeX < -0.5}
    <div class="swipe-actions">
      <button
        class="swipe-action"
        style="width: {actionButtonWidth}px;"
        aria-label="Hide this job"
        onclick={(event) => { event.stopPropagation(); void dismiss(); }}
        disabled={dismissing}
      >
        <EyeSlash size={18} weight="regular" />
        <span>Hide</span>
      </button>
      {#if hasAdminAction}
        <button
          class="swipe-action danger"
          style="width: {actionButtonWidth}px;"
          aria-label="Block this job for everyone"
          onclick={(event) => {
            event.stopPropagation();
            snapTo(0);
            onBlockRequest?.(job);
          }}
        >
          <Prohibit size={18} weight="regular" />
          <span>Block</span>
        </button>
      {/if}
    </div>
  {/if}

  <div
    bind:this={rowEl}
    class="job-row"
    class:viewed={viewed && Math.abs(swipeX) < 0.5 && !dismissing}
    class:dismissing
    class:swiping
    class:has-menu={showRowMenu}
    role="button"
    tabindex="0"
    style="transform: translate3d({swipeX}px, 0, 0); transition: {swiping ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease'};"
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
          <span class="job-row__new" role="img" aria-label="New job" title="New job"></span>
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
      {#if matchReason}
        <div class="job-row__reason">
          <span aria-hidden="true"></span>
          {matchReason}
        </div>
      {/if}
    </div>
  </div>

  {#if showRowMenu && Math.abs(swipeX) < 0.5}
    <DropdownMenu.Root bind:open={rowMenuOpen} onOpenChange={handleRowMenuOpenChange}>
      <DropdownMenu.Trigger
        class="icon-btn icon-btn-sm job-row__menu-trigger"
        aria-label="Actions for {job.title} at {job.company_name}"
      >
        <DotsThreeVertical size={18} weight="bold" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          class={hasAdminAction ? "job-more-menu" : "job-more-menu job-row-more-menu"}
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          strategy="fixed"
          preventScroll={false}
        >
          <DropdownMenu.Item class="job-more-menu-item" disabled={dismissing} onSelect={() => void dismiss()}>
            <EyeSlash size={17} />
            <span>Hide</span>
          </DropdownMenu.Item>
          {#if hasAdminAction}
            <DropdownMenu.Item class="job-more-menu-item danger" onSelect={() => onBlockRequest?.(job)}>
              <Prohibit size={17} />
              <span>Block for everyone</span>
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  {/if}
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
    touch-action: pan-y;
  }

  .job-row-wrap.card-surface,
  .job-row-wrap.card-surface .job-row {
    background: var(--color-bg-elev);
  }

  /* Scoped to the active drag. Promoting every row in a long feed to its own
     compositor layer costs real memory on device, and buys nothing until the
     row actually moves — same pattern as .nav-foreground.is-swiping. */
  .job-row.swiping {
    will-change: transform;
  }
  .job-row.viewed { opacity: 0.5; }
  .job-row.dismissing { pointer-events: none; }
  .job-row.has-menu { padding-right: 48px; }

  :global(.job-row__menu-trigger) {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 1;
  }

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
  .job-row__company { flex-shrink: 0; font-weight: 500; color: var(--color-ink); }
  .job-row__dot { flex-shrink: 0; opacity: 0.4; }
  .job-row__time { flex-shrink: 0; }
  .job-row__new {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    box-shadow: 0 0 0 3px var(--color-accent-soft);
  }
  .job-row__title {
    font-size: var(--fs-base);
    font-weight: 500;
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
  .job-row__reason {
    min-width: 0;
    margin-top: 3px;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    color: var(--color-ink-2);
    font-size: var(--fs-xs);
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .job-row__reason > span {
    width: 4px;
    height: 4px;
    flex: none;
    border-radius: var(--radius-full);
    background: var(--color-ink-4);
  }
  .swipe-actions {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: color-mix(in oklch, var(--color-bg-sunken) 94%, black);
    box-shadow: inset 0 1px 2px oklch(0 0 0 / 10%);
  }

  .swipe-action {
    align-self: stretch;
    border: 1px solid var(--color-line-2);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    color: var(--color-ink-2);
    font-family: var(--font-sans);
    font-size: var(--fs-xs);
    font-weight: 500;
    background: var(--color-bg-elev);
    box-shadow: var(--shadow-control-active);
  }

  .swipe-action:active {
    background: var(--color-control-bg);
  }

  .swipe-action.danger {
    color: var(--color-bad);
  }
</style>
