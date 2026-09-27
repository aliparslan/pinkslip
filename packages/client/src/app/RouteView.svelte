<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import {
    currentRoute,
    navigate,
    backTargetRoute,
    routeParam,
    routeNavigationRevision,
    rootDestinationFor,
    rootHeaderFor,
  } from "../router";
  import {
    defaultPageRegistry,
    type PageComponent,
    type RoutePageRegistry,
  } from "./page-registry";
  import { documentTitleFor } from "../route-config";
  import PageFailure from "../components/PageFailure.svelte";
  import RootHeader from "../components/RootHeader.svelte";
  import Spinner from "../components/Spinner.svelte";
  import { isIosApp } from "../lib/platform";
  import { requestBack } from "../lib/nav-back";
  import { ActivationEdge } from "../lib/activation";

  let {
    routeOverride,
    showRootHeader = true,
    rootHeadingLevel = 1,
    active = true,
    pageRegistry = defaultPageRegistry,
  }: {
    routeOverride?: string;
    showRootHeader?: boolean;
    rootHeadingLevel?: 1 | 2;
    active?: boolean;
    pageRegistry?: RoutePageRegistry;
  } = $props();

  let route = $derived(routeOverride ?? $currentRoute);
  let CurrentPage: PageComponent | null = $state(null);
  let renderedRoute: string | null = $state(null);
  let pageLoadFailed = $state(false);
  let generation = 0;
  let jobId = $derived(routeParam(route, "jobId"));
  let rootHeader = $derived(showRootHeader ? rootHeaderFor(route) : null);
  let rootHeaderOwner = $derived(rootDestinationFor(route) ?? undefined);
  let pageRoot: HTMLDivElement | undefined = $state();
  let announcedRoute: string | null = null;
  let announcedRevision: number | null = null;
  let routeObserver: MutationObserver | null = null;
  let routeFallbackTimer: number | null = null;
  const viewActivation = new ActivationEdge();
  const nativeIos = isIosApp();

  const RECOVERY_KEY = "pinkslip:lazy-route-recovery";
  const REFRESH_QUERY_KEY = "_app_refresh";

  function clearRecovery(): void {
    try {
      sessionStorage.removeItem(RECOVERY_KEY);
    } catch {
      // Storage can be unavailable in private browsing.
    }
    const url = new URL(location.href);
    if (!url.searchParams.has(REFRESH_QUERY_KEY)) return;
    url.searchParams.delete(REFRESH_QUERY_KEY);
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function refreshUpdatedBundle(activeRoute: string): boolean {
    try {
      if (sessionStorage.getItem(RECOVERY_KEY) === activeRoute) return false;
      sessionStorage.setItem(RECOVERY_KEY, activeRoute);
    } catch {
      return false;
    }
    const url = new URL(location.href);
    url.searchParams.set(REFRESH_QUERY_KEY, Date.now().toString());
    location.replace(url.toString());
    return true;
  }

  function clearRouteObserver(): void {
    routeObserver?.disconnect();
    routeObserver = null;
    if (routeFallbackTimer !== null) window.clearTimeout(routeFallbackTimer);
    routeFallbackTimer = null;
  }

  function routeHeading(): HTMLElement | null {
    if (!pageRoot) return null;
    const firstNamed = (selector: string) => Array.from(
      pageRoot?.querySelectorAll<HTMLElement>(selector) ?? []
    ).find((candidate) => Boolean(candidate.textContent?.trim())) ?? null;
    return firstNamed(".page-failure h1, .page-failure h2")
      ?? firstNamed("[data-screen-title-anchor]")
      ?? firstNamed("h1");
  }

  function setRouteDocumentTitle(activeRoute: string, heading: HTMLElement | null): void {
    const title = documentTitleFor(activeRoute)
      || heading?.textContent?.trim()
      || rootHeader?.title
      || "Pinkslip";
    document.title = title === "Pinkslip" ? title : `${title} · Pinkslip`;
  }

  function focusRouteTarget(target: HTMLElement): void {
    const addedTabIndex = !target.hasAttribute("tabindex");
    if (addedTabIndex) target.setAttribute("tabindex", "-1");
    target.dataset.routeFocusTarget = "";
    const cleanup = () => {
      delete target.dataset.routeFocusTarget;
      if (addedTabIndex) target.removeAttribute("tabindex");
    };
    target.addEventListener("blur", cleanup, { once: true });
    target.focus({ preventScroll: true });
    if (document.activeElement !== target) cleanup();
  }

  function announceRenderedRoute(activeRoute: string, activeGeneration: number): boolean {
    if (!active || activeGeneration !== generation || route !== activeRoute) return true;
    const heading = routeHeading();
    setRouteDocumentTitle(activeRoute, heading);
    if (!heading) return false;

    const revision = routeNavigationRevision();
    const routeChanged = announcedRoute !== null && announcedRoute !== activeRoute;
    const webNavigationActivated = !nativeIos && revision > 0 && announcedRevision !== revision;
    if (routeChanged || webNavigationActivated) {
      focusRouteTarget(heading);
    }
    announcedRoute = activeRoute;
    announcedRevision = revision;
    clearRouteObserver();
    return true;
  }

  function watchForRouteHeading(activeRoute: string, activeGeneration: number): void {
    clearRouteObserver();
    if (announceRenderedRoute(activeRoute, activeGeneration) || !pageRoot) return;

    routeObserver = new MutationObserver(() => {
      announceRenderedRoute(activeRoute, activeGeneration);
    });
    routeObserver.observe(pageRoot, { childList: true, subtree: true, characterData: true });

    // A well-formed screen supplies a heading. Keep a delayed main fallback
    // for transient or legacy screens without one, while continuing to watch
    // for async content such as Job Detail.
    routeFallbackTimer = window.setTimeout(() => {
      if (!active || activeGeneration !== generation || route !== activeRoute) return;
      routeFallbackTimer = null;
      if (pageRoot?.querySelector(".page-loading")) return;
      const main = pageRoot?.closest<HTMLElement>("main");
      setRouteDocumentTitle(activeRoute, routeHeading());
      const revision = routeNavigationRevision();
      const routeChanged = announcedRoute !== null && announcedRoute !== activeRoute;
      const webNavigationActivated = !nativeIos && revision > 0 && announcedRevision !== revision;
      if (main && (routeChanged || webNavigationActivated)) {
        focusRouteTarget(main);
      }
      announcedRoute = activeRoute;
      announcedRevision = revision;
      clearRouteObserver();
    }, 1_500);
  }

  async function loadCurrentRoute(): Promise<void> {
    const activeRoute = route;
    const activeGeneration = ++generation;
    clearRouteObserver();
    pageLoadFailed = false;
    if (active) setRouteDocumentTitle(activeRoute, null);
    const resolved = nativeIos ? pageRegistry.resolvedPage(activeRoute) : null;
    if (resolved) {
      // Core routes and already-loaded lazy routes can render in the same
      // Svelte flush. Retaining an identical component also avoids a needless
      // unmount/remount when two routes share one page component.
      CurrentPage = resolved;
      renderedRoute = activeRoute;
    } else {
      CurrentPage = null;
      renderedRoute = null;
    }
    try {
      if (!resolved) {
        let component: PageComponent;
        try {
          component = await pageRegistry.loadPage(activeRoute);
        } catch {
          component = await pageRegistry.loadPage(activeRoute);
        }
        if (activeGeneration !== generation) return;
        CurrentPage = component;
        renderedRoute = activeRoute;
      }
      if (activeGeneration !== generation) return;
      clearRecovery();
      await tick();
      watchForRouteHeading(activeRoute, activeGeneration);
    } catch {
      if (activeGeneration === generation && !refreshUpdatedBundle(activeRoute)) {
        pageLoadFailed = true;
        renderedRoute = activeRoute;
        await tick();
        watchForRouteHeading(activeRoute, activeGeneration);
      }
    }
  }

  $effect(() => {
    void route;
    void loadCurrentRoute();
  });

  $effect(() => {
    const becameActive = viewActivation.becameActive(active);
    if (!active) {
      clearRouteObserver();
      return;
    }
    if (!becameActive) return;
    const activeRoute = route;
    const activeGeneration = generation;
    void tick().then(() => watchForRouteHeading(activeRoute, activeGeneration));
  });

  function reportPageRenderError(error: unknown): void {
    console.error(`Route ${route} failed while rendering:`, error);
  }

  onDestroy(clearRouteObserver);
</script>

{#snippet renderFailure(_error: unknown, reset: () => void)}
  <PageFailure
    headingLevel={rootHeader ? 2 : 1}
    title="This page ran into a problem"
    message="Try loading it again."
    onRetry={reset}
    secondaryLabel={nativeIos ? "Go back" : undefined}
    onSecondary={nativeIos
      ? () => {
          if (!requestBack()) navigate(backTargetRoute(route) ?? "/you", { replace: true });
        }
      : undefined}
  />
{/snippet}

<div
  class="page-content-root"
  data-rendered-route={renderedRoute ?? undefined}
  bind:this={pageRoot}
>
  {#if rootHeader}
    <RootHeader
      title={rootHeader.title}
      subtitle={rootHeader.subtitle}
      ownerId={rootHeaderOwner}
      headingLevel={rootHeadingLevel}
      collapsible={nativeIos}
      {active}
    />
  {/if}
  {#if pageLoadFailed}
    {#if nativeIos}
      <PageFailure
        title="This page didn’t load"
        message="Try again. If the app just updated, it may only need a moment."
        onRetry={() => void loadCurrentRoute()}
        secondaryLabel="Go back"
        onSecondary={() => {
          if (!requestBack()) navigate(backTargetRoute(route) ?? "/you", { replace: true });
        }}
      />
    {:else}
      <div class="boot-error-wrap">
        <div class="boot-error-card">
          <svelte:element
            this={rootHeader ? "h2" : "h1"}
            class="h-display h-display-sm boot-error-title"
          >This page didn&rsquo;t load</svelte:element>
          <div class="boot-error-copy">The app may have updated while it was open. Try once more or return to the previous page.</div>
          <div class="button-cluster">
            <button class="btn-primary btn-accent" onclick={loadCurrentRoute}>Try again</button>
            <button class="btn-secondary" onclick={() => navigate(backTargetRoute(route) ?? "/you", { replace: true })}>Go back</button>
          </div>
        </div>
      </div>
    {/if}
  {:else if !CurrentPage}
    <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
  {:else}
    {#key renderedRoute}
      <svelte:boundary onerror={reportPageRenderError} failed={renderFailure}>
        <CurrentPage {jobId} routeOverride={routeOverride} {nativeIos} {active} />
      </svelte:boundary>
    {/key}
  {/if}
</div>
