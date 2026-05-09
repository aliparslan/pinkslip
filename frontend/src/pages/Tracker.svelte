<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "../router";
  import { api } from "../lib/api";
  import { timeAgo, companyMark } from "../lib/utils";
  import CompanyLogo from "../components/CompanyLogo.svelte";
  import Briefcase from "phosphor-svelte/lib/Briefcase";
  import Plus from "phosphor-svelte/lib/Plus";
  import Trash from "phosphor-svelte/lib/Trash";
  import DotsThree from "phosphor-svelte/lib/DotsThree";

  type Stage = "Applied" | "Screen" | "Interview" | "Offer" | "Rejected" | "Ghosted";
  type App = { id: string; company_name: string; company_domain?: string; title: string; stage: Stage; next: string; updated_at: string; job_id?: string | null; url?: string };

  const ALL_STAGES: Stage[] = ["Applied", "Screen", "Interview", "Offer", "Rejected", "Ghosted"];
  const STAGE_ORDER: Stage[] = ["Interview", "Screen", "Applied", "Offer", "Rejected", "Ghosted"];

  let apps: App[] = $state([]);
  let loading: boolean = $state(true);
  let menuOpenId: string | null = $state(null);
  let showCreate = $state(false);
  let creating = $state(false);
  let createCompany = $state("");
  let createTitle = $state("");
  let createStage: Stage = $state("Applied");
  let createNext = $state("");
  let createUrl = $state("");
  let formError: string | null = $state(null);

  let activeCt = $derived(apps.filter((a) => a.stage !== "Rejected" && a.stage !== "Ghosted").length);

  let grouped = $derived.by(() => {
    const g: Record<string, App[]> = {};
    for (const stage of STAGE_ORDER) {
      const items = apps.filter((a) => a.stage === stage);
      if (items.length > 0) g[stage] = items;
    }
    return g;
  });

  async function setStage(appId: string, stage: Stage) {
    apps = apps.map(a => a.id === appId ? { ...a, stage, updated_at: new Date().toISOString() } : a);
    menuOpenId = null;
    try {
      await api.applications.update(appId, { stage });
    } catch {
      api.applications.list().then(res => { apps = (res.applications ?? []) as App[]; });
    }
  }

  async function reloadApps() {
    loading = true;
    try {
      const res = await api.applications.list();
      apps = (res.applications ?? []) as App[];
    } catch {
      apps = [];
    } finally {
      loading = false;
    }
  }

  async function createApplication() {
    if (!createCompany.trim() || !createTitle.trim() || creating) return;
    creating = true;
    formError = null;
    try {
      const created = await api.applications.create({
        company_name: createCompany.trim(),
        title: createTitle.trim(),
        stage: createStage,
        next: createNext.trim(),
        url: createUrl.trim(),
      });
      apps = [created as App, ...apps];
      showCreate = false;
      createCompany = "";
      createTitle = "";
      createStage = "Applied";
      createNext = "";
      createUrl = "";
    } catch (e: any) {
      formError = e.message;
    } finally {
      creating = false;
    }
  }

  async function deleteApplication(appId: string) {
    const previous = apps;
    apps = apps.filter((app) => app.id !== appId);
    menuOpenId = null;
    try {
      await api.applications.delete(appId);
    } catch {
      apps = previous;
    }
  }

  function handleRowClick(app: App) {
    if (app.job_id) {
      navigate(`/jobs/${app.job_id}`);
    } else if (app.url) {
      window.open(app.url, "_blank", "noopener,noreferrer");
    }
  }

  onMount(() => {
    reloadApps();
  });
</script>

