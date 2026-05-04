<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "../router";
  import { api } from "../lib/api";
  import { timeAgo, companyMark } from "../lib/utils";
  import Briefcase from "phosphor-svelte/lib/Briefcase";
  import Plus from "phosphor-svelte/lib/Plus";
  import Trash from "phosphor-svelte/lib/Trash";

  type Stage = "Applied" | "Screen" | "Interview" | "Offer" | "Rejected" | "Ghosted";
  type App = { id: string; company_name: string; title: string; stage: Stage; next: string; updated_at: string; job_id?: string | null; url?: string };

  const ALL_STAGES: Stage[] = ["Applied", "Screen", "Interview", "Offer", "Rejected", "Ghosted"];

  let apps: App[] = $state([]);
  let loading: boolean = $state(true);
  let activeTab: "active" | "closed" = $state("active");
  let expandedId: string | null = $state(null);
  let showCreate = $state(false);
  let creating = $state(false);
  let createCompany = $state("");
  let createTitle = $state("");
  let createStage: Stage = $state("Applied");
  let createNext = $state("");
  let createUrl = $state("");
  let formError: string | null = $state(null);

  let stages = $derived([
    { id: "Applied", count: apps.filter((a) => a.stage === "Applied").length },
    { id: "Screen", count: apps.filter((a) => a.stage === "Screen").length },
    { id: "Interview", count: apps.filter((a) => a.stage === "Interview").length },
    { id: "Offer", count: apps.filter((a) => a.stage === "Offer").length },
  ]);

  let visible = $derived(
    apps.filter((a) => {
      const closed = a.stage === "Rejected" || a.stage === "Ghosted";
      return activeTab === "active" ? !closed : closed;
    })
  );

  let activeCt = $derived(apps.filter((a) => a.stage !== "Rejected" && a.stage !== "Ghosted").length);
  let closedCt = $derived(apps.length - activeCt);

  async function setStage(appId: string, stage: Stage) {
    apps = apps.map(a => a.id === appId ? { ...a, stage, updated_at: new Date().toISOString() } : a);
    expandedId = null;
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
    try {
      await api.applications.delete(appId);
    } catch {
      apps = previous;
    }
  }

  onMount(() => {
    reloadApps();
  });
</script>

