<script lang="ts">
  import Trash from "phosphor-svelte/lib/Trash";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import { companyMark } from "../lib/utils";
  import type { Company } from "../lib/api";

  let { company, onToggle, onDelete, onEdit }: {
    company: Company;
    onToggle: (id: string, enabled: boolean) => void;
    onDelete: (id: string, name: string) => void;
    onEdit: (id: string) => void;
  } = $props();

  const atsUrls: Record<string, (slug: string) => string> = {
    greenhouse: (s) => `https://boards.greenhouse.io/${s}`,
    lever: (s) => `https://jobs.lever.co/${s}`,
    ashby: (s) => `https://jobs.ashbyhq.com/${s}`,
  };

  let careersUrl = $derived(atsUrls[company.ats_type]?.(company.ats_slug) ?? null);
  let hasError = $derived(company.last_poll_status === "error");
</script>

<div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-top: 0.5px solid var(--color-line);">
  <div class="logo-mark" style="width: 36px; height: 36px; font-size: 12px; border-radius: 9px;">
    {companyMark(company.name)}
  </div>
  <div style="flex: 1; min-width: 0;">
    <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
      {#if careersUrl}
        <a href={careersUrl} target="_blank" rel="noopener noreferrer" style="font-weight: 500; font-size: 14.5px; color: var(--color-ink); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" onclick={(e) => e.stopPropagation()}>
          {company.name}
        </a>
      {:else}
        <div style="font-weight: 500; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{company.name}</div>
      {/if}
    </div>
    <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
      <span class="tag">{company.ats_type}</span>
      <span style="font-size: 11px; color: var(--color-ink-4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{company.ats_slug}</span>
      {#if hasError}
        <span style="font-size: 10px; font-weight: 600; color: var(--color-bad); background: color-mix(in oklch, var(--color-bad) 12%, transparent); padding: 1px 6px; border-radius: 4px; flex-shrink: 0;">Error</span>
      {/if}
    </div>
  </div>
  <button
    class="icon-btn"
    style="width: 34px; height: 34px; flex-shrink: 0;"
    aria-label="Edit {company.name}"
    onclick={() => onEdit(company.id)}
  >
    <PencilSimple size={15} color={hasError ? "var(--color-bad)" : "var(--color-ink-4)"} />
  </button>
  <button
    class="icon-btn"
    style="width: 34px; height: 34px; flex-shrink: 0;"
    aria-label="Delete {company.name}"
    onclick={() => onDelete(company.id, company.name)}
  >
    <Trash size={16} color="var(--color-ink-4)" />
  </button>
  <input
    type="checkbox"
    checked={company.enabled}
    onchange={(e) => onToggle(company.id, (e.target as HTMLInputElement).checked)}
  />
</div>
