<script lang="ts">
  import type { Snippet } from "svelte";
  import { focusTrap } from "../lib/focus-trap";
  import { registerModalOpen } from "../lib/modal-stack.svelte";

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

  $effect(() => registerModalOpen());

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
    dragY = Math.max(0, event.clientY - startY);
  }

  function onHandlePointerUp(event: PointerEvent) {
    if (!dragging || pointerId !== event.pointerId) return;
    dragging = false;
    pointerId = null;
    const cardHeight = cardEl?.offsetHeight ?? 400;
    if (dragY > cardHeight * 0.3 || velocity > 0.5) {
      requestClose();
    }
    dragY = 0;
  }

  let backdropOpacity = $derived(
    dragging && cardEl ? Math.max(0.4, 1 - dragY / cardEl.offsetHeight) : 1
  );
</script>

<div
  class="modal-backdrop"
  role="presentation"
  style:opacity={backdropOpacity}
  onclick={requestClose}
  onkeydown={(event) => { if (event.key === "Escape") requestClose(); }}
>
  <div
    bind:this={cardEl}
    class="modal-card"
    class:dragging
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-labelledby={titleId}
    tabindex="-1"
    style="--modal-max-width: {maxWidth}px; --modal-drag-y: {dragY}px;"
    onclick={(event) => event.stopPropagation()}
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
