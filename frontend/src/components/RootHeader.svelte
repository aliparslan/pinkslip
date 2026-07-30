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
  <div class="root-header-copy">
    <h1>{title}</h1>
    {#if subtitle}<p>{subtitle}</p>{/if}
  </div>
  {#if trailing}
    <div class="root-header-trailing">{@render trailing()}</div>
  {/if}
</header>

<style>
  .root-header {
    min-height: 78px;
    padding: var(--space-5) var(--screen-gutter) var(--space-3);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .root-header-copy { min-width: 0; }

  /* Pixel display face: no weight axis, so 400 is the only real weight — 600
     would be synthesized. Bitmap forms also need neutral tracking rather than
     the tight optical setting a proportional display face wants. */
  .root-header h1 {
    margin: 0;
    color: var(--color-ink);
    font-family: var(--font-pixel);
    font-size: var(--fs-4xl);
    font-weight: 400;
    letter-spacing: 0;
    line-height: 1.1;
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
      min-height: 104px;
      padding-top: var(--space-8);
      padding-bottom: var(--space-4);
    }
  }
</style>
