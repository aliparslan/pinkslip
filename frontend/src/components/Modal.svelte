<script lang="ts">
  import type { Snippet } from "svelte";
  import { focusTrap } from "../lib/focus-trap";

  let {
    title,
    subtitle = "",
    busy = false,
    maxWidth = 380,
    onclose,
    children,
  }: {
    title: string;
    subtitle?: string;
    busy?: boolean;
    maxWidth?: number;
    onclose: () => void;
    children: Snippet;
  } = $props();

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;

  function requestClose() {
    if (!busy) onclose();
  }
</script>

<div
  class="modal-backdrop"
  role="presentation"
  onclick={requestClose}
  onkeydown={(event) => { if (event.key === "Escape") requestClose(); }}
>
  <div
    class="modal-card"
    role="dialog"
    aria-modal="true"
    use:focusTrap
    aria-labelledby={titleId}
    tabindex="-1"
    style="--modal-max-width: {maxWidth}px;"
    onclick={(event) => event.stopPropagation()}
    onkeydown={(event) => { if (event.key === "Escape") requestClose(); }}
  >
    <h2 id={titleId} class="h-display modal-title">{title}</h2>
    {#if subtitle}
      <p class="modal-subtitle">{subtitle}</p>
    {/if}
    {@render children()}
  </div>
</div>
