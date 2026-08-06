<script lang="ts">
  import ArrowClockwise from "phosphor-svelte/lib/ArrowClockwise";
  import WifiSlash from "phosphor-svelte/lib/WifiSlash";

  let {
    title = "Unable to load",
    message = "Check your connection and try again.",
    retryLabel = "Try again",
    onRetry,
    secondaryLabel,
    onSecondary,
  }: {
    title?: string;
    message?: string;
    retryLabel?: string;
    onRetry?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  } = $props();
</script>

<section class="page-failure" role="alert">
  <div class="page-failure__icon" aria-hidden="true">
    <WifiSlash size={24} weight="bold" />
  </div>
  <h2>{title}</h2>
  <p>{message}</p>
  {#if onRetry || onSecondary}
    <div class="page-failure__actions">
      {#if onRetry}
        <button type="button" class="btn-secondary" onclick={onRetry}>
          <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
          {retryLabel}
        </button>
      {/if}
      {#if onSecondary}
        <button type="button" class="text-button" onclick={onSecondary}>{secondaryLabel ?? "Go back"}</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .page-failure {
    width: 100%;
    max-width: 360px;
    margin: 0 auto;
    padding: var(--space-10) var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--color-ink);
    text-align: center;
  }

  .page-failure__icon {
    width: 48px;
    height: 48px;
    margin-bottom: var(--space-4);
    display: grid;
    place-items: center;
    border-radius: var(--radius-full);
    background: var(--color-control-bg);
    color: var(--color-ink-2);
  }

  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-xl);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.2;
    text-wrap: balance;
  }

  p {
    max-width: 30ch;
    margin: var(--space-2) 0 var(--space-5);
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .page-failure :global(.btn-secondary) {
    min-width: 132px;
  }

  .page-failure__actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
</style>
