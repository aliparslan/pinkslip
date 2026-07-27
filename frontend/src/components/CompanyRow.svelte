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

<div class="grouped-row company-row">
  <CompanyLogo name={company.name} domain={company.website} size={36} />
  <div class="flex-fill">
    <div class="company-name-row">
      {#if careersUrl}
        <a class="company-name truncate" href={careersUrl} target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>
          {company.name}
        </a>
      {:else}
        <div class="company-name truncate">{company.name}</div>
      {/if}
    </div>
    {#if admin}
      <div class="company-meta">
        <span class="tag">{company.ats_type}</span>
        <span class="mono-value quiet truncate">{company.ats_slug}</span>
        {#if hasError}<span class="status-badge bad">ERR</span>{/if}
      </div>
    {/if}
  </div>
  {#if admin}
    <div class="icon-cluster">
      <button
        class="icon-btn icon-btn-sm"
        aria-label="Edit {company.name}"
        onclick={() => onEdit?.(company.id)}
      >
        <PencilSimple size={15} color={hasError ? "var(--color-bad)" : "var(--color-ink-3)"} />
      </button>
      <button
        class="icon-btn icon-btn-sm"
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
      class="btn-secondary row-action"
      onclick={() => onRestore?.(company.id)}
    >
      <ArrowCounterClockwise size={14} />
      Restore
    </button>
  {:else}
    <div class="icon-cluster">
      <button
        class="icon-btn icon-btn-sm"
        aria-label="Report a problem with {company.name}"
        onclick={() => onReport?.(company.id, company.name)}
      >
        <Flag size={15} color="var(--color-ink-3)" />
      </button>
      <button
        class="icon-btn icon-btn-sm"
        aria-label="Hide {company.name}"
        onclick={() => onBlock?.(company.id)}
      >
        <EyeSlash size={16} color="var(--color-ink-3)" />
      </button>
    </div>
  {/if}
</div>

<style>
  .company-row { gap: 12px; }
  .company-name-row {
    overflow: hidden;
    display: flex;
    align-items: center;
  }
  .company-name {
    color: var(--color-ink);
    font-size: var(--fs-md);
    font-weight: 600;
    text-decoration: none;
  }
  .company-meta {
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
