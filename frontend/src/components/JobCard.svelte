<script lang="ts">
  import { navigate } from "../router";
  import ScoreBadge from "./ScoreBadge.svelte";

  let { job }: { job: any } = $props();

  function timeAgo(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
</script>

<div
  class="card card-compact bg-base-200 cursor-pointer hover:bg-base-300 transition-colors"
  role="button"
  tabindex="0"
  onclick={() => navigate(`/jobs/${job.id}`)}
  onkeydown={(e) => e.key === "Enter" && navigate(`/jobs/${job.id}`)}
>
  <div class="card-body gap-1">
    <div class="flex items-start justify-between gap-2">
      <h3 class="font-semibold text-base leading-snug">{job.title}</h3>
      <ScoreBadge score={job.score ?? 0} />
    </div>
    <p class="text-sm text-base-content/70">{job.company_name}</p>
    <div class="flex items-center gap-2 text-xs text-base-content/50 mt-1">
      {#if job.location}
        <span>{job.location}</span>
        <span>·</span>
      {/if}
      <span>{timeAgo(job.posted_at ?? job.created_at ?? new Date().toISOString())}</span>
    </div>
  </div>
</div>
