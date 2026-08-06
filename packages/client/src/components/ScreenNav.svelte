<script lang="ts">
  import type { Snippet } from "svelte";
  import CaretLeft from "phosphor-svelte/lib/CaretLeft";
  import { createFrameBatch } from "../lib/motion";
  import { isIosApp } from "../lib/platform";
  import { scrollContainer } from "../router";

  let {
    title,
    backLabel = "Back",
    onBack,
    trailing,
    collapsible = false,
  }: {
    title: string;
    backLabel?: string;
    onBack: () => void;
    trailing?: Snippet;
    collapsible?: boolean;
  } = $props();

  let navElement: HTMLElement | undefined = $state(undefined);
  let compactTitleVisible = $state(true);
  const nativeIos = isIosApp();
  let nativeCollapsible = $derived(nativeIos && collapsible);

  function updateCompactTitle() {
    if (!nativeCollapsible || !navElement) {
      compactTitleVisible = true;
      return;
    }
    const anchor = navElement.parentElement?.querySelector<HTMLElement>("[data-screen-title-anchor]");
    if (!anchor) {
      compactTitleVisible = true;
      return;
    }
    const scrollerTop = scrollContainer()?.getBoundingClientRect().top ?? 0;
    compactTitleVisible = anchor.getBoundingClientRect().bottom <= scrollerTop + navElement.offsetHeight;
  }

  const titleBatch = createFrameBatch<undefined>(updateCompactTitle);
  const scheduleCompactTitleUpdate = () => titleBatch.schedule(undefined);

  $effect(() => {
    nativeCollapsible;
    title;
    const scroller = scrollContainer();
    if (!scroller || !navElement || !nativeCollapsible) {
      compactTitleVisible = true;
      return;
    }
    compactTitleVisible = false;
    scroller.addEventListener("scroll", scheduleCompactTitleUpdate, { passive: true });
    window.addEventListener("resize", scheduleCompactTitleUpdate, { passive: true });
    scheduleCompactTitleUpdate();
    return () => {
      scroller.removeEventListener("scroll", scheduleCompactTitleUpdate);
      window.removeEventListener("resize", scheduleCompactTitleUpdate);
      titleBatch.cancel();
    };
  });
</script>

<header bind:this={navElement} class="screen-nav" class:collapsible={nativeCollapsible} class:compact-title-visible={compactTitleVisible}>
  <div class="screen-nav__leading">
    <button type="button" class="screen-nav__back" aria-label={backLabel} onclick={onBack}>
      <CaretLeft size={22} weight="bold" />
    </button>
  </div>
  {#if title && nativeIos && !nativeCollapsible}
    <h1 class="screen-nav__title" title={title} tabindex="-1">{title}</h1>
  {:else}
    <div class="screen-nav__title" title={title || undefined} aria-hidden={nativeCollapsible || !title}>{title}</div>
  {/if}
  <div class="screen-nav__trailing">
    {#if trailing}
      {@render trailing()}
    {/if}
  </div>
</header>
