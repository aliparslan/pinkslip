<script lang="ts">
  import { resolveApiUrl } from "../lib/api";
  import { isIosApp } from "../lib/platform";
  import { companyMark } from "../lib/utils";

  let { name, domain, size = 44 }: {
    name: string;
    domain?: string | null;
    size?: number;
  } = $props();

  let imgFailed: boolean = $state(false);
  const nativeIos = isIosApp();

  let cleanDomain = $derived.by(() => {
    if (!domain) return null;
    try { return new URL(domain).hostname; } catch {}
    return domain.replace(/^https?:\/\//, "").split("/")[0];
  });

  // Served via our worker proxy (cached), so the browser never talks to
  // Google's favicon service directly about which companies the user views.
  let logoUrl = $derived(
    cleanDomain && !imgFailed
      ? resolveApiUrl(`/logo?domain=${encodeURIComponent(cleanDomain)}`)
      : null
  );

  let radius = $derived(Math.round(size * 0.25));
  let fontSize = $derived(Math.round(size * 0.32));
</script>

<!-- radius/font-size scale proportionally with the `size` prop across call
     sites, so they can't sit on a fixed token — allowed explicitly in
     .stylelintrc.json rather than a disable comment (none is possible inside
     an inline style="" attribute). -->
<div
  class="logo-mark"
  style="width: {size}px; height: {size}px; border-radius: {radius}px; font-size: {fontSize}px;"
>
  {#if logoUrl}
    <img
      src={logoUrl}
      alt={name}
      loading={nativeIos ? "lazy" : "eager"}
      decoding={nativeIos ? "async" : "auto"}
      onerror={() => { imgFailed = true; }}
    />
  {:else}
    {companyMark(name)}
  {/if}
</div>
