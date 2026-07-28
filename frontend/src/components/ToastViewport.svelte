<script lang="ts">
  import { fly } from "svelte/transition";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
  import Info from "phosphor-svelte/lib/Info";
  import Warning from "phosphor-svelte/lib/Warning";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import X from "phosphor-svelte/lib/X";
  import { feedback, type ToastTone } from "../lib/feedback.svelte";

  function iconFor(tone: ToastTone) {
    if (tone === "success") return CheckCircle;
    if (tone === "warning") return Warning;
    if (tone === "error") return WarningCircle;
    return Info;
  }
</script>

<div class="toast-viewport" aria-live="polite" aria-relevant="additions text">
  {#each feedback.visible as toast (toast.id)}
    {@const Icon = iconFor(toast.tone)}
    <div
      class="toast-message"
      class:success={toast.tone === "success"}
      class:warning={toast.tone === "warning"}
      class:error={toast.tone === "error"}
      role={toast.tone === "error" ? "alert" : "status"}
      in:fly={{ y: 10, duration: 180 }}
      out:fly={{ y: 6, duration: 140 }}
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
  {/each}
</div>

<style>
  .toast-viewport {
    position: fixed;
    left: var(--space-4);
    right: var(--space-4);
    bottom: var(--overlay-bottom-offset);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: var(--space-2);
    pointer-events: none;
  }

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

  @media (min-width: 900px) {
    .toast-viewport {
      left: auto;
      right: var(--space-6);
      bottom: var(--space-6);
      align-items: flex-end;
    }
  }
</style>
