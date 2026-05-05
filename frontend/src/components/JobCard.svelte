<script lang="ts">
  import { navigate } from "../router";
  import { api, type Job } from "../lib/api";
  import { normalizeJobScore, scoreToneFromPercent } from "../lib/scoring";
  import { timeAgo } from "../lib/utils";
  import CompanyLogo from "./CompanyLogo.svelte";
  import MapPin from "phosphor-svelte/lib/MapPin";
  import CurrencyDollar from "phosphor-svelte/lib/CurrencyDollar";
  import X from "phosphor-svelte/lib/X";

  let { job, onDismiss }: { job: Job; onDismiss?: (id: string) => void } = $props();

  let dismissing: boolean = $state(false);

  let scorePercent = $derived(normalizeJobScore(job.score));
  let scoreColor = $derived(scoreToneFromPercent(scorePercent));
  let scoreLabel = $derived(
    scorePercent >= 70 ? "strong" :
    scorePercent >= 40 ? "solid" :
    "maybe"
  );

  async function handleDismiss(e: MouseEvent) {
    e.stopPropagation();
    if (dismissing) return;
    dismissing = true;
    try {
      await api.jobs.dismiss(job.id);
      onDismiss?.(job.id);
    } catch {
      dismissing = false;
    }
  }
</script>

<div
  class="card-base"
  role="button"
  tabindex="0"
  style="width: 100%; text-align: left; {dismissing ? 'opacity: 0.4; transition: opacity 0.2s;' : ''}"
  onclick={() => navigate(`/jobs/${job.id}`)}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/jobs/${job.id}`); } }}
>
  <div style="display: flex; gap: 14px; align-items: flex-start;">
    <CompanyLogo name={job.company_name ?? "?"} domain={job.company_domain} />
    <div style="flex: 1; min-width: 0;">
      <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); margin-bottom: 4px; letter-spacing: -0.005em;">
        {job.company_name} · {timeAgo(job.posted_at ?? job.first_seen_at ?? new Date().toISOString())}
      </div>
      <h3 class="h-display" style="font-size: 17px; line-height: 1.2;">
        {job.title}
      </h3>
      {#if job.location || job.salary}
        <div style="display: flex; align-items: center; gap: 4px; margin-top: 8px; font-size: 11.5px; color: var(--color-ink-3); letter-spacing: -0.005em; flex-wrap: wrap;">
          {#if job.location}
            <MapPin size={12} />
            <span>{job.location}</span>
          {/if}
          {#if job.location && job.salary}
            <span style="margin: 0 3px; color: var(--color-ink-4);">·</span>
          {/if}
          {#if job.salary}
            <CurrencyDollar size={12} />
            <span>{job.salary}</span>
          {/if}
        </div>
      {/if}
    </div>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0;">
      <button
        type="button"
        class="icon-btn"
        style="width: 28px; height: 28px; color: var(--color-ink-4);"
        aria-label="Dismiss"
        onclick={handleDismiss}
      >
        <X size={14} />
      </button>
      <span style="font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: {scoreColor}; letter-spacing: -0.02em; background: color-mix(in oklch, {scoreColor} 12%, transparent); padding: 2px 8px; border-radius: 8px;">
        {scorePercent}%
      </span>
      <span style="font-size: 10.5px; font-weight: 500; color: var(--color-ink-4);">
        {scoreLabel}
      </span>
    </div>
  </div>
</div>
