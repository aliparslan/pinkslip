<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../../packages/client/src/app.css";
  import "../web.css";
  let { children }: { children: Snippet } = $props();
</script>
<svelte:head><title>Pinkslip</title></svelte:head>
{@render children()}
