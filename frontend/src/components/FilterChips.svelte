<script lang="ts">
  let { filters, selected, onSelect, scrollable = false }: {
    filters: string[];
    selected: string;
    onSelect: (f: string) => void;
    scrollable?: boolean;
  } = $props();
</script>

<div class={scrollable ? "chip-rail" : ""}>
  <div class={scrollable ? "chip-strip" : "chip-wrap"} aria-label="Filters">
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
