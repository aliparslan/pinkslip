<script lang="ts">
  let { filters, selected, onSelect }: {
    filters: string[];
    selected: string;
    onSelect: (f: string) => void;
  } = $props();
</script>

<div style="position: relative;">
  <div class="flex gap-2 overflow-x-auto no-scrollbar" style="-webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent); mask-image: linear-gradient(to right, black calc(100% - 24px), transparent);">
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
