<script lang="ts">
  import { flushSync, onDestroy } from "svelte";
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
  import { isIosApp, platform } from "../lib/platform";
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

  let {
    job,
    viewed = false,
    onDismiss,
    onRestore,
    onSaved,
    onBlockRequest,
    returnTo = "/",
    swipeActions = true,
    contextLabel,
    surface = "feed",
    activeSwipeId,
    onSwipeOpen,
  }: {
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
    activeSwipeId?: string | null;
    onSwipeOpen?: (id: string | null) => void;
  } = $props();

  let dismissing: boolean = $state(false);
  let saving: boolean = $state(false);
  let updatingRead: boolean = $state(false);
  let swipeX: number = $state(0);
  let swiping: boolean = $state(false);
  let swipeSide: SwipeSide | null = $state(null);
  let armedSide: SwipeSide | null = null;
  let startX = 0;
  let startY = 0;
  let startOffsetX = 0;
  let gestureRowWidth = 420;
  let axisLock: AxisLock = "pending";
  let pointerId: number | null = null;
  let suppressClickUntil = 0;
  let rowEl: HTMLElement | undefined = $state(undefined);
  let leftCascadeEl: HTMLButtonElement | undefined = $state(undefined);
  let leftCascadeContentEl: HTMLElement | undefined = $state(undefined);
  let leftOuterEl: HTMLButtonElement | undefined = $state(undefined);
  let leftOuterContentEl: HTMLElement | undefined = $state(undefined);
  let rightContentEl: HTMLElement | undefined = $state(undefined);
  let nativeSwipeX = 0;
  let pendingNativeSwipeX = 0;
  let nativeSwipeQueued = false;
  let nativeFrame: number | null = null;
  let armVisualProgress = 0;
  let armVisualFrom = 0;
  let armVisualTarget = 0;
  let armVisualStartedAt = 0;
  let armVisualDuration = 0;
  let previousGestureX = 0;
  const nativeIos = isIosApp();
  const swipeBatch = createFrameBatch<number>(applySwipeOffset, nativeIos);

  const ACTION_PADDING = 12;
  const ACTION_GAP = 6;
  const SINGLE_ACTION_WIDTH = 80;
  const ADMIN_ACTION_WIDTH = 74;
  const READ_ACTION_WIDTH = 92;
  const MAX_OVERDRAG = 18;
  const DESKTOP_RUBBER = 0.16;
  const FULL_SWIPE_RATIO = 0.5;
  const SWIPE_INTENT_DISTANCE = 6;
  // Give a deliberate diagonal swipe to the row; vertical scrolling still wins
  // when its travel is clearly dominant.
  const SWIPE_INTENT_BIAS = 0.8;

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
  let actionButtonWidth = $derived(nativeIos ? ADMIN_ACTION_WIDTH : swipeActionCount > 1 ? ADMIN_ACTION_WIDTH : SINGLE_ACTION_WIDTH);
  let actionTotalWidth = $derived(
    nativeIos
      ? actionButtonWidth * Math.max(1, swipeActionCount)
      : ACTION_PADDING
        + actionButtonWidth * Math.max(1, swipeActionCount)
        + Math.max(0, swipeActionCount - 1) * ACTION_GAP
  );
  let openThreshold = $derived(Math.min(64, actionTotalWidth * 0.42));
  let leftActionsInteractive = $derived(!swiping && Math.abs(swipeX + actionTotalWidth) < 0.5);
  let rightActionInteractive = $derived(!swiping && Math.abs(swipeX - READ_ACTION_WIDTH) < 0.5);
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
    if (performance.now() < suppressClickUntil || Math.abs(currentSwipeOffset()) > 4) {
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

  async function openNativeRowMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const source = event.currentTarget as HTMLButtonElement;
    const rect = source.getBoundingClientRect();
    snapTo(0);
    const action = await platform().actionMenu.present({
      source: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      actions: [
        ...(hasSaveAction ? [{
          id: "save",
          title: savedState ? "Unsave" : "Save",
          symbol: savedState ? "bookmark.fill" : "bookmark",
          disabled: saving,
        }] : []),
        ...(!hasAdminAction && hasHideAction ? [{
          id: "hide",
          title: "Hide",
          symbol: "eye.slash",
          disabled: dismissing,
        }] : []),
        ...(hasAdminAction ? [{
          id: "remove",
          title: "Remove",
          symbol: "nosign",
          destructive: true,
        }] : []),
      ],
    }).catch(() => null);
    markMenuDismissed();
    if (action === "save") void save();
    else if (action === "hide") void dismiss();
    else if (action === "remove") onBlockRequest?.(job);
  }

  function currentSwipeOffset(): number {
    return nativeIos ? nativeSwipeX : swipeX;
  }

  function nativeMotionDuration(): number {
    if (!rowEl || prefersReducedMotion()) return 0;
    const raw = getComputedStyle(rowEl).getPropertyValue("--duration-instant").trim();
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return 0;
    return raw.endsWith("s") && !raw.endsWith("ms") ? value * 1000 : value;
  }

  function sampleArmProgress(timestamp: number): boolean {
    if (armVisualProgress === armVisualTarget) return false;
    if (armVisualDuration <= 0) {
      armVisualProgress = armVisualTarget;
      return false;
    }
    const elapsed = Math.max(0, timestamp - armVisualStartedAt);
    const linearProgress = Math.min(1, elapsed / armVisualDuration);
    const easedProgress = 1 - (1 - linearProgress) ** 3;
    armVisualProgress = armVisualFrom + (armVisualTarget - armVisualFrom) * easedProgress;
    if (linearProgress >= 1) {
      armVisualProgress = armVisualTarget;
      return false;
    }
    return true;
  }

  function ensureNativeFrame() {
    if (nativeFrame === null) nativeFrame = window.requestAnimationFrame(runNativeFrame);
  }

  function beginArmMotion(target: number) {
    const now = performance.now();
    sampleArmProgress(now);
    armVisualFrom = armVisualProgress;
    armVisualTarget = target;
    armVisualStartedAt = now;
    ensureNativeFrame();
  }

  function paintNativeSwipe(value: number) {
    nativeSwipeX = value;
    rowEl?.style.setProperty("transform", `translate3d(${value}px, 0, 0)`);

    const nextSide: SwipeSide | null = value < -0.5 ? "left" : value > 0.5 ? "right" : null;
    if (nextSide !== swipeSide && (nextSide !== null || swiping)) {
      flushSync(() => { swipeSide = nextSide; });
    }

    const leftReveal = Math.min(gestureRowWidth, Math.max(0, -value));
    const rightReveal = Math.min(gestureRowWidth, Math.max(0, value));

    const actionCount = Math.max(1, swipeActionCount);
    const actionGrowth = Math.max(0, leftReveal - actionTotalWidth) / actionCount;
    const actionWidth = actionButtonWidth + actionGrowth;
    const visualOuterEl = leftOuterEl ?? leftCascadeEl;
    const visualOuterContentEl = leftOuterContentEl ?? leftCascadeContentEl;
    leftCascadeEl?.style.setProperty("width", `${actionWidth}px`);
    visualOuterEl?.style.setProperty("width", `${actionWidth}px`);

    if (leftCascadeEl && swipeActionCount > 1) {
      const revealProgress = Math.min(1, Math.max(0, leftReveal / Math.max(1, actionTotalWidth)));
      const cascadeOffset = (1 - revealProgress) * actionButtonWidth;
      const takeoverOffset = armVisualProgress * actionWidth;
      leftCascadeEl.style.setProperty(
        "transform",
        `translate3d(${cascadeOffset + takeoverOffset}px, 0, 0)`,
      );
    } else {
      leftCascadeEl?.style.removeProperty("transform");
    }

    const leftContentShift = -Math.max(
      0,
      leftReveal - actionWidth / 2 - actionButtonWidth / 2,
    ) * armVisualProgress;
    visualOuterContentEl?.style.setProperty(
      "transform",
      `translate3d(${leftContentShift}px, 0, 0)`,
    );

    // The read action stays planted while partially revealed. Once armed, its
    // content catches the row edge while the neutral backdrop fills the reveal.
    const rightContentShift = Math.max(0, rightReveal - READ_ACTION_WIDTH) * armVisualProgress;
    rightContentEl?.style.setProperty(
      "transform",
      `translate3d(${rightContentShift}px, 0, 0)`,
    );
  }

  function runNativeFrame(timestamp: number) {
    nativeFrame = null;
    if (nativeSwipeQueued) {
      nativeSwipeQueued = false;
      nativeSwipeX = pendingNativeSwipeX;
    }
    const armStillMoving = sampleArmProgress(timestamp);
    paintNativeSwipe(nativeSwipeX);
    if (nativeSwipeQueued || armStillMoving) ensureNativeFrame();
  }

  function scheduleNativeSwipe(value: number) {
    pendingNativeSwipeX = value;
    nativeSwipeQueued = true;
    ensureNativeFrame();
  }

  function flushNativeSwipe() {
    if (nativeFrame !== null) window.cancelAnimationFrame(nativeFrame);
    nativeFrame = null;
    if (nativeSwipeQueued) {
      nativeSwipeQueued = false;
      nativeSwipeX = pendingNativeSwipeX;
    }
    sampleArmProgress(performance.now());
    paintNativeSwipe(nativeSwipeX);
  }

  function cancelNativePaint() {
    if (nativeFrame !== null) window.cancelAnimationFrame(nativeFrame);
    nativeFrame = null;
    nativeSwipeQueued = false;
  }

  function snapTo(target: number, notifyOwner = true) {
    swipeBatch.cancel();
    cancelNativePaint();
    flushSync(() => {
      swiping = false;
      armedSide = null;
      if (target < -0.5) swipeSide = "left";
      else if (target > 0.5) swipeSide = "right";
      else if (Math.abs(renderedSwipeOffset()) < 0.5) swipeSide = null;
      swipeX = target;
    });
    armVisualProgress = 0;
    armVisualFrom = 0;
    armVisualTarget = 0;
    if (nativeIos) paintNativeSwipe(target);
    if (nativeIos && onSwipeOpen) {
      if (Math.abs(target) > 0.5) onSwipeOpen(job.id);
      else if (notifyOwner) onSwipeOpen(null);
    }
  }

  function updateArmedState(value: number) {
    if (!nativeIos || !swiping) {
      armedSide = null;
      return;
    }
    const threshold = gestureRowWidth * FULL_SWIPE_RATIO;
    const nextArmedSide = value <= -threshold
      ? "left"
      : value >= threshold
        ? "right"
        : null;
    const leftBoundaryCrossed = (previousGestureX <= -threshold) !== (value <= -threshold);
    const rightBoundaryCrossed = (previousGestureX >= threshold) !== (value >= threshold);
    if (leftBoundaryCrossed) hapticLight();
    if (rightBoundaryCrossed) hapticLight();
    previousGestureX = value;
    if (nextArmedSide !== armedSide && (nextArmedSide || armedSide)) {
      beginArmMotion(nextArmedSide ? 1 : 0);
    }
    armedSide = nextArmedSide;
  }

  function applySwipeOffset(value: number) {
    swipeX = value;
    if (value < -0.5) swipeSide = "left";
    else if (value > 0.5) swipeSide = "right";
    else swipeSide = null;
    updateArmedState(value);
  }

  function renderedSwipeOffset(): number {
    if (!rowEl) return currentSwipeOffset();
    const transform = window.getComputedStyle(rowEl).transform;
    if (!transform || transform === "none") return 0;
    return new DOMMatrixReadOnly(transform).m41;
  }

  function syncSavedState(value: boolean) {
    onSaved?.(job.id, value);
  }

  function handleForegroundTransitionEnd(event: TransitionEvent) {
    if (event.propertyName === "transform" && Math.abs(swipeX) < 0.5) swipeSide = null;
  }

  function cancelPointerCapture() {
    const capturedPointer = pointerId;
    pointerId = null;
    axisLock = "pending";
    if (capturedPointer !== null && rowEl?.hasPointerCapture(capturedPointer)) {
      rowEl.releasePointerCapture(capturedPointer);
    }
  }

  $effect(() => {
    const owner = activeSwipeId;
    if (!nativeIos || owner === undefined || owner === job.id) return;
    if (!swiping && Math.abs(nativeSwipeX) < 0.5) return;
    cancelPointerCapture();
    snapTo(0, false);
  });

  onDestroy(() => {
    swipeBatch.cancel();
    cancelNativePaint();
  });

  async function slideOffAndRemove(action: () => Promise<unknown>): Promise<boolean> {
    if (dismissing) return false;
    dismissing = true;
    swipeSide = "left";
    armedSide = null;
    snapTo(-(rowEl?.offsetWidth ?? 420));
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

  function runFullLeftAction() {
    if (hasAdminAction) {
      runNativePrimaryAction();
      return;
    }
    if (hasSaveAction) {
      void save();
      return;
    }
    runNativePrimaryAction();
  }

  function settleSwipe(allowCommit = true) {
    const wasHorizontalSwipe = axisLock === "horizontal" || swiping;
    const releaseArmedSide = armedSide;
    pointerId = null;
    axisLock = "pending";
    if (!wasHorizontalSwipe) {
      swiping = false;
      return;
    }
    suppressClickUntil = performance.now() + 360;
    if (nativeIos) {
      if (!allowCommit) {
        snapTo(0);
        return;
      }
      if (allowCommit && releaseArmedSide === "left") {
        runFullLeftAction();
        return;
      }
      if (allowCommit && releaseArmedSide === "right") {
        void toggleReadState();
        return;
      }
      if (nativeSwipeX <= -openThreshold) {
        snapTo(-actionTotalWidth);
        return;
      }
      if (nativeSwipeX >= openThreshold) {
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
    startOffsetX = currentSwipeOffset();
    gestureRowWidth = rowEl?.offsetWidth ?? 420;
    axisLock = "pending";
    swiping = false;
    armedSide = null;
    armVisualDuration = nativeMotionDuration();
    armVisualProgress = 0;
    armVisualFrom = 0;
    armVisualTarget = 0;
    previousGestureX = currentSwipeOffset();
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
        if (Math.abs(currentSwipeOffset()) > 0.5) snapTo(0);
        return;
      }
      axisLock = "horizontal";
      swipeBatch.cancel();
      cancelNativePaint();
      const renderedOffset = renderedSwipeOffset();
      startOffsetX = renderedOffset;
      previousGestureX = renderedOffset;
      startX = e.clientX;
      onSwipeOpen?.(job.id);
      flushSync(() => {
        if (nativeIos) {
          nativeSwipeX = renderedOffset;
          swipeX = renderedOffset;
        } else {
          applySwipeOffset(renderedOffset);
        }
        swiping = true;
      });
      if (nativeIos) paintNativeSwipe(renderedOffset);
      rowMenuOpen = false;
      rowEl?.setPointerCapture(e.pointerId);
    }
    if (axisLock !== "horizontal" || !swiping) return;
    e.preventDefault();

    const desired = startOffsetX + e.clientX - startX;
    if (nativeIos) {
      const nextOffset = Math.max(-gestureRowWidth, Math.min(gestureRowWidth, desired));
      updateArmedState(nextOffset);
      scheduleNativeSwipe(nextOffset);
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
    if (nativeIos) flushNativeSwipe();
    else swipeBatch.flush();
    if (rowEl?.hasPointerCapture(e.pointerId)) rowEl.releasePointerCapture(e.pointerId);
    settleSwipe();
  }

  function onPointerCancel(e: PointerEvent) {
    if (pointerId !== e.pointerId) return;
    if (nativeIos) flushNativeSwipe();
    else swipeBatch.flush();
    if (rowEl?.hasPointerCapture(e.pointerId)) rowEl.releasePointerCapture(e.pointerId);
    settleSwipe(false);
  }

</script>

<div
  class="job-row-wrap"
  class:card-surface={surface === "card"}
  class:native-swipe={nativeIos}
  class:swiping
>
  {#if nativeIos && swipeActions}
    <div
      class="swipe-actions swipe-actions-right"
      class:active-side={swipeSide === "right"}
      class:interactive={rightActionInteractive}
      aria-hidden={!rightActionInteractive}
    >
      <button
        class="swipe-action read"
        style:width={`${READ_ACTION_WIDTH}px`}
        aria-label={`Mark this job as ${viewed ? "unread" : "read"}`}
        tabindex={rightActionInteractive ? 0 : -1}
        onclick={(event) => { event.stopPropagation(); void toggleReadState(); }}
        disabled={updatingRead}
      >
        <span bind:this={rightContentEl} class="swipe-action-content">
          <span class="swipe-action-icon" aria-hidden="true">
            {#if viewed}<EnvelopeSimple size={20} weight="bold" />{:else}<EnvelopeOpen size={20} weight="bold" />{/if}
          </span>
          <span>{viewed ? "Unread" : "Read"}</span>
        </span>
      </button>
    </div>
    {#if swipeActionCount > 0}
      <div
        class="swipe-actions swipe-actions-left"
        class:active-side={swipeSide === "left"}
        class:interactive={leftActionsInteractive}
        class:removing={dismissing}
        class:save-backdrop={!hasAdminAction && hasSaveAction && !dismissing}
        class:danger-backdrop={hasAdminAction && !dismissing}
        class:hide-backdrop={!hasAdminAction && !hasSaveAction && !dismissing}
        aria-hidden={!leftActionsInteractive}
      >
        {#if hasAdminAction}
          {#if hasSaveAction}
            <button
              bind:this={leftCascadeEl}
              class="swipe-action save cascade-action"
              style:width={`${actionButtonWidth}px`}
              aria-label={`${savedState ? "Unsave" : "Save"} this job`}
              tabindex={leftActionsInteractive ? 0 : -1}
              onclick={(event) => { event.stopPropagation(); void save(); }}
              disabled={saving}
            >
              <span bind:this={leftCascadeContentEl} class="swipe-action-content">
                <span class="swipe-action-icon" aria-hidden="true">
                  <BookmarkSimple size={20} weight={savedState ? "fill" : "bold"} />
                </span>
                <span>{savedState ? "Unsave" : "Save"}</span>
              </span>
            </button>
          {/if}
          <button
            bind:this={leftOuterEl}
            class="swipe-action danger outer-action"
            style:width={`${actionButtonWidth}px`}
            aria-label="Remove this job for everyone"
            tabindex={leftActionsInteractive ? 0 : -1}
            onclick={(event) => { event.stopPropagation(); runNativePrimaryAction(); }}
            disabled={dismissing}
          >
            <span bind:this={leftOuterContentEl} class="swipe-action-content">
              <span class="swipe-action-icon" aria-hidden="true">
                <Prohibit size={20} weight="bold" />
              </span>
              <span>Remove</span>
            </span>
          </button>
        {:else}
          {#if hasNativePrimaryAction}
            <button
              bind:this={leftCascadeEl}
              class="swipe-action hide"
              class:cascade-action={hasSaveAction}
              class:outer-action={!hasSaveAction}
              style:width={`${actionButtonWidth}px`}
              aria-label="Hide this job"
              tabindex={leftActionsInteractive ? 0 : -1}
              onclick={(event) => { event.stopPropagation(); runNativePrimaryAction(); }}
              disabled={dismissing}
            >
              <span bind:this={leftCascadeContentEl} class="swipe-action-content">
                <span class="swipe-action-icon" aria-hidden="true">
                  <EyeSlash size={20} weight="bold" />
                </span>
                <span>Hide</span>
              </span>
            </button>
          {/if}
          {#if hasSaveAction}
            <button
              bind:this={leftOuterEl}
              class="swipe-action save outer-action"
              style:width={`${actionButtonWidth}px`}
              aria-label={`${savedState ? "Unsave" : "Save"} this job`}
              tabindex={leftActionsInteractive ? 0 : -1}
              onclick={(event) => { event.stopPropagation(); void save(); }}
              disabled={saving}
            >
              <span bind:this={leftOuterContentEl} class="swipe-action-content">
                <span class="swipe-action-icon" aria-hidden="true">
                  <BookmarkSimple size={20} weight={savedState ? "fill" : "bold"} />
                </span>
                <span>{savedState ? "Unsave" : "Save"}</span>
              </span>
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  {:else if swipeActions && swipeX < -0.5}
    <div class="swipe-actions swipe-actions-left interactive" class:removing={dismissing}>
      {#if hasSaveAction}
        <button
          class="swipe-action save"
          style:width={`${actionButtonWidth}px`}
          aria-label={savedState ? "Job already saved" : "Save this job"}
          onclick={(event) => { event.stopPropagation(); void save(); }}
          disabled={saving}
        >
          <span class="swipe-action-icon" aria-hidden="true">
            <BookmarkSimple
              size={18}
              weight={savedState ? "fill" : "regular"}
            />
          </span>
          <span>{savedState ? "Saved" : "Save"}</span>
        </button>
      {/if}
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
    class="job-row-foreground"
    role="presentation"
    class:dismissing
    class:swiping
    style:transform={nativeIos ? undefined : `translate3d(${swipeX}px, 0, 0)`}
    style:transition={nativeIos ? undefined : swiping ? "none" : "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease"}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
    ontransitionend={handleForegroundTransitionEnd}
  >
    <svelte:element
      this={nativeIos ? "a" : "div"}
      class="job-row"
      class:viewed={viewed && !dismissing}
      class:has-menu={showRowMenu}
      href={nativeIos ? `#/jobs/${job.id}` : undefined}
      role={nativeIos ? undefined : "button"}
      tabindex={nativeIos ? undefined : 0}
      onclick={handleClick}
      onkeydown={(e: KeyboardEvent) => { if (!nativeIos && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleClick(); } }}
    >
      <div class="job-row__logo">
        <CompanyLogo name={job.company_name ?? "?"} domain={job.company_domain} size={24} />
      </div>
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

    {#if showRowMenu && (nativeIos || Math.abs(swipeX) < 0.5)}
      <div
        class="job-row__accessory"
        role="presentation"
        onpointerdown={(event) => event.stopPropagation()}
      >
        {#if nativeIos}
          <button
            class="icon-btn icon-btn-sm job-row__menu-trigger"
            aria-label="Actions for {job.title} at {job.company_name}"
            onclick={openNativeRowMenu}
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>
        {:else}
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
              {#if hasSaveAction && !savedState}
                <DropdownMenu.Item class="menu-item" disabled={saving} onSelect={() => void save()}>
                  <BookmarkSimple size={17} weight="regular" />
                  <span>Save</span>
                </DropdownMenu.Item>
              {/if}
              {#if !hasAdminAction}
                <DropdownMenu.Item class="menu-item" disabled={dismissing} onSelect={() => void dismiss()}>
                  <EyeSlash size={17} />
                  <span>Hide</span>
                </DropdownMenu.Item>
              {/if}
              {#if hasAdminAction}
                <DropdownMenu.Item class="menu-item danger" onSelect={() => onBlockRequest?.(job)}>
                  <Prohibit size={17} />
                  <span>Block for everyone</span>
                </DropdownMenu.Item>
              {/if}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        {/if}
        {#if nativeIos && savedState}
          <span class="job-row__saved-indicator" role="img" aria-label="Saved job" title="Saved">
            <BookmarkSimple size={14} weight="fill" aria-hidden="true" />
          </span>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .job-row-wrap {
    position: relative;
    overflow: hidden;
    border-bottom: 0.5px solid var(--color-line);
    background: var(--color-bg);
  }

  .job-row-foreground {
    position: relative;
    z-index: 1;
    background: var(--color-bg);
    touch-action: pan-y;
  }

  .job-row {
    display: grid;
    grid-template-columns: 24px 1fr;
    gap: 10px;
    align-items: center;
    padding: 10px var(--space-4);
    position: relative;
    background: transparent;
    overflow: hidden;
    cursor: pointer;
    color: inherit;
    text-decoration: none;
  }

  .native-swipe .job-row-foreground {
    transition: transform var(--duration-standard) var(--ease-standard);
  }

  .job-row-wrap.card-surface,
  .job-row-wrap.card-surface .job-row-foreground,
  .job-row-wrap.card-surface .job-row {
    background: var(--color-bg-elev);
  }

  /* Scoped to the active drag. Promoting every row in a long feed to its own
     compositor layer costs real memory on device, and buys nothing until the
     row actually moves — same pattern as .nav-foreground.is-swiping. */
  .job-row-foreground.swiping {
    will-change: transform;
  }
  .native-swipe .job-row-foreground.swiping { transition: none; }
  .job-row.viewed { opacity: 0.5; }
  .native-swipe .job-row.viewed { opacity: 1; }
  .native-swipe .job-row__logo,
  .native-swipe .job-row__body {
    opacity: 1;
    transition: opacity var(--duration-instant) var(--ease-standard);
  }
  .native-swipe .job-row.viewed .job-row__logo,
  .native-swipe .job-row.viewed .job-row__body { opacity: 0.5; }
  .job-row-foreground.dismissing { pointer-events: none; }
  .job-row.has-menu { padding-right: calc(var(--control-height-compact) + var(--space-3)); }

  .job-row__accessory {
    position: absolute;
    top: var(--space-1);
    right: var(--space-1);
    z-index: 1;
    width: var(--control-height-compact);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  :global(.job-row__menu-trigger) { flex: none; }

  .job-row__saved-indicator {
    width: 14px;
    height: 14px;
    flex: none;
    display: grid;
    place-items: center;
    color: var(--color-accent);
    pointer-events: none;
  }

  .job-row__logo { min-width: 0; }
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

  .swipe-action-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
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
    width: 100%;
    gap: 0;
    padding: 0;
    overflow: hidden;
    pointer-events: none;
    box-shadow: none;
    visibility: hidden;
    isolation: isolate;
  }

  .native-swipe .swipe-actions-left {
    inset-block: 0;
    inset-inline: auto 0;
  }

  .native-swipe .swipe-actions-right {
    inset-block: 0;
    inset-inline: 0 auto;
    background: var(--color-ink-2);
  }

  .native-swipe .swipe-actions.active-side { visibility: visible; }
  .native-swipe .swipe-actions.interactive { pointer-events: auto; }

  .native-swipe .swipe-actions-left.save-backdrop {
    background: var(--color-accent);
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
    padding: 0;
    border: 0;
    border-radius: 0;
    font-size: var(--fs-2xs);
    font-weight: 600;
    box-shadow: none;
    transition: width var(--duration-standard) var(--ease-standard);
  }

  .native-swipe .swipe-action-content {
    flex-direction: column;
    gap: 3px;
    transition: transform var(--duration-instant) var(--ease-standard);
  }

  .native-swipe.swiping .swipe-actions,
  .native-swipe.swiping .swipe-action,
  .native-swipe.swiping .swipe-action-content { transition: none; }

  .native-swipe.swiping .swipe-action-content,
  .native-swipe.swiping .cascade-action {
    will-change: transform;
  }

  .native-swipe .cascade-action {
    z-index: 1;
    transition:
      transform var(--duration-standard) var(--ease-standard),
      width var(--duration-standard) var(--ease-standard);
  }

  .native-swipe .outer-action {
    z-index: 2;
    overflow: visible;
  }
  .native-swipe.swiping .cascade-action { transition: none; }

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

</style>
