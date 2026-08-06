<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { dragDismiss } from "../lib/drag-dismiss";
  import { focusTrap } from "../lib/focus-trap";
  import { registerModalOpen } from "../lib/modal-stack.svelte";
  import { isIosApp } from "../lib/platform";

  let {
    title,
    subtitle = "",
    busy = false,
    maxWidth = 380,
    initialFocus = "first",
    onclose,
    children,
  }: {
    title: string;
    subtitle?: string;
    busy?: boolean;
    maxWidth?: number;
    initialFocus?: "first" | "dialog";
    onclose: () => void;
    children: Snippet;
  } = $props();

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  const subtitleId = `${titleId}-subtitle`;
  const nativeIos = isIosApp();

  let backdropEl: HTMLElement | undefined = $state();
  let backdropOpacity = $state(1);

  $effect(() => {
    if (!backdropEl) return;
    return registerModalOpen(backdropEl);
  });

  function requestClose() {
    if (!busy) onclose();
  }

  function updateBackdropOpacity(offset: number, sheetHeight: number) {
    const nextOpacity = 1 - offset / Math.max(1, sheetHeight);
    backdropOpacity = nativeIos ? Math.max(0, nextOpacity) : Math.max(0.4, nextOpacity);
  }
</script>

<div
  bind:this={backdropEl}
  class="modal-backdrop"
  role="presentation"
  style:--modal-scrim-opacity={`${backdropOpacity}`}
  in:fade={{ duration: 160 }}
  out:fade={{ duration: 120 }}
  onclick={(event) => { if (event.target === event.currentTarget) requestClose(); }}
>
  <div
    class="modal-motion-shell"
    style="--modal-max-width: {maxWidth}px;"
    in:fly={{ y: 12, duration: 220 }}
    out:fly={{ y: 10, duration: 140 }}
  >
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      use:focusTrap={{ initialFocus }}
      use:dragDismiss={{
        onDismiss: requestClose,
        disabled: busy,
        startSelector: nativeIos ? undefined : ".modal-drag-handle",
        onOffsetChange: updateBackdropOpacity,
      }}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      tabindex="-1"
      onkeydown={(event) => { if (event.key === "Escape") requestClose(); }}
    >
      <div class="modal-drag-handle" aria-hidden="true"></div>
      <h2 id={titleId} class="h-display modal-title">{title}</h2>
      {#if subtitle}
        <p id={subtitleId} class="modal-subtitle">{subtitle}</p>
      {/if}
      {@render children()}
    </div>
  </div>
</div>
