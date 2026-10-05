<script lang="ts">
  import {
    currentRoute,
    routeDefinition,
    routeShell,
    showsRootNavigation,
  } from "../../../packages/client/src/router";
  import AppSession from "../../../packages/client/src/app/AppSession.svelte";
  import RouteView from "../../../packages/client/src/app/RouteView.svelte";
  import BrandMark from "../../../packages/client/src/components/BrandMark.svelte";
  import TabBar from "../../../packages/client/src/components/TabBar.svelte";
  import WebPlatformActions from "./WebPlatformActions.svelte";
  import WebYouNavigation from "./WebYouNavigation.svelte";

  const newDomainUrl = (() => {
    if (typeof window === "undefined") return "https://pinkslip.work";
    const target = new URL(window.location.href);
    target.protocol = "https:";
    target.hostname = "pinkslip.work";
    target.port = "";
    return target.toString();
  })();
  const showDomainMigrationNotice = (() => {
    if (typeof window === "undefined") return false;
    const url = new URL(window.location.href);
    return url.hostname === "pinkslip.work" && url.searchParams.get("ps_moved") === "1";
  })();

  let route = $derived($currentRoute);
  let definition = $derived(routeDefinition(route));
  let consumerShell = $derived(routeShell(route) === "consumer");
  let rootNavigationVisible = $derived(consumerShell && showsRootNavigation(route));
  let selectedJob = $derived(definition.id === "job");
  let youWorkspace = $derived(
    consumerShell && definition.rootDestination === "you"
  );

  function libraryOrigin(value: string): "/library/saved" | "/library/applied" | null {
    const query = value.includes("?") ? value.slice(value.indexOf("?") + 1) : "";
    const origin = new URLSearchParams(query).get("from");
    if (origin === "library-saved") return "/library/saved";
    if (origin === "library-applied") return "/library/applied";
    return null;
  }

  let selectedJobOrigin = $derived(selectedJob ? libraryOrigin(route) : null);
  let collectionRoute = $derived.by(() => {
    if (definition.id === "feed") return "/";
    if (definition.id === "library-saved") return "/library/saved";
    if (definition.id === "library-applied") return "/library/applied";
    if (selectedJob) return selectedJobOrigin ?? "/";
    return null;
  });
  let collectionLabel = $derived(collectionRoute?.startsWith("/library") ? "Library" : "Jobs");
</script>

<AppSession>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div
    class="web-app-shell"
    class:admin-shell-active={!consumerShell}
    class:root-navigation-visible={rootNavigationVisible}
    class:domain-migration-notice-active={showDomainMigrationNotice}
  >
    {#if showDomainMigrationNotice}
      <aside class="web-domain-migration-notice" aria-label="Site address update">
        Pinkslip is now on <a href={newDomainUrl}>pinkslip.work</a>
      </aside>
    {/if}
    {#if consumerShell}<TabBar />{/if}
    <main id="main-content" class="app-main web-app-main" tabindex="-1">
      {#if collectionRoute}
        <div
          class="web-jobs-workspace"
          class:detail-selected={selectedJob}
          data-workspace={collectionLabel.toLowerCase()}
        >
          <aside class="web-workspace-master" aria-label={`${collectionLabel} list`}>
            <RouteView
              routeOverride={collectionRoute}
              active={!selectedJob}
              rootHeadingLevel={selectedJob ? 2 : 1}
            />
          </aside>

          <section class="web-workspace-detail" aria-label={selectedJob ? "Selected job" : "Job details"}>
            {#if selectedJob}
              <RouteView showRootHeader={false} />
            {:else}
              <div class="web-workspace-empty" aria-labelledby="web-workspace-empty-title">
                <span class="web-workspace-empty__icon" aria-hidden="true">
                  <BrandMark size={24} />
                </span>
                <h2 id="web-workspace-empty-title" class="h-display h-display-sm">
                  Select a job
                </h2>
                <p>Choose a role from the list to review the details without losing your place.</p>
              </div>
            {/if}
          </section>
        </div>
      {:else if youWorkspace}
        <div class="web-you-workspace">
          <WebYouNavigation />
          <div class="web-route-canvas" data-route-shell={routeShell(route)}>
            <RouteView />
          </div>
        </div>
      {:else}
        <div class="web-route-canvas" data-route-shell={routeShell(route)}>
          <RouteView />
        </div>
      {/if}
      <WebPlatformActions compactInstall={definition.id === "you"} />
    </main>
  </div>
</AppSession>
