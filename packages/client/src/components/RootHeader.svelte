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
  let compact = $state(false);
  let searchExpanded = $state(false);
  let displayedTitle = $derived(
    headerChrome.rootTitle?.id === ownerId
      ? headerChrome.rootTitle?.value().trim() || title
      : title,
  );
  function updateCompactTitle() {
    if (!collapsible || !headerElement) {
      compact = false;
      return;
    }
    const anchor = headerElement.parentElement?.querySelector<HTMLElement>("[data-root-title-anchor]");
    if (!anchor) {
      compact = false;
      return;
    }
    const scrollerTop = scrollContainer()?.getBoundingClientRect().top ?? 0;
    compact = anchor.getBoundingClientRect().bottom <= scrollerTop + headerElement.offsetHeight;
  }

  const collapseBatch = createFrameBatch<undefined>(updateCompactTitle);
  const scheduleCollapse = () => collapseBatch.schedule(undefined);

  $effect(() => {
    void title;
    compact = false;
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

  $effect(() => {
    if (!compact) searchExpanded = false;
  });
</script>

{#if collapsible}
  <header
    bind:this={headerElement}
    class="root-header root-header-native"
    class:compact
    class:search-expanded={searchExpanded}
  >
    <div class="root-header-leading" aria-hidden="true"></div>
    <div class="root-header-compact-title" aria-hidden={!compact}>{displayedTitle}</div>
    <div class="root-header-native-trailing">
      {#if trailing}<div class="root-header-trailing">{@render trailing()}</div>{/if}
      <div class="root-header-search" class:expanded={searchExpanded}>
        <HeaderSearch visible={compact} {ownerId} bind:expanded={searchExpanded} />
      </div>
    </div>
  </header>
  <div class="root-header-large" data-root-title-anchor>
    <h1>{displayedTitle}</h1>
    {#if subtitle}<p>{subtitle}</p>{/if}
  </div>
{:else}
  <header bind:this={headerElement} class="root-header">
    <div class="root-header-inner">
      <div class="root-header-copy">
        <h1>{displayedTitle}</h1>
        {#if subtitle}<p>{subtitle}</p>{/if}
      </div>
      {#if trailing}<div class="root-header-trailing">{@render trailing()}</div>{/if}
    </div>
  </header>
{/if}

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
    font-family: var(--font-heading);
    font-size: var(--fs-root-title);
    font-weight: 600;
    letter-spacing: var(--tracking-root-title);
    line-height: var(--leading-root-title);
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

  .root-header-native {
    position: fixed;
    top: 0;
    left: 50%;
    width: min(100%, var(--app-mobile-width));
    transform: translateX(-50%);
    z-index: 10;
    min-height: calc(var(--safe-top) + var(--screen-nav-height));
    padding-top: var(--safe-top);
    display: grid;
    grid-template-columns: minmax(var(--tap-min), 1fr) minmax(0, auto) minmax(var(--tap-min), 1fr);
    align-items: center;
    padding-inline: 10px;
    pointer-events: none;
  }

  .root-header-native.compact,
  .root-header-native.search-expanded {
    pointer-events: auto;
  }

  .root-header-leading,
  .root-header-native-trailing {
    min-width: var(--tap-min);
  }

  .root-header-compact-title {
    max-width: min(46vw, 300px);
    overflow: hidden;
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: var(--fs-base);
    font-weight: 600;
    line-height: 1.2;
    opacity: 0;
    text-align: center;
    text-overflow: ellipsis;
    transform: translateY(4px);
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
    white-space: nowrap;
  }

  .root-header-native.compact .root-header-compact-title {
    opacity: 1;
    transform: none;
  }

  .root-header-native-trailing {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .root-header-native .root-header-search {
    flex: none;
    display: block;
  }

  .root-header-native .root-header-search.expanded {
    position: absolute;
    inset-inline: 10px;
    bottom: 6px;
  }

  .root-header-native.search-expanded .root-header-compact-title,
  .root-header-native.search-expanded .root-header-trailing {
    opacity: 0;
    pointer-events: none;
  }

  .root-header-large {
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: calc(var(--safe-top) + var(--space-6)) var(--screen-gutter) var(--space-5);
  }

  .root-header-large h1 {
    margin: 0;
    color: var(--color-ink);
    font-family: var(--font-heading);
    font-size: var(--fs-root-title);
    font-weight: 600;
    letter-spacing: var(--tracking-root-title);
    line-height: var(--leading-root-title);
    text-wrap: balance;
  }

  .root-header-large p {
    margin: var(--space-2) 0 0;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.35;
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
