<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { dragDismiss } from "../lib/drag-dismiss";
  import { focusTrap } from "../lib/focus-trap";
  import { registerModalOpen } from "../lib/modal-stack.svelte";
  import { isIosApp } from "../lib/platform";
  import { motionDistance, motionDuration } from "../lib/motion";
  import X from "phosphor-svelte/lib/X";

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
  in:fade={{ duration: motionDuration(160) }}
  out:fade={{ duration: motionDuration(120) }}
  onclick={(event) => { if (event.target === event.currentTarget) requestClose(); }}
>
  <div
    class="modal-motion-shell"
    style="--modal-max-width: {maxWidth}px;"
    in:fly={{ y: motionDistance(12), duration: motionDuration(220) }}
    out:fly={{ y: motionDistance(10), duration: motionDuration(140) }}
  >
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      use:focusTrap={{ initialFocus }}
      use:dragDismiss={{
        onDismiss: requestClose,
        disabled: busy,
        startSelector: ".modal-drag-region",
        onOffsetChange: updateBackdropOpacity,
      }}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      tabindex="-1"
      onkeydown={(event) => { if (event.key === "Escape") requestClose(); }}
    >
      <div class="modal-drag-region">
        <div class="modal-drag-handle" aria-hidden="true"></div>
        <h2 id={titleId} class="h-display modal-title">{title}</h2>
        {#if subtitle}
          <p id={subtitleId} class="modal-subtitle">{subtitle}</p>
        {/if}
      </div>
      {@render children()}
      <button
        type="button"
        class="modal-close"
        aria-label="Close"
        disabled={busy}
        onclick={requestClose}
      >
        <X size={20} weight="regular" aria-hidden="true" />
      </button>
    </div>
  </div>
</div>

<style>
  .modal-card { position: relative; }

  .modal-drag-region {
    padding-inline-end: calc(var(--tap-min) - var(--space-1));
  }

  .modal-close {
    position: absolute;
    top: var(--space-3);
    inset-inline-end: var(--space-3);
    width: var(--tap-min);
    height: var(--tap-min);
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink-3);
    cursor: pointer;
  }

  .modal-close:hover {
    background: var(--color-bg-sunken);
    color: var(--color-ink);
  }

  .modal-close:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @media (max-width: 640px) {
    .modal-close {
      top: var(--space-2);
      inset-inline-end: var(--space-2);
    }
  }
</style>
