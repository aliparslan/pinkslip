<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import { currentRoute, rootHeaderFor, rootDestinationFor, routeNavigationRevision } from "../../../packages/client/src/router";
  import { documentTitleFor } from "../../../packages/client/src/route-config";
  import RootHeader from "../../../packages/client/src/components/RootHeader.svelte";
  import PageFailure from "../../../packages/client/src/components/PageFailure.svelte";

  let {
    children, route: routeOverride, active = true, showRootHeader = true, headingLevel = 1,
  }: {
    children: Snippet; route?: string; active?: boolean; showRootHeader?: boolean; headingLevel?: 1 | 2;
  } = $props();
  let route = $derived(routeOverride ?? $currentRoute);
  let header = $derived(showRootHeader ? rootHeaderFor(route) : null);
  let root: HTMLDivElement | undefined = $state();
  let announcedRevision = 0;

  $effect(() => {
    const current = route;
    if (!active || !root) return;
    const revision = routeNavigationRevision();
    let stopped = false;
    const announce = () => {
      if (stopped || !root) return;
      const heading = Array.from(root.querySelectorAll<HTMLElement>("[data-screen-title-anchor], h1, .page-failure h2"))
        .find((element) => element.textContent?.trim());
      const title = documentTitleFor(current) ?? heading?.textContent?.trim() ?? header?.title ?? "Pinkslip";
      document.title = title === "Pinkslip" ? title : `${title} · Pinkslip`;
      if (!heading || revision === 0 || announcedRevision === revision) return;
      announcedRevision = revision;
      // Switching library views should retain the tab's roving keyboard focus.
      if (document.activeElement?.getAttribute("role") === "tab") return;
      const addedTabIndex = !heading.hasAttribute("tabindex");
      if (addedTabIndex) heading.setAttribute("tabindex", "-1");
      heading.dataset.routeFocusTarget = "";
      heading.addEventListener("blur", () => {
        delete heading.dataset.routeFocusTarget;
        if (addedTabIndex) heading.removeAttribute("tabindex");
      }, { once: true });
      heading.focus({ preventScroll: true });
    };
    const observer = new MutationObserver(announce);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    void tick().then(announce);
    return () => { stopped = true; observer.disconnect(); };
  });
</script>

<div class="page-content-root" data-rendered-route={route} bind:this={root}>
  {#if header}
    <RootHeader title={header.title} subtitle={header.subtitle} ownerId={rootDestinationFor(route) ?? undefined} {active} {headingLevel} />
  {/if}
  <svelte:boundary>
    {@render children()}
    {#snippet failed(_error, reset)}
      <PageFailure title="This page ran into a problem" message="Try loading it again." onRetry={reset} headingLevel={header ? 2 : 1} />
    {/snippet}
  </svelte:boundary>
</div>