<div class="page" style="padding-top: 0;">
  <div class="page-frame">
    <div class="page-hero">
      <div class="page-hero-copy">
        <div class="h-display" style="font-size: 28px; letter-spacing: -0.02em;">
          Tracker
        </div>
        <p class="page-subtitle">
          Keep a clean view of active loops, one-off applications, and where each conversation stands.
        </p>
      </div>
      <button
        class="btn-secondary"
        style="height: 34px; padding: 0 12px; flex-shrink: 0; font-size: 12px;"
        aria-label="Add application"
        onclick={() => showCreate = true}
      >
        <Plus size={14} />
        Add
      </button>
    </div>
    <div class="stat-row" style="margin-bottom: 8px;">
      <span><strong style="color: var(--color-ink);">{activeCt}</strong> active</span>
      <span><strong style="color: var(--color-ink);">{apps.length}</strong> total</span>
    </div>
  </div>

  {#if loading}
    <div style="padding: 48px 16px; text-align: center; color: var(--color-ink-3); font-family: var(--font-mono); font-size: 12px;">
      Loading...
    </div>
  {:else if apps.length === 0}
    <div style="text-align: center; padding: 48px 24px;">
      <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 16px; color: var(--color-ink-3);">
        <Briefcase size={24} />
      </div>
      <div class="h-display" style="font-size: 20px; color: var(--color-ink-2); margin-bottom: 8px;">
        No applications yet
      </div>
      <div style="font-size: 13px; color: var(--color-ink-3); line-height: 1.5; max-width: 280px; margin: 0 auto;">
        Track jobs from the feed or add one-off applications from referrals, recruiters, and random links.
      </div>
    </div>
  {:else}
    <!-- Grouped sections -->
    {#each Object.entries(grouped) as [stage, items]}
      <div>
        <div class="list-section-label">
          <span>{stage}</span>
          <span class="list-section-count">{items.length}</span>
        </div>
        {#each items as app (app.id)}
          <div
            role="button"
            tabindex="0"
            style="display: grid; grid-template-columns: 24px 1fr auto; gap: 12px; align-items: center; padding: 10px 16px; border-bottom: 0.5px solid var(--color-line); cursor: pointer; position: relative;"
            onclick={() => handleRowClick(app)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowClick(app); } }}
          >
            <CompanyLogo name={app.company_name} domain={app.company_domain} size={24} />
            <div style="min-width: 0;">
              <div style="font-size: 14px; font-weight: 600; color: var(--color-ink); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                {app.title}
              </div>
              <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 3px; display: flex; align-items: center; gap: 6px;">
                <span>{app.company_name}</span>
                {#if app.next}
                  <span style="opacity: 0.5;">·</span>
                  <span>{app.next}</span>
                {/if}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <div style="text-align: right;">
                <div style="font-size: 11px; color: var(--color-ink-3); font-variant-numeric: tabular-nums;">
                  {timeAgo(app.updated_at)}
                </div>
              </div>
              <button
                class="icon-btn"
                style="width: 28px; height: 28px; flex-shrink: 0;"
                aria-label="Change stage"
                onclick={(e) => { e.stopPropagation(); menuOpenId = menuOpenId === app.id ? null : app.id; }}
              >
                <DotsThree size={16} weight="bold" color="var(--color-ink-3)" />
              </button>
            </div>

            <!-- Stage picker dropdown -->
            {#if menuOpenId === app.id}
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus -->
              <div
                role="menu"
                tabindex="-1"
                style="position: absolute; right: 12px; top: 100%; z-index: 20; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 12px; padding: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); min-width: 160px;"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => { if (e.key === 'Escape') menuOpenId = null; }}
              >
                {#each ALL_STAGES as s}
                  <button
                    style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: 0; background: {app.stage === s ? 'var(--color-bg-sunken)' : 'transparent'}; border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--color-ink); font-weight: {app.stage === s ? '600' : '400'};"
                    onclick={() => setStage(app.id, s)}
                  >
                    <span class="stage-badge stage-{s.toLowerCase()}" style="pointer-events: none;">
                      <span class="dot"></span>{s}
                    </span>
                  </button>
                {/each}
                <div style="height: 0.5px; background: var(--color-line); margin: 4px 0;"></div>
                <button
                  style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: 0; background: transparent; border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--color-bad);"
                  onclick={() => deleteApplication(app.id)}
                >
                  <Trash size={14} />
                  Delete
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</div>

{#if showCreate}
  <div
    style="position: fixed; inset: 0; z-index: 70; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
    role="presentation"
    onclick={() => showCreate = false}
  >
    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      style="width: 100%; max-width: 360px; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 16px; padding: 20px;"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => {
        if (event.key === "Escape") showCreate = false;
      }}
    >
      <div class="h-display" style="font-size: 24px; margin-bottom: 6px;">Add application</div>
      <div style="font-size: 13px; color: var(--color-ink-3); margin-bottom: 16px;">
        Track referrals, recruiter leads, and anything outside the watched feeds.
      </div>
      {#if formError}
        <div style="padding: 12px 14px; border-radius: 12px; margin-bottom: 12px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad);">
          {formError}
        </div>
      {/if}
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <input class="input-field" placeholder="Company" bind:value={createCompany} />
        <input class="input-field" placeholder="Title" bind:value={createTitle} />
        <select class="input-field" bind:value={createStage}>
          {#each ALL_STAGES as stage}
            <option value={stage}>{stage}</option>
          {/each}
        </select>
        <input class="input-field" placeholder="Next step note" bind:value={createNext} />
        <input class="input-field" placeholder="URL (optional)" bind:value={createUrl} />
      </div>
      <div class="action-row" style="margin-top: 16px;">
        <button class="btn-primary btn-accent" style="flex: 1;" onclick={createApplication} disabled={creating}>
          {creating ? "Saving..." : "Add"}
        </button>
        <button class="btn-secondary" onclick={() => showCreate = false}>
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
