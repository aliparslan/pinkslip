<script lang="ts">
  import type { Snippet } from "svelte";
  import { createFrameBatch } from "../lib/motion";
  import { scrollContainer } from "../router";
  import HeaderSearch from "./HeaderSearch.svelte";
  import { headerChrome } from "../lib/header-chrome.svelte";

  let {
    title,
    subtitle = "",
    trailing,
    collapsible = false,
    ownerId,
  }: {
    title: string;
    subtitle?: string;
    trailing?: Snippet;
    collapsible?: boolean;
    ownerId?: string;
  } = $props();

  let headerElement: HTMLElement | undefined = $state();
  let collapseProgress = $state(0);
  let searchExpanded = $state(false);
  let displayedTitle = $derived(
    headerChrome.rootTitle?.id === ownerId
      ? headerChrome.rootTitle?.value().trim() || title
      : title,
  );
  let compact = $derived(collapseProgress >= 0.86);
  let innerHeight = $derived(`${90 - collapseProgress * 34}px`);
  let titleSize = $derived(`${40 - collapseProgress * 20}px`);
  let bottomPadding = $derived(`${12 - collapseProgress * 4}px`);

  function updateCollapse() {
    const scrollTop = scrollContainer()?.scrollTop ?? 0;
    collapseProgress = Math.min(1, Math.max(0, scrollTop / 52));
  }

  const collapseBatch = createFrameBatch<undefined>(updateCollapse);
  const scheduleCollapse = () => collapseBatch.schedule(undefined);

  $effect(() => {
    void title;
    collapseProgress = 0;
    const scroller = scrollContainer();
    if (!collapsible || !scroller || !headerElement) return;
    scroller.addEventListener("scroll", scheduleCollapse, { passive: true });
    window.addEventListener("resize", scheduleCollapse, { passive: true });
    scheduleCollapse();
    return () => {
      scroller.removeEventListener("scroll", scheduleCollapse);
      window.removeEventListener("resize", scheduleCollapse);
      collapseBatch.cancel();
    };
  });
</script>

<header
  bind:this={headerElement}
  class="root-header"
  class:collapsible
  class:compact
  class:search-expanded={searchExpanded}
  style="--root-inner-height: {innerHeight}; --root-title-size: {titleSize}; --root-bottom-padding: {bottomPadding};"
>
  <div class="root-header-inner">
    <div class="root-header-copy">
      <h1>{displayedTitle}</h1>
      {#if subtitle}<p>{subtitle}</p>{/if}
    </div>
    {#if trailing}
      <div class="root-header-trailing">{@render trailing()}</div>
    {/if}
    <div class="root-header-search" class:expanded={searchExpanded}>
      <HeaderSearch visible={compact} {ownerId} bind:expanded={searchExpanded} />
    </div>
  </div>
</header>

<style>
  .root-header {
    flex: none;
    padding-top: calc(var(--safe-top) + var(--space-3));
    background: var(--color-bg);
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

  .root-header-copy,
  .root-header-trailing {
    opacity: var(--root-header-copy-opacity, 1);
    pointer-events: var(--root-header-copy-pointer-events, auto);
  }

  .root-header h1 {
    margin: 0;
    color: var(--color-ink);
    font-family: var(--font-pixel);
    font-size: var(--fs-root-title);
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

  .root-header-search {
    display: none;
  }

  .root-header.collapsible {
    position: sticky;
    top: 0;
    z-index: 10;
    padding-top: var(--safe-top);
    background: var(--color-bg);
  }

  .root-header.collapsible .root-header-inner {
    position: relative;
    min-height: var(--root-inner-height);
    padding-bottom: var(--root-bottom-padding);
  }

  .root-header.collapsible .root-header-copy {
    flex: 1;
  }

  .root-header.collapsible h1 {
    overflow: hidden;
    font-size: var(--root-title-size);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .root-header.collapsible .root-header-search {
    flex: none;
    display: block;
  }

  .root-header.collapsible .root-header-search.expanded {
    position: absolute;
    inset-inline: var(--screen-gutter);
    bottom: 6px;
  }

  .root-header.collapsible.search-expanded {
    --root-header-copy-opacity: 0;
    --root-header-copy-pointer-events: none;
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
