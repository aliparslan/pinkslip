<script lang="ts">
  import Trash from "phosphor-svelte/lib/Trash";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import ArrowCounterClockwise from "phosphor-svelte/lib/ArrowCounterClockwise";
  import Flag from "phosphor-svelte/lib/Flag";
  import CompanyLogo from "./CompanyLogo.svelte";
  import Switch from "./Switch.svelte";
  import type { Company } from "../lib/api";

  let { company, admin = false, onToggle, onDelete, onEdit, onBlock, onRestore, onReport }: {
    company: Company;
    admin?: boolean;
    onToggle?: (id: string, enabled: boolean) => void;
    onDelete?: (id: string, name: string) => void;
    onEdit?: (id: string) => void;
    onBlock?: (id: string) => void;
    onRestore?: (id: string) => void;
    onReport?: (id: string, name: string) => void;
  } = $props();

  const atsUrls: Record<string, (slug: string) => string> = {
    greenhouse: (s) => `https://boards.greenhouse.io/${s}`,
    lever: (s) => `https://jobs.lever.co/${s}`,
    ashby: (s) => `https://jobs.ashbyhq.com/${s}`,
    workday: (s) => s,
    rippling: (s) => `https://ats.rippling.com/${s}/jobs`,
    gem: (s) => `https://jobs.gem.com/${s}`,
    smartrecruiters: (s) => `https://jobs.smartrecruiters.com/${s}`,
    yc: (s) => `https://www.ycombinator.com/companies/${s}/jobs`,
  };

  let careersUrl = $derived(atsUrls[company.ats_type]?.(company.ats_slug) ?? null);
  let hasError = $derived(company.last_poll_status === "error");
</script>

<div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-top: 0.5px solid var(--color-line);">
  <CompanyLogo name={company.name} domain={company.website} size={36} />
  <div style="flex: 1; min-width: 0;">
    <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
      {#if careersUrl}
        <a href={careersUrl} target="_blank" rel="noopener noreferrer" style="font-weight: 600; font-size: 14px; color: var(--color-ink); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" onclick={(e) => e.stopPropagation()}>
          {company.name}
        </a>
      {:else}
        <div style="font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{company.name}</div>
      {/if}
    </div>
    <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
      <span class="tag">{company.ats_type}</span>
      {#if admin}
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{company.ats_slug}</span>
      {/if}
      {#if admin && hasError}
        <span style="font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--color-bad); background: color-mix(in oklch, var(--color-bad) 12%, transparent); padding: 1px 6px; border-radius: 4px; flex-shrink: 0;">ERR</span>
      {/if}
    </div>
  </div>
  {#if admin}
    <div style="display: flex; align-items: center; gap: 2px; flex-shrink: 0;">
      <button
        class="icon-btn"
        style="width: 32px; height: 32px;"
        aria-label="Edit {company.name}"
        onclick={() => onEdit?.(company.id)}
      >
        <PencilSimple size={15} color={hasError ? "var(--color-bad)" : "var(--color-ink-3)"} />
      </button>
      <button
        class="icon-btn"
        style="width: 32px; height: 32px;"
        aria-label="Delete {company.name}"
        onclick={() => onDelete?.(company.id, company.name)}
      >
        <Trash size={15} color="var(--color-ink-3)" />
      </button>
    </div>
    <Switch
      checked={Boolean(company.enabled)}
      onCheckedChange={(v) => onToggle?.(company.id, v)}
      aria-label="Enable {company.name}"
    />
  {:else if company.blocked}
    <button
      class="btn-secondary"
      style="height: 34px; padding: 0 11px; font-size: 11px; flex-shrink: 0;"
      onclick={() => onRestore?.(company.id)}
    >
      <ArrowCounterClockwise size={14} />
      Restore
    </button>
  {:else}
    <div style="display: flex; gap: 2px; flex-shrink: 0;">
      <button
        class="icon-btn"
        style="width: 34px; height: 34px;"
        aria-label="Report a problem with {company.name}"
        onclick={() => onReport?.(company.id, company.name)}
      >
        <Flag size={15} color="var(--color-ink-3)" />
      </button>
      <button
        class="icon-btn"
        style="width: 34px; height: 34px;"
        aria-label="Hide {company.name}"
        onclick={() => onBlock?.(company.id)}
      >
        <EyeSlash size={16} color="var(--color-ink-3)" />
      </button>
    </div>
  {/if}
</div>
