<script lang="ts">
  import Check from "phosphor-svelte/lib/Check";
  import CircleNotch from "phosphor-svelte/lib/CircleNotch";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import type { SavePhase } from "../lib/task-presentation.svelte";

  let {
    phase,
    savedLabel = "Saved",
  }: {
    phase: SavePhase;
    savedLabel?: string;
  } = $props();

  let message = $derived(
    phase === "dirty" ? "Unsaved"
      : phase === "saving" ? "Saving"
        : phase === "saved" ? savedLabel
          : phase === "error" ? "Couldn’t save"
            : ""
  );
</script>

<span class="save-status" class:error={phase === "error"} role="status" aria-live="polite" aria-atomic="true">
  <span class="save-status-content" class:visible={message.length > 0}>
    {#if phase === "saving"}
      <CircleNotch class="save-status-spinner" size={13} />
    {:else if phase === "saved"}
      <Check size={13} />
    {:else if phase === "error"}
      <WarningCircle size={13} />
    {/if}
    <span>{message}</span>
  </span>
</span>

<style>
  .save-status {
    min-width: 104px;
    min-height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
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

  :global(.save-status-spinner) {
    animation: save-status-spin 0.9s linear infinite;
  }

  @keyframes save-status-spin {
    to { transform: rotate(360deg); }
  }
</style>
