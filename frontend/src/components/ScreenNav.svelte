<script lang="ts">
  import type { Snippet } from "svelte";
  import CaretLeft from "phosphor-svelte/lib/CaretLeft";

  let {
    title,
    backLabel = "Back",
    onBack,
    trailing,
  }: {
    title: string;
    backLabel?: string;
    onBack: () => void;
    trailing?: Snippet;
  } = $props();
</script>

<header class="screen-nav">
  <div class="screen-nav__leading">
    <button class="screen-nav__back" aria-label={backLabel} onclick={onBack}>
      <CaretLeft size={22} weight="bold" />
    </button>
  </div>
  <div class="screen-nav__title" title={title}>{title}</div>
  <div class="screen-nav__trailing">
    {#if trailing}
      {@render trailing()}
    {/if}
  </div>
</header>
