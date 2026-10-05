<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { Dialog } from "bits-ui";
  import { dragDismiss } from "../lib/drag-dismiss";
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

  const nativeIos = isIosApp();

  let backdropEl: HTMLElement | undefined = $state();
  let backdropOpacity = $state(1);

  let releaseModal: (() => void) | undefined;
  onDestroy(() => releaseModal?.());

  function requestClose() {
    if (!busy) onclose();
  }

  function updateBackdropOpacity(offset: number, sheetHeight: number) {
    const nextOpacity = 1 - offset / Math.max(1, sheetHeight);
    backdropOpacity = nativeIos ? Math.max(0, nextOpacity) : Math.max(0.4, nextOpacity);
  }
</script>

<Dialog.Root open={true} onOpenChange={(open) => { if (!open) requestClose(); }}>
<Dialog.Portal>
<Dialog.Overlay forceMount>
{#snippet child({ props })}
<div
  {...props}
  bind:this={backdropEl}
  class="modal-backdrop"
  role="presentation"
  style:--modal-scrim-opacity={`${backdropOpacity}`}
  in:fade={{ duration: motionDuration(160) }}
  out:fade={{ duration: motionDuration(120) }}
>
  <div
    class="modal-motion-shell"
    style="--modal-max-width: {maxWidth}px;"
    in:fly={{ y: motionDistance(12), duration: motionDuration(220) }}
    out:fly={{ y: motionDistance(10), duration: motionDuration(140) }}
  >
    <Dialog.Content
      forceMount
      onEscapeKeydown={(event) => { if (busy) event.preventDefault(); }}
      onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
      onOpenAutoFocus={(event) => {
        // Bits captures the opener before this callback. Making the shell inert
        // earlier would blur that opener before the library can remember it.
        if (backdropEl) releaseModal = registerModalOpen(backdropEl);
        if (initialFocus === "dialog") {
          event.preventDefault();
          backdropEl?.querySelector<HTMLElement>(".modal-card")?.focus();
        }
      }}
      onCloseAutoFocus={() => {
        // Restore the shell before Bits returns focus to the remembered opener.
        releaseModal?.();
        releaseModal = undefined;
      }}
    >
    {#snippet child({ props: contentProps })}
    <div
      {...contentProps}
      class="modal-card"
      use:dragDismiss={{
        onDismiss: requestClose,
        disabled: busy,
        startSelector: ".modal-drag-region",
        onOffsetChange: updateBackdropOpacity,
      }}
    >
      <div class="modal-drag-region">
        <div class="modal-drag-handle" aria-hidden="true"></div>
        <Dialog.Title level={2} class="h-display modal-title">{title}</Dialog.Title>
        {#if subtitle}
          <Dialog.Description class="modal-subtitle">{subtitle}</Dialog.Description>
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
    {/snippet}
    </Dialog.Content>
  </div>
</div>
{/snippet}
</Dialog.Overlay>
</Dialog.Portal>
</Dialog.Root>

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
