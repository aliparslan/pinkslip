<script lang="ts">
  let { score }: { score: number } = $props();

  let badgeClass = $derived(
    score >= 70 ? "badge-success" : score >= 40 ? "badge-warning" : "badge-ghost"
  );
</script>

<span class="badge {badgeClass} badge-sm font-mono">{score}</span>
