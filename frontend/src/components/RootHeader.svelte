<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    subtitle = "",
    trailing,
  }: {
    title: string;
    subtitle?: string;
    trailing?: Snippet;
  } = $props();
</script>

<header class="root-header">
  <div class="root-header-inner">
    <div class="root-header-copy">
      <h1>{title}</h1>
      {#if subtitle}<p>{subtitle}</p>{/if}
    </div>
    {#if trailing}
      <div class="root-header-trailing">{@render trailing()}</div>
    {/if}
  </div>
</header>

<style>
  .root-header {
    flex: none;
    padding-top: calc(var(--safe-top) + var(--space-5));
    background: color-mix(in oklch, var(--color-bg) 94%, transparent);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-bottom: 0.5px solid var(--color-line);
  }

  .root-header-inner {
    min-height: 78px;
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: 0 var(--screen-gutter) var(--space-3);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .root-header-copy { min-width: 0; }

  .root-header h1 {
    margin: 0;
    color: var(--color-ink);
    font-family: var(--font-pixel);
    font-size: var(--fs-4xl);
    font-weight: 400;
    letter-spacing: 0;
    line-height: 1.15;
  }

  .root-header p {
    margin: var(--space-1) 0 0;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.35;
  }

  .root-header-trailing {
    flex: none;
    align-self: center;
  }

  @media (min-width: 900px) {
    .root-header {
      padding-top: calc(var(--safe-top) + var(--space-8));
    }

    .root-header-inner {
      min-height: 104px;
      padding-bottom: var(--space-4);
    }
  }
</style>
