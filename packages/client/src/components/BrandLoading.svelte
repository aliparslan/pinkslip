<script lang="ts">
  import BrandMark from "./BrandMark.svelte";

  let {
    label = "Loading Pinkslip",
  }: {
    label?: string;
  } = $props();
</script>

<div class="brand-loading" role="status" aria-live="polite" aria-label={label}>
  <div class="brand-loading__lockup" aria-hidden="true">
    <span class="brand-loading__mark"><BrandMark size={34} /></span>
    <span class="brand-loading__wordmark"><span>pink</span>slip</span>
  </div>
</div>

<style>
  .brand-loading {
    width: 100%;
    min-height: 100dvh;
    padding: var(--safe-top) var(--screen-gutter) var(--safe-bottom);
    display: grid;
    place-items: center;
    background: var(--color-bg);
    color: var(--color-ink);
  }

  .brand-loading__lockup {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }

  .brand-loading__mark {
    display: block;
    animation: brand-loading-breathe 1.2s var(--ease-standard) infinite alternate;
  }

  .brand-loading__wordmark {
    font-family: var(--font-display);
    font-size: var(--fs-2xl);
    font-weight: 600;
    letter-spacing: var(--tracking-screen-title);
    line-height: 1;
  }

  .brand-loading__wordmark > span {
    color: var(--color-accent);
  }

  @keyframes brand-loading-breathe {
    from { opacity: 0.64; }
    to { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .brand-loading__mark { animation: none; }
  }
</style>
