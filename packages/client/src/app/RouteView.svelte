<script lang="ts">
  import { currentRoute, navigate, backTargetRoute, routeParam, rootHeaderFor } from "../router";
  import { loadPage, type PageComponent } from "./page-registry";
  import RootHeader from "../components/RootHeader.svelte";
  import Spinner from "../components/Spinner.svelte";

  let {
    routeOverride,
    showRootHeader = true,
  }: {
    routeOverride?: string;
    showRootHeader?: boolean;
  } = $props();

  let route = $derived(routeOverride ?? $currentRoute);
  let CurrentPage: PageComponent | null = $state(null);
  let pageLoadFailed = $state(false);
  let generation = 0;
  let jobId = $derived(routeParam(route, "jobId"));
  let rootHeader = $derived(showRootHeader ? rootHeaderFor(route) : null);

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
    CurrentPage = null;
    pageLoadFailed = false;
    try {
      let component: PageComponent;
      try {
        component = await loadPage(activeRoute);
      } catch {
        component = await loadPage(activeRoute);
      }
      if (activeGeneration !== generation) return;
      CurrentPage = component;
      clearRecovery();
    } catch {
      if (activeGeneration === generation && !refreshUpdatedBundle(activeRoute)) {
        pageLoadFailed = true;
      }
    }
  }

  $effect(() => {
    void route;
    void loadCurrentRoute();
  });
</script>

<div class="page-content-root">
  {#if rootHeader}
    <div class="root-header-flow">
      <RootHeader title={rootHeader.title} subtitle={rootHeader.subtitle} />
    </div>
  {/if}
  {#if pageLoadFailed}
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
  {:else if !CurrentPage}
    <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
  {:else}
    <CurrentPage {jobId} routeOverride={routeOverride} />
  {/if}
</div>
