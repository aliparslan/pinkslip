<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    message,
    compact = false,
    icon,
    actions,
  }: {
    title: string;
    message?: string;
    compact?: boolean;
    icon?: Snippet;
    actions?: Snippet;
  } = $props();
</script>

<section class="empty-state-panel" class:compact>
  {#if icon}
    <div class="empty-state-panel__icon" aria-hidden="true">{@render icon()}</div>
  {/if}
  <h2>{title}</h2>
  {#if message}<p>{message}</p>{/if}
  {#if actions}<div class="empty-state-panel__actions">{@render actions()}</div>{/if}
</section>

<style>
  .empty-state-panel {
    width: 100%;
    max-width: 360px;
    margin: 0 auto;
    padding: var(--space-10) var(--space-6);
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--color-ink-3);
    text-align: center;
  }

  .empty-state-panel__icon {
    width: 44px;
    height: 44px;
    margin-bottom: var(--space-3);
    display: grid;
    place-items: center;
    border-radius: var(--radius-full);
    background: var(--color-control-bg);
    color: var(--color-ink-2);
  }

  h2 {
    margin: 0;
    color: var(--color-ink-2);
    font-family: var(--font-display);
    font-size: var(--fs-xl);
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.2;
    text-wrap: balance;
  }

  p {
    max-width: 32ch;
    margin: var(--space-2) 0 0;
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .empty-state-panel__actions {
    margin-top: var(--space-5);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
  }

  .empty-state-panel.compact {
    max-width: none;
    padding: var(--space-5) var(--space-4);
  }

  .empty-state-panel.compact h2 {
    font-size: var(--fs-md);
    letter-spacing: -0.005em;
  }

  .empty-state-panel.compact p {
    margin-top: var(--space-1);
    font-size: var(--fs-xs);
  }
</style>
