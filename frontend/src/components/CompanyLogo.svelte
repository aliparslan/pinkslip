<script lang="ts">
  import { companyMark } from "../lib/utils";

  let { name, domain, size = 44 }: {
    name: string;
    domain?: string | null;
    size?: number;
  } = $props();

  let imgFailed: boolean = $state(false);

  let cleanDomain = $derived.by(() => {
    if (!domain) return null;
    try { return new URL(domain).hostname; } catch {}
    return domain.replace(/^https?:\/\//, "").split("/")[0];
  });

  // Served via our worker proxy (cached), so the browser never talks to
  // Google's favicon service directly about which companies the user views.
  let logoUrl = $derived(
    cleanDomain && !imgFailed
      ? `/api/logo?domain=${encodeURIComponent(cleanDomain)}`
      : null
  );

  let radius = $derived(Math.round(size * 0.25));
  let fontSize = $derived(Math.round(size * 0.32));
</script>

<div
  class="logo-mark"
  style="width: {size}px; height: {size}px; border-radius: {radius}px; font-size: {fontSize}px;"
>
  {#if logoUrl}
    <img
      src={logoUrl}
      alt={name}
      onerror={() => { imgFailed = true; }}
    />
  {:else}
    {companyMark(name)}
  {/if}
</div>
