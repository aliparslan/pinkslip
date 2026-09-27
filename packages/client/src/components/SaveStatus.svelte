<script lang="ts">
  import Check from "phosphor-svelte/lib/Check";
  import CircleNotch from "phosphor-svelte/lib/CircleNotch";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import type { SavePhase } from "../lib/task-presentation.svelte";

  let {
    phase,
    savedLabel = "Saved",
    compact = false,
    errorMessage,
    onRetry,
  }: {
    phase: SavePhase;
    savedLabel?: string;
    compact?: boolean;
    errorMessage?: string | null;
    onRetry?: () => void | Promise<void>;
  } = $props();

  let message = $derived(
    phase === "dirty" ? "Unsaved"
      : phase === "saving" ? "Saving…"
        : phase === "saved" ? savedLabel
          : phase === "error" ? "Not saved"
            : ""
  );
</script>

<span class="save-status" class:compact class:error={phase === "error"}>
  <span
    class="save-status-content"
    class:visible={message.length > 0}
    role={phase === "error" ? undefined : "status"}
    aria-live={phase === "error" ? undefined : "polite"}
    aria-atomic={phase === "error" ? undefined : "true"}
  >
    {#if phase === "saving"}
      <CircleNotch class="save-status-spinner" size={13} aria-hidden="true" />
    {:else if phase === "saved"}
      <Check size={13} aria-hidden="true" />
    {:else if phase === "error"}
      <WarningCircle size={13} aria-hidden="true" />
    {/if}
    <span class:compact-label={compact && (phase === "saving" || phase === "saved")}>{message}</span>
  </span>
  {#if phase === "error" && onRetry}
    <button
      type="button"
      class="save-status-retry"
      aria-label={errorMessage ? `Save failed: ${errorMessage}. Retry saving` : "Save failed. Retry saving"}
      onclick={() => void onRetry?.()}
    >Retry</button>
  {/if}
</span>

<style>
  .save-status {
    min-width: 64px;
    min-height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
  }

  .save-status.compact {
    min-width: 52px;
  }

  .save-status.error {
    color: var(--color-bad);
  }

  .save-status-content {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    opacity: 0;
    transform: translateY(2px);
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }

  .save-status-content.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .compact-label {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .save-status-retry {
    min-height: var(--control-height-small);
    margin-inline-start: var(--space-1);
    padding-inline: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: currentColor;
    font: 600 var(--fs-xs) / 1 var(--font-sans);
    cursor: pointer;
  }

  .save-status-retry:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  :global(.save-status-spinner) {
    animation: save-status-spin 0.9s linear infinite;
  }

  @keyframes save-status-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .save-status-content {
      transform: none;
    }
  }
</style>
