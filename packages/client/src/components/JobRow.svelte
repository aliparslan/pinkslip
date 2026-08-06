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
  import { createFrameBatch, delay, prefersReducedMotion } from "../lib/motion";
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

  type SwipeSide = "left" | "right";
  type AxisLock = "pending" | "horizontal" | "vertical";

  let { job, viewed = false, onDismiss, onRestore, onSaved, onBlockRequest, returnTo = "/", swipeActions = true, contextLabel, surface = "feed" }: {
    job: Job;
    viewed?: boolean;
    onDismiss?: (id: string) => void;
    onRestore?: (job: Job) => void;
    onSaved?: (id: string, saved?: boolean) => void;
    onBlockRequest?: (job: Job) => void;
    returnTo?: string;
    swipeActions?: boolean;
    contextLabel?: string;
    surface?: "feed" | "card";
  } = $props();

  let dismissing: boolean = $state(false);
  let saving: boolean = $state(false);
  let updatingRead: boolean = $state(false);
  let swipeX: number = $state(0);
  let swiping: boolean = $state(false);
  let swipeSide: SwipeSide | null = $state(null);
  let armedSide: SwipeSide | null = $state(null);
  let startX = 0;
  let startY = 0;
  let startOffsetX = 0;
  let axisLock: AxisLock = "pending";
  let pointerId: number | null = null;
  let hapticFiredForGesture = false;
  let suppressClickUntil = 0;
  let rowEl: HTMLElement | undefined = $state(undefined);
  const nativeIos = isIosApp();
  const swipeBatch = createFrameBatch<number>(applySwipeOffset, nativeIos);

  const ACTION_PADDING = 12;
  const ACTION_GAP = 6;
  const SINGLE_ACTION_WIDTH = 80;
  const ADMIN_ACTION_WIDTH = 74;
  const READ_ACTION_WIDTH = 92;
  const MAX_OVERDRAG = 18;
  const DESKTOP_RUBBER = 0.16;
  const NATIVE_RUBBER = 0.62;
  const FULL_SWIPE_RATIO = 0.5;
  const SWIPE_INTENT_DISTANCE = 6;
  const SWIPE_INTENT_BIAS = 1.08;

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
    nativeIos
      ? actionButtonWidth * Math.max(1, swipeActionCount)
      : ACTION_PADDING
        + actionButtonWidth * Math.max(1, swipeActionCount)
        + Math.max(0, swipeActionCount - 1) * ACTION_GAP
  );
  let openThreshold = $derived(Math.min(64, actionTotalWidth * 0.42));
  let leftRevealWidth = $derived(Math.max(0, -swipeX));
  let leftActionBaseWidth = $derived(
    Math.min(actionButtonWidth, leftRevealWidth / Math.max(1, swipeActionCount))
  );
  let leftActionExtraWidth = $derived(
    Math.max(0, leftRevealWidth - actionButtonWidth * Math.max(1, swipeActionCount))
  );
  let nativePrimaryActionWidth = $derived(
    leftActionBaseWidth + (hasSaveAction ? 0 : leftActionExtraWidth)
  );
  let nativeSaveActionWidth = $derived(leftActionBaseWidth + leftActionExtraWidth);
  let nativeReadActionWidth = $derived(Math.max(READ_ACTION_WIDTH, swipeX));
  let leftActionsInteractive = $derived(!swiping && swipeX <= -openThreshold);
  let rightActionInteractive = $derived(!swiping && swipeX >= openThreshold);
  let savedState = $derived(Boolean(job.saved));
  let displaySalary = $derived(formatCompactSalaryText(
    job.salary?.trim() ? job.salary : extractSalaryFromHtml(job.description)
  ));
  let displayLocation = $derived(formatJobLocation(job.location));
  let isFresh = $derived(
    Boolean(job.first_seen_at && Date.now() - new Date(job.first_seen_at).getTime() < NEW_BADGE_WINDOW_MS)
  );

  function handleClick(event?: MouseEvent) {
    if (wasMenuJustDismissed()) return;
    if (performance.now() < suppressClickUntil || Math.abs(swipeX) > 4) {
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
    swipeBatch.cancel();
    swiping = false;
    armedSide = null;
    if (target < -0.5) swipeSide = "left";
    else if (target > 0.5) swipeSide = "right";
    swipeX = target;
  }

  function updateArmedState(value: number) {
    if (!nativeIos || !swiping) {
      armedSide = null;
      return;
    }
    const threshold = (rowEl?.offsetWidth ?? 420) * FULL_SWIPE_RATIO;
    const nextArmedSide = value <= -threshold
      ? "left"
      : value >= threshold
        ? "right"
        : null;
    armedSide = nextArmedSide;
    if (nextArmedSide && !hapticFiredForGesture) {
      hapticFiredForGesture = true;
      hapticLight();
    }
  }

  function applySwipeOffset(value: number) {
    swipeX = value;
    if (value < -0.5) swipeSide = "left";
    else if (value > 0.5) swipeSide = "right";
  }

  function renderedSwipeOffset(): number {
    if (!rowEl) return swipeX;
    const transform = window.getComputedStyle(rowEl).transform;
    if (!transform || transform === "none") return 0;
    return new DOMMatrixReadOnly(transform).m41;
  }

  function syncSavedState(value: boolean) {
    onSaved?.(job.id, value);
  }

  onDestroy(() => {
    swipeBatch.cancel();
  });

  async function slideOffAndRemove(action: () => Promise<unknown>): Promise<boolean> {
    if (dismissing) return false;
    dismissing = true;
    swipeSide = "left";
    armedSide = null;
    swipeX = -(rowEl?.offsetWidth ?? 420);
    const request = nativeIos ? action() : null;
    await delay(nativeIos && prefersReducedMotion() ? 0 : nativeIos ? 220 : 240);
    try {
      await (request ?? action());
      onDismiss?.(job.id);
      return true;
    } catch {
      dismissing = false;
      snapTo(0);
      feedback.error("Could not hide that job. Try again.");
      return false;
    }
  }

  async function dismiss() {
    const hidden = await slideOffAndRemove(() => api.jobs.dismiss(job.id));
    if (!hidden || !onRestore || nativeIos) return;

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
    if (!nativeIos && savedState) {
      snapTo(0);
      feedback.show("Job is already saved");
      return;
    }

    const previousSaved = savedState;
    const nextSaved = nativeIos ? !savedState : true;
    saving = true;
    if (nativeIos) syncSavedState(nextSaved);
    snapTo(0);
    try {
      if (nextSaved) await api.savedJobs.save(job.id);
      else await api.savedJobs.unsave(job.id);
      if (!nativeIos) {
        syncSavedState(true);
        feedback.success("Job saved");
      }
    } catch {
      if (nativeIos) syncSavedState(previousSaved);
      feedback.error(nextSaved ? "Could not save that job. Try again." : "Could not unsave that job. Try again.");
    } finally {
      saving = false;
    }
  }

  async function toggleReadState() {
    if (updatingRead) return;
    const nextViewed = !viewed;
    updatingRead = true;
    snapTo(0);
    try {
      await setViewed(job.id, nextViewed);
    } catch {
      feedback.error("Could not update the read state. Try again.");
    } finally {
      updatingRead = false;
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
    const wasHorizontalSwipe = axisLock === "horizontal" || swiping;
    const releaseArmedSide = armedSide;
    swiping = false;
    pointerId = null;
    axisLock = "pending";
    armedSide = null;
    if (!wasHorizontalSwipe) return;
    suppressClickUntil = performance.now() + 360;
    if (nativeIos) {
      if (releaseArmedSide === "left") {
        if (hasSaveAction) void save();
        else runNativePrimaryAction();
        return;
      }
      if (releaseArmedSide === "right") {
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
    if (dismissing || saving || updatingRead) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startOffsetX = swipeX;
    axisLock = "pending";
    swiping = false;
    armedSide = null;
    hapticFiredForGesture = false;
  }

  function onPointerMove(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (axisLock === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_INTENT_DISTANCE) return;
      if (Math.abs(dx) <= Math.abs(dy) * SWIPE_INTENT_BIAS) {
        axisLock = "vertical";
        pointerId = null;
        return;
      }
      axisLock = "horizontal";
      startOffsetX = renderedSwipeOffset();
      swiping = true;
      rowEl?.setPointerCapture(e.pointerId);
    }
    if (axisLock !== "horizontal" || !swiping) return;
    e.preventDefault();

    const desired = startOffsetX + dx;
    if (nativeIos) {
      updateArmedState(desired);
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
    if (rowEl?.hasPointerCapture(e.pointerId)) rowEl.releasePointerCapture(e.pointerId);
    settleSwipe();
  }

  function onPointerCancel(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    swipeBatch.cancel();
    if (rowEl?.hasPointerCapture(e.pointerId)) rowEl.releasePointerCapture(e.pointerId);
    pointerId = null;
    axisLock = "pending";
    swiping = false;
    armedSide = null;
    snapTo(0);
  }

</script>

<div class="job-row-wrap" class:card-surface={surface === "card"} class:native-swipe={nativeIos}>
  {#if nativeIos && swipeActions && swipeSide === "right"}
    <div
      class="swipe-actions swipe-actions-right"
      class:interactive={rightActionInteractive}
      aria-hidden={!rightActionInteractive}
    >
      <button
        class="swipe-action read"
        style:width={`${nativeReadActionWidth}px`}
        aria-label={`Mark this job as ${viewed ? "unread" : "read"}`}
        tabindex={rightActionInteractive ? 0 : -1}
        onclick={(event) => { event.stopPropagation(); void toggleReadState(); }}
        disabled={updatingRead}
      >
        <span class="swipe-action-icon" class:armed={armedSide === "right"} aria-hidden="true">
          {#if viewed}<EnvelopeSimple size={20} weight="bold" />{:else}<EnvelopeOpen size={20} weight="bold" />{/if}
        </span>
        <span>{armedSide === "right" ? "Release" : viewed ? "Unread" : "Read"}</span>
      </button>
    </div>
  {/if}
  {#if swipeActions && (nativeIos ? swipeSide === "left" : swipeX < -0.5)}
    <div
      class="swipe-actions swipe-actions-left"
      class:interactive={!nativeIos || leftActionsInteractive}
      class:removing={dismissing}
      class:save-backdrop={nativeIos && hasSaveAction && !dismissing}
      class:danger-backdrop={nativeIos && hasAdminAction && !hasSaveAction && !dismissing}
      class:hide-backdrop={nativeIos && !hasSaveAction && !hasAdminAction && !dismissing}
      aria-hidden={nativeIos && !leftActionsInteractive}
    >
      {#if hasSaveAction}
        <button
          class="swipe-action save"
          style:width={`${nativeIos ? nativeSaveActionWidth : actionButtonWidth}px`}
          aria-label={nativeIos ? `${savedState ? "Unsave" : "Save"} this job` : savedState ? "Job already saved" : "Save this job"}
          tabindex={nativeIos && !leftActionsInteractive ? -1 : 0}
          onclick={(event) => { event.stopPropagation(); void save(); }}
          disabled={saving}
        >
          <span class="swipe-action-icon" class:armed={armedSide === "left"} aria-hidden="true">
            <BookmarkSimple
              size={nativeIos ? 20 : 18}
              weight={savedState ? "fill" : nativeIos ? "bold" : "regular"}
            />
          </span>
          <span>{nativeIos && armedSide === "left" ? "Release" : nativeIos && savedState ? "Unsave" : savedState ? "Saved" : "Save"}</span>
        </button>
      {/if}
      {#if nativeIos && hasNativePrimaryAction}
        <button
          class="swipe-action"
          class:danger={hasAdminAction}
          class:hide={!hasAdminAction}
          style:width={`${nativePrimaryActionWidth}px`}
          aria-label={hasAdminAction ? "Remove this job for everyone" : "Hide this job"}
          tabindex={leftActionsInteractive ? 0 : -1}
          onclick={(event) => { event.stopPropagation(); runNativePrimaryAction(); }}
          disabled={dismissing}
        >
          <span class="swipe-action-icon" aria-hidden="true">
            {#if hasAdminAction}<Prohibit size={20} weight="bold" />{:else}<EyeSlash size={20} weight="bold" />{/if}
          </span>
          <span>{hasAdminAction ? "Remove" : "Hide"}</span>
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
    style:transform={`translate3d(${swipeX}px, 0, 0)`}
    style:transition={nativeIos ? undefined : swiping ? "none" : "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease"}
    onclick={handleClick}
    onkeydown={(e: KeyboardEvent) => { if (!nativeIos && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleClick(); } }}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
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

  {#if nativeIos && savedState && showRowMenu && Math.abs(swipeX) < 0.5}
    <span class="job-row__saved-indicator" role="img" aria-label="Saved job" title="Saved">
      <BookmarkSimple size={14} weight="fill" aria-hidden="true" />
    </span>
  {/if}

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
          {#if hasSaveAction && (!savedState || nativeIos)}
            <DropdownMenu.Item class="menu-item" disabled={saving} onSelect={() => void save()}>
              <BookmarkSimple size={17} weight={savedState ? "fill" : "regular"} />
              <span>{savedState ? "Unsave" : "Save"}</span>
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

  .native-swipe .job-row {
    transition:
      transform var(--duration-standard) var(--ease-standard),
      opacity var(--duration-instant) var(--ease-standard);
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
  .native-swipe .job-row.swiping { transition: none; }
  .job-row.viewed { opacity: 0.5; }
  .job-row.dismissing { pointer-events: none; }
  .job-row.has-menu { padding-right: 48px; }

  :global(.job-row__menu-trigger) {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 1;
  }

  .job-row__saved-indicator {
    position: absolute;
    top: 38px;
    right: 13px;
    z-index: 1;
    width: 14px;
    height: 14px;
    display: grid;
    place-items: center;
    color: var(--color-accent);
    pointer-events: none;
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
    overflow: hidden;
    white-space: nowrap;
  }

  .swipe-action-icon {
    display: grid;
    place-items: center;
    flex: none;
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
    overflow: hidden;
    pointer-events: none;
    box-shadow: none;
  }

  .native-swipe .swipe-actions.interactive { pointer-events: auto; }

  .native-swipe .swipe-actions-left.save-backdrop {
    background: var(--color-accent);
  }

  .native-swipe .swipe-actions-right {
    background: var(--color-ink-2);
  }

  .native-swipe .swipe-actions-left.hide-backdrop,
  .native-swipe .swipe-actions-left.removing {
    background: var(--color-ink-3);
  }

  .native-swipe .swipe-actions-left.danger-backdrop {
    background: var(--color-bad);
  }

  .native-swipe .swipe-action {
    min-width: 0;
    flex: none;
    flex-direction: column;
    gap: 3px;
    padding: 0;
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
    background: var(--color-ink-2);
  }

  @media (prefers-reduced-motion: no-preference) {
    .native-swipe .swipe-action-icon {
      transition: transform var(--duration-instant) var(--ease-standard);
    }

    .native-swipe .swipe-actions-left .swipe-action-icon.armed {
      transform: translateX(-6px);
    }

    .native-swipe .swipe-actions-right .swipe-action-icon.armed {
      transform: translateX(6px);
    }
  }
</style>
