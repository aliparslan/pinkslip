<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { focusTrap } from "../lib/focus-trap";
  import { registerModalOpen } from "../lib/modal-stack.svelte";
  import { createFrameBatch, nextFrame, waitForAnimations } from "../lib/motion";
  import { isIosApp } from "../lib/platform";

  let {
    title,
    subtitle = "",
    busy = false,
    maxWidth = 380,
    onclose,
    children,
  }: {
    title: string;
    subtitle?: string;
    busy?: boolean;
    maxWidth?: number;
    onclose: () => void;
    children: Snippet;
  } = $props();

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;

  let backdropEl: HTMLElement | undefined = $state();

  $effect(() => {
    if (!backdropEl) return;
    return registerModalOpen(backdropEl);
  });

  function requestClose() {
    if (!busy) onclose();
  }

  let cardEl: HTMLElement | undefined = $state();
  let dragY = $state(0);
  let dragging = $state(false);
  let pointerId: number | null = null;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let closing = $state(false);
  const nativeIos = isIosApp();
  const dragBatch = createFrameBatch<number>((value) => { dragY = value; }, nativeIos);

  function onHandlePointerDown(event: PointerEvent) {
    if (busy) return;
    pointerId = event.pointerId;
    startY = lastY = event.clientY;
    lastT = performance.now();
    velocity = 0;
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onHandlePointerMove(event: PointerEvent) {
    if (!dragging || pointerId !== event.pointerId) return;
    const now = performance.now();
    const dt = now - lastT;
    if (dt > 0) velocity = (event.clientY - lastY) / dt;
    lastY = event.clientY;
    lastT = now;
    const next = Math.max(0, event.clientY - startY);
    dragBatch.schedule(next);
  }

  async function onHandlePointerUp(event: PointerEvent) {
    if (!dragging || pointerId !== event.pointerId) return;
    dragBatch.flush();
    dragging = false;
    pointerId = null;
    const cardHeight = cardEl?.offsetHeight ?? 400;
    if (dragY > cardHeight * 0.3 || velocity > 0.5) {
      if (!nativeIos) {
        requestClose();
      } else {
        closing = true;
        dragY = cardHeight + 80;
        await nextFrame();
        await waitForAnimations([cardEl], 300);
        requestClose();
      }
      return;
    }
    dragY = 0;
  }

  let backdropOpacity = $derived(
    nativeIos
      ? (dragging || closing) && cardEl ? Math.max(0, 1 - dragY / cardEl.offsetHeight) : 1
      : dragging && cardEl ? Math.max(0.4, 1 - dragY / cardEl.offsetHeight) : 1
  );
</script>

<div
  bind:this={backdropEl}
  class="modal-backdrop"
  role="presentation"
  style:opacity={backdropOpacity}
  in:fade={{ duration: 160 }}
  out:fade={{ duration: 120 }}
  onclick={(event) => { if (event.target === event.currentTarget) requestClose(); }}
  onkeydown={(event) => { if (event.key === "Escape") requestClose(); }}
>
  <div
    class="modal-motion-shell"
    style="--modal-max-width: {maxWidth}px;"
    in:fly={{ y: 12, duration: 220 }}
    out:fly={{ y: 10, duration: 140 }}
  >
    <div
      bind:this={cardEl}
      class="modal-card"
      class:dragging
      class:closing
      role="dialog"
      aria-modal="true"
      use:focusTrap
      aria-labelledby={titleId}
      tabindex="-1"
      style="--modal-drag-y: {dragY}px;"
      onkeydown={(event) => { if (event.key === "Escape") requestClose(); }}
    >
      <div
        class="modal-drag-handle"
        aria-hidden="true"
        onpointerdown={onHandlePointerDown}
        onpointermove={onHandlePointerMove}
        onpointerup={onHandlePointerUp}
        onpointercancel={onHandlePointerUp}
      ></div>
      <h2 id={titleId} class="h-display modal-title">{title}</h2>
      {#if subtitle}
        <p class="modal-subtitle">{subtitle}</p>
      {/if}
      {@render children()}
    </div>
  </div>
</div>
