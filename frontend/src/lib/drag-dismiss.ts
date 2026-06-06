// Svelte action: drag a bottom sheet down (from its top / grabber area) to
// dismiss it. Starts only near the top so it never fights a scrollable body.
// `base` preserves any static transform the sheet already has (e.g. centering).

import { hapticLight } from "./haptics";

export function dragDismiss(
  node: HTMLElement,
  opts: { onDismiss: () => void; base?: string }
) {
  const base = opts.base ?? "";
  const DISMISS_AT = 110; // px dragged before release closes the sheet
  const GRAB_ZONE = 72; // only start a drag this far from the sheet's top
  let startY = 0;
  let dragging = false;

  const apply = (ty: number) => {
    node.style.transform = `${base} translateY(${ty}px)`.trim();
  };

  function onStart(e: TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    if (t.clientY - node.getBoundingClientRect().top > GRAB_ZONE) return;
    startY = t.clientY;
    dragging = true;
    node.style.transition = "none";
  }

  function onMove(e: TouchEvent) {
    if (!dragging) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - startY;
    if (dy <= 0) {
      apply(0);
      return;
    }
    e.preventDefault();
    apply(dy);
  }

  function onEnd(e: TouchEvent) {
    if (!dragging) return;
    dragging = false;
    const t = e.changedTouches[0];
    const dy = t ? t.clientY - startY : 0;
    node.style.transition = "transform 0.26s cubic-bezier(0.2, 0.7, 0.2, 1)";
    if (dy > DISMISS_AT) {
      hapticLight();
      apply(window.innerHeight);
      window.setTimeout(opts.onDismiss, 200);
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
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    },
  };
}
