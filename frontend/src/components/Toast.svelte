<script lang="ts">
  import { fly } from "svelte/transition";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
  import Info from "phosphor-svelte/lib/Info";
  import Warning from "phosphor-svelte/lib/Warning";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import X from "phosphor-svelte/lib/X";
  import { feedback, type ToastItem } from "../lib/feedback.svelte";

  let { toast }: { toast: ToastItem } = $props();

  function iconFor(tone: ToastItem["tone"]) {
    if (tone === "success") return CheckCircle;
    if (tone === "warning") return Warning;
    if (tone === "error") return WarningCircle;
    return Info;
  }

  let Icon = $derived(iconFor(toast.tone));

  let dragX = $state(0);
  let dragging = $state(false);
  let elWidth = $state(0);
  let pointerId: number | null = null;
  let startX = 0;

  function onPointerDown(event: PointerEvent) {
    pointerId = event.pointerId;
    startX = event.clientX;
    dragging = true;
    elWidth = (event.currentTarget as HTMLElement).offsetWidth;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    feedback.pause(toast.id);
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging || pointerId !== event.pointerId) return;
    dragX = event.clientX - startX;
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragging || pointerId !== event.pointerId) return;
    dragging = false;
    pointerId = null;
    if (Math.abs(dragX) > elWidth * 0.35) {
      feedback.dismiss(toast.id);
      return;
    }
    dragX = 0;
    feedback.resume(toast.id);
  }
</script>

<div
  class="toast-message"
  class:success={toast.tone === "success"}
  class:warning={toast.tone === "warning"}
  class:error={toast.tone === "error"}
  class:dragging
  role={toast.tone === "error" ? "alert" : "status"}
  style:transform={dragX ? `translateX(${dragX}px)` : undefined}
  style:opacity={dragging ? Math.max(0.3, 1 - Math.abs(dragX) / (elWidth || 200)) : undefined}
  in:fly={{ y: 10, duration: 180 }}
  out:fly={{ y: 6, duration: 140 }}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onmouseenter={() => feedback.pause(toast.id)}
  onmouseleave={() => feedback.resume(toast.id)}
  onfocusin={() => feedback.pause(toast.id)}
  onfocusout={() => feedback.resume(toast.id)}
>
  <Icon class="toast-icon" size={18} weight="fill" />
  <span class="toast-copy">{toast.message}</span>
  {#if toast.action}
    <button
      type="button"
      class="toast-action"
      onclick={async () => {
        await toast.action?.run();
        feedback.dismiss(toast.id);
      }}
    >
      {toast.action.label}
    </button>
  {/if}
  {#if toast.duration === null}
    <button type="button" class="toast-close" aria-label="Dismiss message" onclick={() => feedback.dismiss(toast.id)}>
      <X size={16} />
    </button>
  {/if}
</div>

<style>
  .toast-message {
    width: min(100%, 440px);
    min-height: var(--tap-min);
    padding: 10px var(--space-3);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--color-line-2);
    border-radius: var(--radius-md);
    background: color-mix(in oklch, var(--color-bg-elev) 94%, transparent);
    color: var(--color-ink);
    box-shadow: var(--shadow-toast);
    backdrop-filter: blur(18px) saturate(130%);
    -webkit-backdrop-filter: blur(18px) saturate(130%);
    pointer-events: auto;
    touch-action: pan-y;
    transition: transform 200ms var(--ease-standard), opacity 200ms var(--ease-standard);
  }

  .toast-message.dragging {
    transition: none;
  }

  .toast-message.success { border-color: color-mix(in oklch, var(--color-good) 34%, var(--color-line)); }
  .toast-message.warning { border-color: color-mix(in oklch, var(--color-warn) 38%, var(--color-line)); }
  .toast-message.error { border-color: color-mix(in oklch, var(--color-bad) 38%, var(--color-line)); }

  :global(.toast-icon) { color: var(--color-ink-3); }
  .success :global(.toast-icon) { color: var(--color-good); }
  .warning :global(.toast-icon) { color: var(--color-warn); }
  .error :global(.toast-icon) { color: var(--color-bad); }

  .toast-copy {
    min-width: 0;
    font-size: var(--fs-sm);
    font-weight: 500;
    line-height: 1.35;
  }

  .toast-action,
  .toast-close {
    min-height: 32px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-accent);
    cursor: pointer;
  }

  .toast-action {
    padding: 0 var(--space-2);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  .toast-close {
    width: 32px;
    padding: 0;
    display: grid;
    place-items: center;
    color: var(--color-ink-3);
  }

  .toast-action:hover,
  .toast-close:hover { background: var(--color-bg-sunken); }
</style>
