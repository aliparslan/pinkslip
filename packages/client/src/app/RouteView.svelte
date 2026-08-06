<script lang="ts">
  import { tick } from "svelte";
  import { currentRoute, navigate, backTargetRoute, routeParam, rootHeaderFor } from "../router";
  import { loadPage, resolvedPage, type PageComponent } from "./page-registry";
  import PageFailure from "../components/PageFailure.svelte";
  import RootHeader from "../components/RootHeader.svelte";
  import Spinner from "../components/Spinner.svelte";
  import { isIosApp } from "../lib/platform";
  import { requestBack } from "../lib/nav-back";

  let {
    routeOverride,
    showRootHeader = true,
  }: {
    routeOverride?: string;
    showRootHeader?: boolean;
  } = $props();

  let route = $derived(routeOverride ?? $currentRoute);
  let CurrentPage: PageComponent | null = $state(null);
  let renderedRoute: string | null = $state(null);
  let pageLoadFailed = $state(false);
  let generation = 0;
  let jobId = $derived(routeParam(route, "jobId"));
  let rootHeader = $derived(showRootHeader ? rootHeaderFor(route) : null);
  let pageRoot: HTMLDivElement | undefined = $state();
  let announcedRoute: string | null = null;
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
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
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

  async function loadCurrentRoute(): Promise<void> {
    const activeRoute = route;
    const activeGeneration = ++generation;
    pageLoadFailed = false;
    const resolved = nativeIos ? resolvedPage(activeRoute) : null;
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
          component = await loadPage(activeRoute);
        } catch {
          component = await loadPage(activeRoute);
        }
        if (activeGeneration !== generation) return;
        CurrentPage = component;
        renderedRoute = activeRoute;
      }
      if (activeGeneration !== generation) return;
      clearRecovery();
      await tick();
      if (nativeIos) {
        const heading = pageRoot?.querySelector<HTMLElement>("h1");
        const headingText = heading?.textContent?.trim() || rootHeader?.title || "pinkslip";
        document.title = headingText === "pinkslip" ? headingText : `${headingText} · pinkslip`;
        if (announcedRoute !== null && announcedRoute !== activeRoute) {
          (heading ?? pageRoot?.closest<HTMLElement>("main"))?.focus({ preventScroll: true });
        }
      }
      announcedRoute = activeRoute;
    } catch {
      if (activeGeneration === generation && !refreshUpdatedBundle(activeRoute)) {
        pageLoadFailed = true;
        renderedRoute = activeRoute;
      }
    }
  }

  $effect(() => {
    void route;
    void loadCurrentRoute();
  });
</script>

<div
  class="page-content-root"
  data-rendered-route={renderedRoute ?? undefined}
  bind:this={pageRoot}
>
  {#if rootHeader}
    <div class="root-header-flow">
      <RootHeader title={rootHeader.title} subtitle={rootHeader.subtitle} collapsible={nativeIos} />
    </div>
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
          <div class="h-display h-display-sm boot-error-title">This page didn&rsquo;t load</div>
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
    <CurrentPage {jobId} routeOverride={routeOverride} {nativeIos} />
  {/if}
</div>
