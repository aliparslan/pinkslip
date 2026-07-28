<script lang="ts">
  import ArrowCounterClockwise from "phosphor-svelte/lib/ArrowCounterClockwise";
  import DotsThreeVertical from "phosphor-svelte/lib/DotsThreeVertical";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import Flag from "phosphor-svelte/lib/Flag";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import Trash from "phosphor-svelte/lib/Trash";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import { DropdownMenu } from "bits-ui";
  import type { Company } from "../lib/api";
  import CompanyLogo from "./CompanyLogo.svelte";
  import Switch from "./Switch.svelte";

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
    greenhouse: (slug) => `https://boards.greenhouse.io/${slug}`,
    lever: (slug) => `https://jobs.lever.co/${slug}`,
    ashby: (slug) => `https://jobs.ashbyhq.com/${slug}`,
    workday: (slug) => slug,
    rippling: (slug) => `https://ats.rippling.com/${slug}/jobs`,
    gem: (slug) => `https://jobs.gem.com/${slug}`,
    smartrecruiters: (slug) => `https://jobs.smartrecruiters.com/${slug}`,
    yc: (slug) => `https://www.ycombinator.com/companies/${slug}/jobs`,
  };

  let careersUrl = $derived(atsUrls[company.ats_type]?.(company.ats_slug) ?? null);
  let hasError = $derived(company.last_poll_status === "error");
  let isQuarantined = $derived(Boolean(company.quarantined_at));
  let actionsOpen = $state(false);
  let brokenSince = $derived(
    company.quarantined_at
      ? new Date(company.quarantined_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null
  );

  function sourceLabel(value: string) {
    const labels: Record<string, string> = {
      ashby: "Ashby",
      custom: "Custom",
      gem: "Gem",
      greenhouse: "Greenhouse",
      lever: "Lever",
      rippling: "Rippling",
      smartrecruiters: "SmartRecruiters",
      workday: "Workday",
      yc: "Y Combinator",
    };
    return labels[value] ?? value;
  }

  function friendlyError(value: string) {
    return value
      .replace(/Request timed out after (\d+)ms/gi, (_match, milliseconds: string) =>
        `Timed out after ${Math.round(Number(milliseconds) / 1000)} sec`)
      .replace(/\s+/g, " ")
      .trim();
  }

  $effect(() => {
    if (!actionsOpen) return;
    const closeOnScroll = () => { actionsOpen = false; };
    window.addEventListener("scroll", closeOnScroll, true);
    return () => window.removeEventListener("scroll", closeOnScroll, true);
  });
</script>

<div class="grouped-row company-row">
  <CompanyLogo name={company.name} domain={company.website} size={36} />
  <div class="flex-fill">
    <div class="company-name-row">
      {#if careersUrl}
        <a class="company-name truncate" href={careersUrl} target="_blank" rel="noopener noreferrer" onclick={(event) => event.stopPropagation()}>
          {company.name}
        </a>
      {:else}
        <div class="company-name truncate">{company.name}</div>
      {/if}
    </div>
    {#if admin}
      <div class="company-meta">
        <span class="tag">{sourceLabel(company.ats_type)}</span>
        <span class="company-slug" title={company.ats_slug}>{company.ats_slug}</span>
        {#if isQuarantined}
          <span class="status-badge bad">Paused</span>
        {:else if hasError}
          <span class="status-badge bad">Error</span>
        {/if}
      </div>
      {#if (isQuarantined || hasError) && company.last_poll_error}
        <details class="company-error">
          <summary title={company.last_poll_error}>
            <WarningCircle size={14} weight="fill" />
            <span>{friendlyError(company.last_poll_error)}{brokenSince ? ` · since ${brokenSince}` : ""}</span>
            <CaretDown class="company-error-caret" size={12} weight="bold" aria-hidden="true" />
          </summary>
        </details>
      {/if}
    {/if}
  </div>

  {#if admin}
    <div class="company-admin-controls">
      <Switch
        checked={Boolean(company.enabled)}
        onCheckedChange={(value) => onToggle?.(company.id, value)}
        aria-label="Enable {company.name}"
      />
      <DropdownMenu.Root bind:open={actionsOpen}>
        <DropdownMenu.Trigger
          class="icon-btn icon-btn-sm"
          aria-label="More actions for {company.name}"
        >
          <DotsThreeVertical size={19} weight="bold" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            class="company-actions"
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={12}
            strategy="fixed"
            preventScroll={false}
          >
            <DropdownMenu.Item class="company-action-item" onSelect={() => onEdit?.(company.id)}>
            <PencilSimple size={16} /> Edit source
            </DropdownMenu.Item>
            <DropdownMenu.Item class="company-action-item danger" onSelect={() => onDelete?.(company.id, company.name)}>
              <Trash size={16} /> Remove source
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  {:else if company.blocked}
    <button class="btn-secondary btn-mini row-action" onclick={() => onRestore?.(company.id)}>
      <ArrowCounterClockwise size={14} /> Restore
    </button>
  {:else}
    <div class="icon-cluster">
      <button class="icon-btn icon-btn-sm" aria-label="Report a problem with {company.name}" onclick={() => onReport?.(company.id, company.name)}>
        <Flag size={15} color="var(--color-ink-3)" />
      </button>
      <button class="icon-btn icon-btn-sm" aria-label="Hide {company.name}" onclick={() => onBlock?.(company.id)}>
        <EyeSlash size={16} color="var(--color-ink-3)" />
      </button>
    </div>
  {/if}
</div>

<style>
  .company-row {
    position: relative;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    padding: 12px;
    content-visibility: auto;
    contain-intrinsic-size: auto 68px;
  }

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
    min-width: 0;
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .company-slug {
    min-width: 0;
    overflow: hidden;
    color: var(--color-ink-4);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .company-error {
    min-width: 0;
    margin-top: 5px;
    color: var(--color-bad);
    font-size: var(--fs-xs);
    line-height: 1.35;
  }

  .company-error summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: flex-start;
    gap: 5px;
    cursor: pointer;
    list-style: none;
  }

  .company-error summary::-webkit-details-marker { display: none; }
  .company-error summary > :global(svg) { flex: none; margin-top: 1px; }

  .company-error:not([open]) span {
    display: -webkit-box;
    overflow: hidden;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  :global(.company-error-caret) { transition: transform var(--duration-fast) var(--ease-standard); }
  .company-error[open] :global(.company-error-caret) { transform: rotate(180deg); }

  .company-admin-controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  :global(.company-actions) {
    z-index: var(--z-overlay);
    width: min(188px, calc(100vw - 24px));
    padding: 5px;
    border: 1px solid var(--color-line-2);
    border-radius: var(--radius-md);
    background: var(--color-bg-elev);
    box-shadow: var(--shadow-overlay);
    outline: none;
  }

  :global(.company-action-item) {
    width: 100%;
    min-height: 40px;
    padding: 0 9px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    text-align: left;
    cursor: pointer;
  }

  :global(.company-action-item:hover),
  :global(.company-action-item[data-highlighted]) { background: var(--color-bg-sunken); }
  :global(.company-action-item.danger) { color: var(--color-bad); }

  @media (max-width: 390px) {
    .company-row { padding-right: 8px; }
  }
</style>