<div class="page">
  <div style="padding: 0 22px 16px;">
    <h1 class="h-display" style="font-size: 30px; margin-bottom: 14px;">
      Your applications
    </h1>

    <!-- Pipeline stats -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 14px 4px; border-radius: 14px; background: var(--color-bg-sunken); border: 1px solid var(--color-line);">
      {#each stages as s, i}
        <div style="padding: 0 8px; {i > 0 ? 'border-left: 1px solid var(--color-line);' : ''} display: flex; flex-direction: column; align-items: center; gap: 4px;">
          <div style="font-family: var(--font-mono); font-size: 22px; font-weight: 600; color: {s.count > 0 ? 'var(--color-ink)' : 'var(--color-ink-4)'}; letter-spacing: -0.02em; line-height: 1;">
            {s.count}
          </div>
          <div style="font-size: 11px; font-weight: 500; color: var(--color-ink-3); line-height: 1.1;">{s.id}</div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Tabs -->
  <div style="display: flex; gap: 6px; padding: 0 22px 12px;">
    {#each [{ id: "active", label: "Active", count: activeCt }, { id: "closed", label: "Closed", count: closedCt }] as tab}
      <button
        style="appearance: none; border: 0; background: transparent; padding: 8px 0; margin-right: 18px; cursor: pointer; font-family: var(--font-sans); font-size: 14px; font-weight: 500; color: {activeTab === tab.id ? 'var(--color-ink)' : 'var(--color-ink-3)'}; border-bottom: 2px solid {activeTab === tab.id ? 'var(--color-ink)' : 'transparent'}; letter-spacing: -0.005em;"
        onclick={() => activeTab = tab.id as "active" | "closed"}
      >
        {tab.label}
        <span style="margin-left: 6px; color: var(--color-ink-4); font-family: var(--font-mono); font-size: 12px;">
          {tab.count}
        </span>
      </button>
    {/each}
  </div>

  <!-- Application list -->
  <div style="padding: 0 22px 28px; display: flex; flex-direction: column; gap: 8px;">
    {#if visible.length === 0}
      <div style="text-align: center; padding: 48px 24px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 16px; color: var(--color-ink-3);">
          <Briefcase size={24} />
        </div>
        <div class="h-display" style="font-size: 20px; color: var(--color-ink-2); margin-bottom: 8px;">
          No {activeTab} applications
        </div>
        <div style="font-size: 13px; color: var(--color-ink-3); line-height: 1.5; max-width: 280px; margin: 0 auto;">
          Track jobs from the feed or add one-off applications from referrals, recruiters, and random links.
        </div>
      </div>
    {:else}
      {#each visible as app (app.id)}
        <div class="card-base tracker-card" style="width: 100%;">
          <button type="button" style="appearance: none; border: 0; background: transparent; width: 100%; text-align: left; cursor: pointer; padding: 0;" onclick={() => expandedId = expandedId === app.id ? null : app.id}>
            <div style="display: flex; gap: 12px; align-items: center;">
              <div class="logo-mark" style="width: 36px; height: 36px; font-size: 12px; border-radius: 9px;">
                {companyMark(app.company_name)}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; gap: 8px; align-items: baseline;">
                  <div style="font-weight: 500; font-size: 14.5px;">{app.title}</div>
                  <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4);">{timeAgo(app.updated_at)}</div>
                </div>
                <div style="font-size: 12.5px; color: var(--color-ink-3); margin-top: 2px; margin-bottom: 8px;">
                  {app.company_name}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="stage-badge stage-{app.stage.toLowerCase()}">
                    <span class="dot"></span>{app.stage}
                  </span>
                  {#if app.next}
                    <span style="font-size: 11.5px; color: var(--color-ink-3); font-family: var(--font-mono);">
                      {app.next}
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          </button>

          {#if expandedId === app.id}
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-line); display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                {#each ALL_STAGES as stage}
                  <button
                    class="stage-badge stage-{stage.toLowerCase()}"
                    style="cursor: pointer; border: 0; opacity: {app.stage === stage ? 1 : 0.5}; transition: opacity .15s;"
                    onclick={() => setStage(app.id, stage)}
                  >
                    <span class="dot"></span>{stage}
                  </button>
                {/each}
              </div>
              <div style="display: flex; justify-content: space-between; gap: 8px; align-items: center;">
                {#if app.job_id}
                  <button class="btn-secondary" style="height: 36px; padding: 0 12px;" onclick={() => navigate(`/jobs/${app.job_id}`)}>
                    Open job
                  </button>
                {:else if app.url}
                  <a class="btn-secondary" style="height: 36px; padding: 0 12px; text-decoration: none;" href={app.url} target="_blank" rel="noopener noreferrer">
                    Open link
                  </a>
                {:else}
                  <span></span>
                {/if}
                <button class="btn-secondary" style="height: 36px; padding: 0 12px;" onclick={() => deleteApplication(app.id)}>
                  <Trash size={14} />
                  Delete
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <button
    class="btn-primary btn-accent"
    style="position: fixed; right: 20px; bottom: calc(env(safe-area-inset-bottom, 0px) + 86px); width: 58px; height: 58px; border-radius: 18px;"
    aria-label="Add application"
    onclick={() => showCreate = true}
  >
    <Plus size={22} />
  </button>
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
      style="width: 100%; max-width: 360px; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 18px; padding: 22px;"
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
      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button class="btn-primary btn-accent" style="flex: 1;" onclick={createApplication} disabled={creating}>
          {creating ? "Saving..." : "Add"}
        </button>
        <button class="btn-secondary" style="padding: 0 18px;" onclick={() => showCreate = false}>
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}
