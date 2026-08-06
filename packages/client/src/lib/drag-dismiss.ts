// Svelte action: drag a bottom sheet down from anywhere to dismiss it. The
// gesture is claimed only after downward intent is clear and the touched scroll
// area is already at the top, so normal sheet scrolling remains native.

import {
  createFrameBatch,
  nextFrame,
  prefersReducedMotion,
  waitForAnimations,
} from "./motion";
import { isIosApp } from "./platform";

const DISMISS_AT = 110;
const DIRECTION_LOCK_AT = 7;
const DISMISS_VELOCITY = 0.55;

export interface DragDismissOptions {
  onDismiss: () => void;
  base?: string;
  disabled?: boolean;
  startSelector?: string;
  onOffsetChange?: (offset: number, sheetHeight: number) => void;
}

export function sheetDragIntent(
  dx: number,
  dy: number,
  scrollTop: number,
): "pending" | "drag" | "scroll" {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DIRECTION_LOCK_AT) return "pending";
  if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || scrollTop > 0) return "scroll";
  return "drag";
}

export function shouldDismissSheet(offset: number, height: number, velocity: number): boolean {
  return offset > Math.min(DISMISS_AT, height * 0.3) || velocity > DISMISS_VELOCITY;
}

export function dragDismiss(node: HTMLElement, initialOptions: DragDismissOptions) {
  let options = initialOptions;
  let startX = 0;
  let startY = 0;
  let dragOriginY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let offset = 0;
  let tracking = false;
  let dragging = false;
  let dismissing = false;
  let pointerId: number | null = null;
  let scrollable: HTMLElement | null = null;
  let settleVersion = 0;
  const nativeIos = isIosApp();

  const sheetHeight = () => node.offsetHeight || window.innerHeight;

  function apply(nextOffset: number) {
    offset = Math.max(0, nextOffset);
    const base = options.base ?? "";
    node.style.transform = `${base} translateY(${offset}px)`.trim();
    options.onOffsetChange?.(offset, sheetHeight());
  }

  const paintBatch = createFrameBatch(apply, nativeIos);

  function nearestScrollable(target: EventTarget | null): HTMLElement | null {
    let element = target instanceof HTMLElement ? target : null;
    while (element) {
      const style = window.getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
        return element;
      }
      if (element === node) break;
      element = element.parentElement;
    }
    return null;
  }

  function renderedOffset(): number {
    const transform = window.getComputedStyle(node).transform;
    return !transform || transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
  }

  function resetInlineMotion() {
    node.style.transition = "";
    node.style.willChange = "";
  }

  function canStartFrom(target: EventTarget | null): boolean {
    return !options.startSelector
      || (target instanceof Element && Boolean(target.closest(options.startSelector)));
  }

  function beginTracking(clientX: number, clientY: number, target: EventTarget | null) {
    startX = clientX;
    startY = lastY = clientY;
    lastT = performance.now();
    velocity = 0;
    scrollable = nearestScrollable(target);
    tracking = true;
    dragging = false;
  }

  async function settle(shouldDismiss: boolean) {
    const version = ++settleVersion;
    dismissing = shouldDismiss;
    node.style.transition = "transform var(--duration-standard) var(--ease-standard)";
    await nextFrame();
    if (version !== settleVersion) return;
    apply(shouldDismiss ? Math.max(window.innerHeight, sheetHeight() + 80) : 0);
    await waitForAnimations([node], prefersReducedMotion() ? 20 : 320);
    if (version !== settleVersion) return;

    if (shouldDismiss) {
      options.onDismiss();
      return;
    }
    dismissing = false;
    resetInlineMotion();
    node.style.transform = options.base ?? "";
    options.onOffsetChange?.(0, sheetHeight());
  }

  function onStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch || event.touches.length !== 1 || options.disabled || dismissing) return;
    if (!canStartFrom(event.target)) return;
    beginTracking(touch.clientX, touch.clientY, event.target);
  }

  function moveTracking(clientX: number, clientY: number, preventDefault: () => void) {
    if (!tracking) return;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (!dragging) {
      const intent = sheetDragIntent(dx, dy, scrollable?.scrollTop ?? 0);
      if (intent === "pending") return;
      if (intent === "scroll") {
        tracking = false;
        return;
      }
      const visibleOffset = Math.max(0, renderedOffset());
      settleVersion += 1;
      dragOriginY = startY - visibleOffset;
      dragging = true;
      node.style.transition = "none";
      node.style.willChange = "transform";
      apply(visibleOffset);
    }

    preventDefault();
    const now = performance.now();
    const dt = now - lastT;
    if (dt > 0) velocity = (clientY - lastY) / dt;
    lastY = clientY;
    lastT = now;
    paintBatch.schedule(clientY - dragOriginY);
  }

  function onMove(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;
    moveTracking(touch.clientX, touch.clientY, () => event.preventDefault());
  }

  function finish(cancelled: boolean) {
    if (!tracking) return;
    tracking = false;
    scrollable = null;
    if (!dragging) return;
    dragging = false;
    paintBatch.flush();
    void settle(!cancelled && shouldDismissSheet(offset, sheetHeight(), velocity));
  }

  const onEnd = () => finish(false);
  const onCancel = () => finish(true);

  function onPointerStart(event: PointerEvent) {
    // Pointer parity is only for the legacy web modal handle. Native sheets and
    // the feed filter use touch tracking across the surface; capturing ordinary
    // mouse clicks there would steal controls before intent is known.
    if (!options.startSelector || event.pointerType === "touch" || event.button !== 0 || options.disabled || dismissing) return;
    if (!canStartFrom(event.target)) return;
    pointerId = event.pointerId;
    beginTracking(event.clientX, event.clientY, event.target);
    node.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    moveTracking(event.clientX, event.clientY, () => event.preventDefault());
  }

  function finishPointer(event: PointerEvent, cancelled: boolean) {
    if (pointerId !== event.pointerId) return;
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    pointerId = null;
    finish(cancelled);
  }

  const onPointerEnd = (event: PointerEvent) => finishPointer(event, false);
  const onPointerCancel = (event: PointerEvent) => finishPointer(event, true);

  node.addEventListener("touchstart", onStart, { passive: true });
  node.addEventListener("touchmove", onMove, { passive: false });
  node.addEventListener("touchend", onEnd, { passive: true });
  node.addEventListener("touchcancel", onCancel, { passive: true });
  node.addEventListener("pointerdown", onPointerStart);
  node.addEventListener("pointermove", onPointerMove);
  node.addEventListener("pointerup", onPointerEnd);
  node.addEventListener("pointercancel", onPointerCancel);

  return {
    update(nextOptions: DragDismissOptions) {
      options = nextOptions;
      if (!options.disabled || (!tracking && !dragging && !dismissing)) return;
      tracking = false;
      dragging = false;
      dismissing = false;
      pointerId = null;
      paintBatch.cancel();
      void settle(false);
    },
    destroy() {
      settleVersion += 1;
      dismissing = false;
      paintBatch.cancel();
      resetInlineMotion();
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onCancel);
      node.removeEventListener("pointerdown", onPointerStart);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerEnd);
      node.removeEventListener("pointercancel", onPointerCancel);
    },
  };
}
