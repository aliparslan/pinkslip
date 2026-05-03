<script lang="ts">
  let { filters, selected, onSelect }: {
    filters: string[];
    selected: string;
    onSelect: (f: string) => void;
  } = $props();
</script>

<div class="flex gap-2 overflow-x-auto no-scrollbar">
  {#each filters as filter}
    <button
      class="chip {selected === filter ? 'chip-active' : ''}"
      onclick={() => onSelect(filter)}
    >
      {filter}
    </button>
  {/each}
</div>
