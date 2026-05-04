<script lang="ts">
  let { filters, selected, onSelect }: {
    filters: string[];
    selected: string;
    onSelect: (f: string) => void;
  } = $props();
</script>

<div style="position: relative;">
  <div
    class="flex flex-wrap items-center gap-2"
    style="padding: 1px 0 4px;"
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
