<script lang="ts">
  import { onDestroy } from "svelte";
  import { navigate } from "../router";
  import { setJobDetailReturnRoute } from "../lib/job-navigation";
  import { api, type Job } from "../lib/api";
  import { extractSalaryFromHtml, formatCompactSalaryText, formatJobLocation } from "../lib/job-content";
  import { jobTimingLabel } from "../lib/job-timing";
  import { markViewed, setViewed } from "../lib/viewed";
  import { feedback } from "../lib/feedback.svelte";
  import { hapticLight } from "../lib/haptics";
  import { createFrameBatch, delay } from "../lib/motion";
  import { sessionAccess } from "../lib/session-access";
  import { markMenuDismissed, wasMenuJustDismissed } from "../lib/menu-dismiss-guard";
  import { isIosApp } from "../lib/platform";
  import { DropdownMenu } from "bits-ui";
  import DotsThreeVertical from "phosphor-svelte/lib/DotsThreeVertical";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import Prohibit from "phosphor-svelte/lib/Prohibit";
  import EnvelopeOpen from "phosphor-svelte/lib/EnvelopeOpen";
  import EnvelopeSimple from "phosphor-svelte/lib/EnvelopeSimple";
  import CompanyLogo from "./CompanyLogo.svelte";

  let { job, viewed = false, onDismiss, onRestore, onSaved, onBlockRequest, returnTo = "/", swipeActions = true, contextLabel, surface = "feed" }: {
    job: Job;
    viewed?: boolean;
    onDismiss?: (id: string) => void;
    onRestore?: (job: Job) => void;
    onSaved?: (id: string) => void;
    onBlockRequest?: (job: Job) => void;
    returnTo?: string;
    swipeActions?: boolean;
    contextLabel?: string;
    surface?: "feed" | "card";
  } = $props();

  let dismissing: boolean = $state(false);
  let saving: boolean = $state(false);
  let swipeX: number = $state(0);
  let swiping: boolean = $state(false);
  let startX = 0;
  let startY = 0;
  let startOffsetX = 0;
  let locked = false;
  let pointerId: number | null = null;
  let rowEl: HTMLElement | undefined = $state(undefined);
  const nativeIos = isIosApp();
  const swipeBatch = createFrameBatch<number>((value) => { swipeX = value; }, nativeIos);

  const ACTION_PADDING = 12;
  const ACTION_GAP = 6;
  const SINGLE_ACTION_WIDTH = 80;
  const ADMIN_ACTION_WIDTH = 74;
  const READ_ACTION_WIDTH = 92;
  const MAX_OVERDRAG = 18;
  const DESKTOP_RUBBER = 0.16;
  const NATIVE_RUBBER = 0.62;
  const FULL_SWIPE_RATIO = 0.62;

  // "NEW" only while the badge is honest: unviewed AND actually fresh.
  // (A 36-day-old listing labelled NEW undermines the whole speed pitch.)
  const NEW_BADGE_WINDOW_MS = 48 * 60 * 60 * 1000;

  let hasAdminAction = $derived($sessionAccess.isAdmin && Boolean(onBlockRequest));
  let hasSaveAction = $derived(Boolean(onSaved));
  let hasHideAction = $derived(Boolean(onDismiss));
  let hasNativePrimaryAction = $derived(hasAdminAction || hasHideAction);
  let showRowMenu = $derived(swipeActions && (hasSaveAction || Boolean(onDismiss) || hasAdminAction));
  let rowMenuOpen = $state(false);
  let swipeActionCount = $derived(
    (hasSaveAction ? 1 : 0) + (nativeIos ? (hasNativePrimaryAction ? 1 : 0) : (hasAdminAction ? 1 : 0))
  );
  let actionButtonWidth = $derived(swipeActionCount > 1 ? ADMIN_ACTION_WIDTH : SINGLE_ACTION_WIDTH);
  let actionTotalWidth = $derived(
    ACTION_PADDING
      + actionButtonWidth * Math.max(1, swipeActionCount)
      + Math.max(0, swipeActionCount - 1) * ACTION_GAP
  );
  let openThreshold = $derived(Math.min(64, actionTotalWidth * 0.42));
  let displaySalary = $derived(formatCompactSalaryText(
    job.salary?.trim() ? job.salary : extractSalaryFromHtml(job.description)
  ));
  let displayLocation = $derived(formatJobLocation(job.location));
  let isFresh = $derived(
    Boolean(job.first_seen_at && Date.now() - new Date(job.first_seen_at).getTime() < NEW_BADGE_WINDOW_MS)
  );

  function handleClick(event?: MouseEvent) {
    if (wasMenuJustDismissed()) return;
    if (Math.abs(swipeX) > 4) {
      event?.preventDefault();
      snapTo(0); // a swipe was open — first tap just closes it
      return;
    }
    markViewed(job.id);
    setJobDetailReturnRoute(returnTo);
    if (nativeIos && event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
      return;
    }
    event?.preventDefault();
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

  onDestroy(swipeBatch.cancel);

  async function slideOffAndRemove(action: () => Promise<unknown>): Promise<boolean> {
    if (dismissing) return false;
    dismissing = true;
    swipeX = -(rowEl?.offsetWidth ?? 420);
    await delay(240);
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

  async function save() {
    if (saving) return;
    if (job.saved) {
      snapTo(0);
      feedback.show("Job is already saved");
      return;
    }

    saving = true;
    try {
      await api.savedJobs.save(job.id);
      onSaved?.(job.id);
      snapTo(0);
      feedback.success("Job saved");
    } catch {
      snapTo(0);
      feedback.error("Could not save that job. Try again.");
    } finally {
      saving = false;
    }
  }

  async function toggleReadState() {
    const nextViewed = !viewed;
    snapTo(0);
    try {
      await setViewed(job.id, nextViewed);
      feedback.show(nextViewed ? "Marked as read" : "Marked as unread");
    } catch {
      feedback.error("Could not update the read state. Try again.");
    }
  }

  function runNativePrimaryAction() {
    if (hasAdminAction) {
      snapTo(0);
      onBlockRequest?.(job);
      return;
    }
    void dismiss();
  }

  function rubberedOffset(raw: number, revealWidth: number): number {
    const distance = Math.abs(raw);
    if (distance <= revealWidth) return raw;
    const rowWidth = rowEl?.offsetWidth ?? 420;
    const stretched = Math.min(rowWidth, revealWidth + (distance - revealWidth) * NATIVE_RUBBER);
    return Math.sign(raw) * stretched;
  }

  function settleSwipe() {
    if (!swiping) return;
    swiping = false;
    pointerId = null;
    if (nativeIos) {
      const fullThreshold = (rowEl?.offsetWidth ?? 420) * FULL_SWIPE_RATIO;
      if (swipeX <= -fullThreshold) {
        hapticLight();
        if (hasSaveAction) void save();
        else runNativePrimaryAction();
        return;
      }
      if (swipeX >= fullThreshold) {
        hapticLight();
        void toggleReadState();
        return;
      }
      if (swipeX <= -openThreshold) {
        snapTo(-actionTotalWidth);
        return;
      }
      if (swipeX >= openThreshold) {
        snapTo(READ_ACTION_WIDTH);
        return;
      }
      snapTo(0);
      return;
    }

    snapTo(Math.abs(swipeX) >= openThreshold ? -actionTotalWidth : 0);
  }

  function onPointerDown(e: PointerEvent) {
    if (!swipeActions || swipeActionCount === 0) return;
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

    const desired = startOffsetX + dx;
    if (nativeIos) {
      swipeBatch.schedule(desired < 0
        ? rubberedOffset(desired, actionTotalWidth)
        : rubberedOffset(desired, READ_ACTION_WIDTH));
      return;
    }
    const desktopDesired = Math.min(0, desired);
    const desktopDistance = -desktopDesired;
    swipeBatch.schedule(desktopDistance > actionTotalWidth
      ? -(actionTotalWidth + Math.min(MAX_OVERDRAG, (desktopDistance - actionTotalWidth) * DESKTOP_RUBBER))
      : desktopDesired);
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    swipeBatch.flush();
    rowEl?.releasePointerCapture(e.pointerId);
    settleSwipe();
  }
</script>

<div class="job-row-wrap" class:card-surface={surface === "card"} class:native-swipe={nativeIos}>
  {#if nativeIos && swipeActions && swipeX > 0.5}
    <div class="swipe-actions swipe-actions-right">
      <button
        class="swipe-action read"
        style="width: {READ_ACTION_WIDTH}px;"
        aria-label={viewed ? "Mark this job as unread" : "Mark this job as read"}
        onclick={(event) => { event.stopPropagation(); void toggleReadState(); }}
      >
        {#if viewed}<EnvelopeSimple size={20} weight="bold" />{:else}<EnvelopeOpen size={20} weight="bold" />{/if}
        <span>{viewed ? "Unread" : "Read"}</span>
      </button>
    </div>
  {/if}
  {#if swipeActions && swipeX < -0.5}
    <div class="swipe-actions swipe-actions-left">
      {#if nativeIos && hasNativePrimaryAction}
        <button
          class="swipe-action"
          class:danger={hasAdminAction}
          class:hide={!hasAdminAction}
          style="width: {actionButtonWidth}px;"
          aria-label={hasAdminAction ? "Remove this job for everyone" : "Hide this job"}
          onclick={(event) => { event.stopPropagation(); runNativePrimaryAction(); }}
          disabled={dismissing}
        >
          {#if hasAdminAction}<Prohibit size={20} weight="bold" />{:else}<EyeSlash size={20} weight="bold" />{/if}
          <span>{hasAdminAction ? "Remove" : "Hide"}</span>
        </button>
      {/if}
      {#if hasSaveAction}
        <button
          class="swipe-action save"
          style="width: {actionButtonWidth}px;"
          aria-label={job.saved ? "Job already saved" : "Save this job"}
          onclick={(event) => { event.stopPropagation(); void save(); }}
          disabled={saving}
        >
          <BookmarkSimple
            size={nativeIos ? 20 : 18}
            weight={job.saved ? "fill" : nativeIos ? "bold" : "regular"}
          />
          <span>{job.saved ? "Saved" : "Save"}</span>
        </button>
      {/if}
      {#if hasAdminAction && !nativeIos}
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

  <svelte:element
    this={nativeIos ? "a" : "div"}
    bind:this={rowEl}
    class="job-row"
    class:viewed={viewed && Math.abs(swipeX) < 0.5 && !dismissing}
    class:dismissing
    class:swiping
    class:has-menu={showRowMenu}
    href={nativeIos ? `#/jobs/${job.id}` : undefined}
    role={nativeIos ? undefined : "button"}
    tabindex={nativeIos ? undefined : 0}
    style="transform: translate3d({swipeX}px, 0, 0); transition: {swiping ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease'};"
    onclick={handleClick}
    onkeydown={(e: KeyboardEvent) => { if (!nativeIos && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleClick(); } }}
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
        <span class="job-row__time">{contextLabel ?? jobTimingLabel(job)}</span>
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
      {#if job.match_fact && !nativeIos}
        <div class="job-row__reason">
          <span aria-hidden="true"></span>
          {job.match_fact}
        </div>
      {/if}
    </div>
  </svelte:element>

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
          class={hasAdminAction ? "menu-surface job-more-menu" : "menu-surface job-more-menu job-row-more-menu"}
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          strategy="fixed"
          preventScroll={false}
        >
          {#if hasSaveAction && !job.saved}
            <DropdownMenu.Item class="menu-item" disabled={saving} onSelect={() => void save()}>
              <BookmarkSimple size={17} />
              <span>Save</span>
            </DropdownMenu.Item>
          {/if}
          {#if !nativeIos || !hasAdminAction}
            <DropdownMenu.Item class="menu-item" disabled={dismissing} onSelect={() => void dismiss()}>
              <EyeSlash size={17} />
              <span>Hide</span>
            </DropdownMenu.Item>
          {/if}
          {#if hasAdminAction}
            <DropdownMenu.Item class="menu-item danger" onSelect={() => onBlockRequest?.(job)}>
              <Prohibit size={17} />
              <span>{nativeIos ? "Remove for everyone" : "Block for everyone"}</span>
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
    color: inherit;
    text-decoration: none;
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
    color: var(--color-ink-4);
    font-size: var(--fs-2xs);
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

  .swipe-actions-right {
    justify-content: flex-start;
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

  .swipe-action.save {
    color: var(--color-accent);
  }

  .swipe-action.danger {
    color: var(--color-bad);
  }

  .native-swipe .swipe-actions {
    gap: 0;
    padding: 0;
    background: var(--color-bg-sunken);
    box-shadow: none;
  }

  .native-swipe .swipe-action {
    flex-direction: column;
    gap: 3px;
    border: 0;
    border-radius: 0;
    font-size: var(--fs-2xs);
    font-weight: 600;
    box-shadow: none;
  }

  .native-swipe .swipe-action.save {
    color: var(--color-accent-ink);
    background: var(--color-accent);
  }

  .native-swipe .swipe-action.hide {
    color: var(--color-bg);
    background: var(--color-ink-3);
  }

  .native-swipe .swipe-action.danger {
    color: var(--color-bg);
    background: var(--color-bad);
  }

  .native-swipe .swipe-action.read {
    color: var(--color-bg);
    background: var(--color-good);
  }
</style>
