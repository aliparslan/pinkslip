<script lang="ts">
  import { navigate } from "../router";
  import { api, type Job } from "../lib/api";
  import { timeAgo } from "../lib/utils";
  import CompanyLogo from "./CompanyLogo.svelte";
  import MapPin from "phosphor-svelte/lib/MapPin";
  import X from "phosphor-svelte/lib/X";

  let { job, onDismiss }: { job: Job; onDismiss?: (id: string) => void } = $props();

  let dismissing: boolean = $state(false);

  let scoreColor = $derived(
    (job.score ?? 0) >= 70 ? "var(--color-good)" :
    (job.score ?? 0) >= 40 ? "var(--color-warn)" :
    "var(--color-ink-3)"
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
      <div style="display: flex; align-items: center; gap: 4px; margin-top: 8px; font-family: var(--font-mono); font-size: 11.5px; color: var(--color-ink-3); letter-spacing: -0.005em;">
        {#if job.location}
          <MapPin size={12} />
          <span>{job.location}</span>
        {/if}
        {#if job.location && job.department}
          <span style="margin: 0 3px; color: var(--color-ink-4);">·</span>
        {/if}
        {#if job.department}
          <span>{job.department}</span>
        {/if}
      </div>
    </div>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0;">
      <button
        type="button"
        style="appearance: none; border: 0; background: transparent; cursor: pointer; padding: 2px; color: var(--color-ink-4); border-radius: 6px; display: grid; place-items: center; transition: color 0.15s;"
        aria-label="Dismiss"
        onclick={handleDismiss}
      >
        <X size={14} />
      </button>
      <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: {scoreColor}; letter-spacing: -0.02em;">
        {job.score ?? 0}
      </span>
    </div>
  </div>
</div>
