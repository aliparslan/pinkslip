<script lang="ts">
  let { score }: { score: number } = $props();

  let tier = $derived(
    score >= 70 ? "good" :
    score >= 40 ? "warn" :
    "muted"
  );

  let cssVar = $derived(tier === "muted" ? "--color-ink-3" : `--color-${tier}`);
</script>

<span
  class="score-badge"
  style="background: color-mix(in oklch, var({cssVar}) 15%, transparent); color: var({cssVar}); border: 1px solid color-mix(in oklch, var({cssVar}) 30%, transparent);"
>
  {score}
</span>

<style>
  .score-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
  }
</style>
