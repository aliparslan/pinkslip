<script lang="ts">
  import { currentRoute, routeShell } from "../../../packages/client/src/router";
  import AppSession from "../../../packages/client/src/app/AppSession.svelte";
  import RouteView from "../../../packages/client/src/app/RouteView.svelte";
  import TabBar from "../../../packages/client/src/components/TabBar.svelte";

  let route = $derived($currentRoute);
</script>

<AppSession>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="web-app-shell" class:admin-shell-active={routeShell(route) === "admin"}>
    {#if routeShell(route) === "consumer"}<TabBar />{/if}
    <main id="main-content" class="app-main web-app-main" tabindex="-1">
      <RouteView />
    </main>
  </div>
</AppSession>
