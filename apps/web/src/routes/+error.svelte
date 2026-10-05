<script lang="ts">
  import { page } from "$app/state";
  import PageFailure from "../../../../packages/client/src/components/PageFailure.svelte";
</script>
<svelte:head><title>{page.status === 404 ? "Page not found" : "Page didn’t load"} · Pinkslip</title></svelte:head>
<main class="page page-frame">
  <PageFailure
    title={page.status === 404 ? "Page not found" : "This page didn’t load"}
    message={page.status === 404 ? "That address doesn’t lead to a page in Pinkslip." : "Check your connection and try again."}
    onRetry={page.status === 404 ? undefined : () => location.reload()}
  />
  <a class="btn-secondary" href="/">Back to jobs</a>
</main>
