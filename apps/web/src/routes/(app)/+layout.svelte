<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { afterNavigate, disableScrollHandling, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { installNavigationAdapter, navigate } from "../../../../../packages/client/src/router";
  import { initialHistoryRouteForLocation } from "../../../../../packages/client/src/route-config";
  import { feedback } from "../../../../../packages/client/src/lib/feedback.svelte";
  import Spinner from "../../../../../packages/client/src/components/Spinner.svelte";
  import WebApp from "../../WebApp.svelte";
  import { initializeWebClient } from "../../bootstrap";
  import { createKitNavigationAdapter } from "../../lib/kit-navigation";

  let { children }: { children: Snippet } = $props();
  let ready = $state(false);
  let navigation: ReturnType<typeof createKitNavigationAdapter> | undefined;

  afterNavigate(({ from, type }) => {
    if (!from || !navigation) return;
    disableScrollHandling();
    navigation.didNavigate(type === "popstate" ? "pop" : "push");
  });

  onMount(() => {
    const detachPlatform = initializeWebClient(async (url) => {
      navigate(url);
      await navigation?.settled();
    });
    navigation = createKitNavigationAdapter({
      current: () => ({ route: `${page.url.pathname}${page.url.search}`, state: page.state }),
      goto,
      replaceState: (_route, state) => { void goto("", { shallow: true, replace: true, state }); },
      back: () => window.history.back(),
      onError: () => feedback.error("This page didn’t load. Check your connection and try again."),
    });
    const detach = installNavigationAdapter(navigation.adapter);
    ready = true;
    const canonical = initialHistoryRouteForLocation(location.hash, location.pathname, location.search);
    if (canonical !== `${location.pathname}${location.search}` || location.hash.startsWith("#/")) {
      void goto(canonical, { replace: true, reset: false, state: page.state });
    }
    return () => { detach(); detachPlatform(); };
  });
</script>

{#if ready}
  <WebApp>{@render children()}</WebApp>
{:else}
  <div class="page-loading" aria-busy="true"><Spinner size={22} label="Starting up" /></div>
{/if}
