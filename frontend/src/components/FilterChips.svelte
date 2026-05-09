<script lang="ts">
  import { onMount } from "svelte";

  let { filters, selected, onSelect, scrollable = false }: {
    filters: string[];
    selected: string;
    onSelect: (f: string) => void;
    scrollable?: boolean;
  } = $props();

  let stripEl = $state<HTMLDivElement | null>(null);
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  function updateScrollFade() {
    if (!scrollable || !stripEl) {
      canScrollLeft = false;
      canScrollRight = false;
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = stripEl;
    canScrollLeft = scrollLeft > 2;
    canScrollRight = scrollLeft + clientWidth < scrollWidth - 2;
  }

  onMount(() => {
    if (!scrollable) return;
    const frame = window.requestAnimationFrame(updateScrollFade);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && stripEl
        ? new ResizeObserver(() => updateScrollFade())
        : null;

    if (stripEl && resizeObserver) {
      resizeObserver.observe(stripEl);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  });

  $effect(() => {
    filters;
    selected;
    if (scrollable && typeof window !== "undefined") {
      window.requestAnimationFrame(updateScrollFade);
    }
  });
</script>

<div class={scrollable ? `chip-rail ${canScrollLeft ? "fade-left" : ""} ${canScrollRight ? "fade-right" : ""}` : ""}>
  <div
    bind:this={stripEl}
    class={scrollable ? "chip-strip" : "chip-wrap"}
    aria-label="Filters"
    onscroll={updateScrollFade}
  >
    {#each filters as filter}
      <button
        class="chip {selected === filter ? 'chip-active' : ''}"
        onclick={() => onSelect(filter)}
        aria-pressed={selected === filter}
      >
        {filter}
      </button>
    {/each}
  </div>
</div>
