<script lang="ts">
  import { currentRoute } from "./router";
  import Feed from "./pages/Feed.svelte";
  import JobDetail from "./pages/JobDetail.svelte";
  import Companies from "./pages/Companies.svelte";
  import Settings from "./pages/Settings.svelte";
  import TabBar from "./components/TabBar.svelte";

  const routes: Record<string, any> = {
    "/": Feed,
    "/companies": Companies,
    "/settings": Settings,
  };

  let route = $derived($currentRoute);
  let isDetailPage = $derived(route.startsWith("/jobs/"));
  let CurrentPage = $derived(
    isDetailPage ? JobDetail : (routes[route] ?? Feed)
  );
  let jobId = $derived(isDetailPage ? route.split("/jobs/")[1] : null);
</script>

<div class="min-h-screen bg-base-100 pb-16">
  {#if isDetailPage}
    <CurrentPage {jobId} />
  {:else}
    <CurrentPage />
  {/if}
  <TabBar />
</div>
