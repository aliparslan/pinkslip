// Svelte action: drag a bottom sheet down from anywhere to dismiss it. A drag
// begins only after its direction is clear and the touched scroll area is at
// the top, so upward gestures still scroll the sheet's content normally.
// `base` preserves any static transform the sheet already has (e.g. centering).

import { hapticLight } from "./haptics";
import { createFrameBatch, nextFrame, waitForAnimations } from "./motion";
import { isIosApp } from "./platform";

export function dragDismiss(
  node: HTMLElement,
  opts: { onDismiss: () => void; base?: string }
) {
  const base = opts.base ?? "";
  const DISMISS_AT = 110; // px dragged before release closes the sheet
  const DIRECTION_LOCK_AT = 7;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let dragging = false;
  let scrollable: HTMLElement | null = null;
  const nativeIos = isIosApp();

  const apply = (ty: number) => {
    node.style.transform = `${base} translateY(${ty}px)`.trim();
  };
  const paintBatch = createFrameBatch(apply, nativeIos);

  function nearestScrollable(target: EventTarget | null): HTMLElement | null {
    let element = target instanceof HTMLElement ? target : null;
    while (element && element !== node) {
      const style = window.getComputedStyle(element);
      const canScroll = /(auto|scroll)/.test(style.overflowY)
        && element.scrollHeight > element.clientHeight;
      if (canScroll) return element;
      element = element.parentElement;
    }
    return null;
  }

  function onStart(e: TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    scrollable = nearestScrollable(e.target);
    tracking = !scrollable || scrollable.scrollTop <= 0;
    dragging = false;
  }

  function onMove(e: TouchEvent) {
    if (!tracking) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (!dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DIRECTION_LOCK_AT) return;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        tracking = false;
        return;
      }
      // A nested body may have moved between touchstart and direction lock.
      if (scrollable && scrollable.scrollTop > 0) {
        tracking = false;
        return;
      }
      dragging = true;
      node.style.transition = "none";
    }

    if (dy <= 0) {
      return;
    }
    e.preventDefault();
    paintBatch.schedule(dy);
  }

  async function onEnd(e: TouchEvent) {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    paintBatch.flush();
    const t = e.changedTouches[0];
    const dy = t ? t.clientY - startY : 0;
    node.style.transition = "transform 0.26s cubic-bezier(0.2, 0.7, 0.2, 1)";
    if (dy > DISMISS_AT) {
      hapticLight();
      apply(window.innerHeight);
      if (!nativeIos) {
        window.setTimeout(opts.onDismiss, 200);
      } else {
        await nextFrame();
        await waitForAnimations([node], 320);
        opts.onDismiss();
      }
    } else {
      node.style.transform = base;
    }
  }

  node.addEventListener("touchstart", onStart, { passive: true });
  node.addEventListener("touchmove", onMove, { passive: false });
  node.addEventListener("touchend", onEnd, { passive: true });
  node.addEventListener("touchcancel", onEnd, { passive: true });

  return {
    destroy() {
      paintBatch.cancel();
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    },
  };
}
