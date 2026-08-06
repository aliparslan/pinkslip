<script lang="ts">
  let { filters, selected, onSelect }: {
    filters: string[];
    selected: string;
    onSelect: (filter: string) => void;
  } = $props();
</script>

<div class="chip-wrap" role="group" aria-label="Filters">
  {#each filters as filter}
    <button
      type="button"
      class="chip {selected === filter ? 'chip-active' : ''}"
      onclick={() => onSelect(filter)}
      aria-pressed={selected === filter}
    >
      {filter}
    </button>
  {/each}
</div>
