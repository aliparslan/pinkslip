<script lang="ts">
  import ArrowClockwise from "phosphor-svelte/lib/ArrowClockwise";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";

  let {
    title = "Unable to load",
    message = "Check your connection and try again.",
    retryLabel = "Try again",
    onRetry,
  }: {
    title?: string;
    message?: string;
    retryLabel?: string;
    onRetry?: () => void;
  } = $props();
</script>

<section class="inline-failure alert alert-error" role="alert">
  <WarningCircle size={19} weight="bold" aria-hidden="true" />
  <div class="inline-failure__copy">
    <strong>{title}</strong>
    <span>{message}</span>
  </div>
  {#if onRetry}
    <button type="button" class="btn-secondary" onclick={onRetry}>
      <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
      {retryLabel}
    </button>
  {/if}
</section>

<style>
  .inline-failure {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
  }

  .inline-failure > :global(svg) {
    align-self: start;
    margin-top: 2px;
  }

  .inline-failure__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .inline-failure__copy strong {
    color: var(--color-ink);
    font-size: var(--fs-sm);
    line-height: 1.35;
  }

  .inline-failure__copy span {
    color: var(--color-ink-2);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .inline-failure :global(.btn-secondary) {
    min-height: var(--control-height-compact);
    padding-inline: var(--space-3);
  }

  @media (max-width: 360px) {
    .inline-failure {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .inline-failure :global(.btn-secondary) {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
