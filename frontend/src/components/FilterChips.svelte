<script lang="ts">
  let {
    filters,
    selected,
    onSelect,
  }: {
    filters: string[];
    selected: string;
    onSelect: (f: string) => void;
  } = $props();
</script>

<div class="flex flex-wrap gap-2">
  {#each filters as filter}
    <button
      class="btn btn-xs {selected === filter ? 'btn-primary' : 'btn-ghost'}"
      onclick={() => onSelect(filter)}
    >
      {filter}
    </button>
  {/each}
</div>
