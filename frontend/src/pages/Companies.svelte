<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Company } from "../lib/api";
  import CompanyRow from "../components/CompanyRow.svelte";
  import FilterChips from "../components/FilterChips.svelte";
  import Plus from "phosphor-svelte/lib/Plus";
  import Warning from "phosphor-svelte/lib/Warning";

  const ATS_TYPES = ["All", "greenhouse", "lever", "ashby", "custom"];

  let companies: Company[] = $state([]);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let selectedAts: string = $state("All");

  // Add company form
  let showAddForm: boolean = $state(false);
  let addName: string = $state("");
  let addAtsType: string = $state("greenhouse");
  let addSlug: string = $state("");
  let adding: boolean = $state(false);

  // Edit company
  let editTarget: { id: string; name: string; ats_type: string; ats_slug: string } | null = $state(null);
  let saving: boolean = $state(false);

  // Delete confirmation
  let deleteTarget: { id: string; name: string } | null = $state(null);
  let deleting: boolean = $state(false);
  let toast: string | null = $state(null);

  let filteredCompanies = $derived(
    selectedAts === "All"
      ? companies
      : companies.filter((c) => c.ats_type === selectedAts)
  );

  onMount(() => {
    loading = true;
    error = null;
    api.companies
      .list()
      .then((res) => { companies = res.companies ?? []; })
      .catch((e) => { error = e.message; })
      .finally(() => { loading = false; });
  });

  async function handleToggle(id: string, enabled: boolean) {
    companies = companies.map((c) => (c.id === id ? { ...c, enabled } : c));
    try {
      await api.companies.toggle(id, enabled);
    } catch (e: any) {
      companies = companies.map((c) => (c.id === id ? { ...c, enabled: !enabled } : c));
      error = e.message;
    }
  }

  async function handleAdd() {
    const trimmedName = addName.trim();
    const trimmedSlug = addSlug.trim();
    if (!trimmedName || !trimmedSlug || adding) return;
    adding = true;
    try {
      const created = await api.companies.create({
        name: trimmedName,
        ats_type: addAtsType,
        ats_slug: trimmedSlug,
      });
      companies = [...companies, created].sort((a, b) => a.name.localeCompare(b.name));
      addName = "";
      addSlug = "";
      addAtsType = "greenhouse";
      showAddForm = false;
    } catch (e: any) {
      error = e.message;
    } finally {
      adding = false;
    }
  }

  function openEdit(id: string) {
    const c = companies.find((co) => co.id === id);
    if (!c) return;
    editTarget = { id: c.id, name: c.name, ats_type: c.ats_type, ats_slug: c.ats_slug };
  }

  async function handleSaveEdit() {
    if (!editTarget || saving) return;
    saving = true;
    const targetId = editTarget.id;
    const targetName = editTarget.name.trim();
    try {
      const updated = await api.companies.update(targetId, {
        name: targetName,
        ats_type: editTarget.ats_type,
        ats_slug: editTarget.ats_slug.trim(),
      });
      companies = companies.map((c) => (c.id === targetId ? { ...c, ...updated } : c));
      editTarget = null;
      toast = `${targetName} saved — polling...`;

      const pollResult = await api.companies.poll(targetId);
      companies = companies.map((c) => (c.id === targetId ? { ...c, ...pollResult } : c));

      if (pollResult.last_poll_status === "error") {
        toast = `${targetName}: still failing`;
      } else {
        toast = `${targetName} fixed` + (pollResult.new_jobs ? ` — ${pollResult.new_jobs} new jobs` : "");
      }
      setTimeout(() => { toast = null; }, 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  function promptDelete(id: string, name: string) {
    deleteTarget = { id, name };
  }

  async function handleHide() {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    await handleToggle(deleteTarget.id, false);
    deleteTarget = null;
    toast = `${name} hidden`;
    setTimeout(() => { toast = null; }, 2500);
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    deleting = true;
    const name = deleteTarget.name;
    try {
      await api.companies.delete(deleteTarget.id);
      companies = companies.filter((c) => c.id !== deleteTarget!.id);
      deleteTarget = null;
      toast = `${name} deleted`;
      setTimeout(() => { toast = null; }, 2500);
    } catch (e: any) {
      error = e.message;
    } finally {
      deleting = false;
    }
  }

  let enabledCount = $derived(companies.filter(c => c.enabled).length);
  let errorCount = $derived(companies.filter(c => c.last_poll_status === "error").length);
  let filteredAllEnabled = $derived(filteredCompanies.length > 0 && filteredCompanies.every(c => c.enabled));

  async function toggleAll(enable: boolean) {
    const ids = filteredCompanies.map(c => c.id);
    companies = companies.map(c => ids.includes(c.id) ? { ...c, enabled: enable } : c);
    try {
      await Promise.all(ids.map(id => api.companies.toggle(id, enable)));
    } catch (e: any) {
      companies = companies.map(c => ids.includes(c.id) ? { ...c, enabled: !enable } : c);
      error = e.message;
    }
  }
</script>

<div class="page">
  <div style="padding: 0 22px 28px;">
    <p class="h-eyebrow" style="margin-bottom: 6px;">Sources</p>
    <h1 class="h-display" style="font-size: 30px; margin-bottom: 14px;">
      Companies
    </h1>
    <div class="stat-row" style="margin-bottom: 16px;">
      <span><strong style="color: var(--color-ink);">{enabledCount}</strong> active</span>
      <span><strong style="color: var(--color-ink);">{companies.length}</strong> total</span>
      {#if errorCount > 0}
        <span><strong style="color: var(--color-bad);">{errorCount}</strong> error{errorCount !== 1 ? "s" : ""}</span>
      {/if}
    </div>

    <!-- Filter chips + toggle all -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
      <FilterChips
        filters={ATS_TYPES}
        selected={selectedAts}
        onSelect={(f) => (selectedAts = f)}
      />
      <div style="display: flex; gap: 8px; flex-shrink: 0; margin-left: 12px;">
        {#if filteredCompanies.length > 0}
          <button
            class="btn-secondary"
            style="height: 28px; padding: 0 12px; font-size: 11px;"
            onclick={() => toggleAll(!filteredAllEnabled)}
          >
            {filteredAllEnabled ? "Deselect all" : "Select all"}
          </button>
        {/if}
        <button
          class="btn-primary btn-accent"
          style="height: 28px; padding: 0 12px; font-size: 11px; gap: 4px;"
          onclick={() => { showAddForm = !showAddForm; }}
        >
          <Plus size={12} weight="bold" />
          Add
        </button>
      </div>
    </div>

    <!-- Add company form -->
    {#if showAddForm}
      <div style="padding: 16px; border-radius: 14px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 20px; animation: fade-in 0.2s;">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Add a company</div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div>
            <label for="add-name" style="font-family: var(--font-mono); font-size: 10px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;">Company name</label>
            <input id="add-name" class="input-field" type="text" placeholder="e.g. Stripe" bind:value={addName} />
          </div>
          <div style="display: flex; gap: 10px;">
            <div style="flex: 1;">
              <label for="add-ats" style="font-family: var(--font-mono); font-size: 10px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;">ATS type</label>
              <select id="add-ats" class="input-field" bind:value={addAtsType}>
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
                <option value="ashby">Ashby</option>
              </select>
            </div>
            <div style="flex: 1;">
              <label for="add-slug" style="font-family: var(--font-mono); font-size: 10px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;">ATS slug</label>
              <input id="add-slug" class="input-field" type="text" placeholder="e.g. stripe" bind:value={addSlug} />
            </div>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button
              class="btn-primary btn-accent"
              style="flex: 1; height: 44px; font-size: 14px;"
              disabled={!addName.trim() || !addSlug.trim() || adding}
              onclick={handleAdd}
            >
              {adding ? "..." : "Add company"}
            </button>
            <button
              class="btn-secondary"
              style="padding: 0 18px;"
              onclick={() => { showAddForm = false; }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if loading}
      <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden;">
        {#each Array(5) as _, i}
          <div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; {i > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''}">
            <div class="skeleton" style="width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;"></div>
            <div style="flex: 1;">
              <div class="skeleton" style="width: 45%; height: 13px; margin-bottom: 6px;"></div>
              <div class="skeleton" style="width: 25%; height: 10px;"></div>
            </div>
            <div class="skeleton" style="width: 44px; height: 26px; border-radius: 999px;"></div>
          </div>
        {/each}
      </div>
    {:else if error}
      <div style="padding: 16px 18px; border-radius: var(--radius-md); background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 14px;">
        {error}
      </div>
    {:else if filteredCompanies.length === 0}
      <div style="text-align: center; padding: 48px 24px; color: var(--color-ink-3);">
        <div class="h-display" style="font-size: 24px; color: var(--color-ink-2); margin-bottom: 8px;">
          No companies found
        </div>
        <div style="font-size: 13.5px;">Adjust your filters or add a company.</div>
      </div>
    {:else}
      <div style="background: var(--color-bg-elev); border: 0.5px solid var(--color-line); border-radius: 14px; overflow: hidden;">
        {#each filteredCompanies as company (company.id)}
          <CompanyRow {company} onToggle={handleToggle} onDelete={promptDelete} onEdit={openEdit} />
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Edit company modal -->
{#if editTarget}
  <div
    style="position: fixed; inset: 0; z-index: 70; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
    role="presentation"
    onclick={() => { editTarget = null; }}
    onkeydown={(e) => { if (e.key === 'Escape') editTarget = null; }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-title"
      tabindex="-1"
      style="width: 100%; max-width: 340px; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 18px; padding: 24px; animation: fade-in 0.15s;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') editTarget = null; }}
    >
      <div id="edit-title" style="font-size: 17px; font-weight: 600; margin-bottom: 16px;">Edit company</div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div>
          <label for="edit-name" style="font-family: var(--font-mono); font-size: 10px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;">Name</label>
          <input id="edit-name" class="input-field" type="text" bind:value={editTarget.name} />
        </div>
        <div style="display: flex; gap: 10px;">
          <div style="flex: 1;">
            <label for="edit-ats" style="font-family: var(--font-mono); font-size: 10px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;">ATS type</label>
            <select id="edit-ats" class="input-field" bind:value={editTarget.ats_type}>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
            </select>
          </div>
          <div style="flex: 1;">
            <label for="edit-slug" style="font-family: var(--font-mono); font-size: 10px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; display: block;">ATS slug</label>
            <input id="edit-slug" class="input-field" type="text" bind:value={editTarget.ats_slug} />
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <button
            class="btn-primary btn-accent"
            style="flex: 1; height: 44px; font-size: 14px;"
            disabled={!editTarget.name.trim() || !editTarget.ats_slug.trim() || saving}
            onclick={handleSaveEdit}
          >
            {saving ? "..." : "Save"}
          </button>
          <button
            class="btn-secondary"
            style="padding: 0 18px;"
            onclick={() => { editTarget = null; }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Delete confirmation modal -->
{#if deleteTarget}
  <div
    style="position: fixed; inset: 0; z-index: 70; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
    role="presentation"
    onclick={() => { deleteTarget = null; }}
    onkeydown={(e) => { if (e.key === 'Escape') deleteTarget = null; }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      tabindex="-1"
      style="width: 100%; max-width: 340px; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 18px; padding: 24px; animation: fade-in 0.15s;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') deleteTarget = null; }}
    >
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); display: flex; align-items: center; justify-content: center;">
          <Warning size={18} color="var(--color-bad)" />
        </div>
        <div id="delete-title" style="font-size: 17px; font-weight: 600;">Remove {deleteTarget.name}?</div>
      </div>
      <p style="font-size: 13.5px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 20px;">
        This will permanently delete <strong>{deleteTarget.name}</strong> and all its job listings from the database. This affects all users.
        <br /><br />
        If you just want to stop seeing their jobs, <strong>hide</strong> them instead.
      </p>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button
          class="btn-secondary"
          style="width: 100%;"
          onclick={handleHide}
        >
          Just hide it
        </button>
        <button
          class="btn-primary"
          style="width: 100%; background: var(--color-bad); color: #fff; border-color: var(--color-bad);"
          disabled={deleting}
          onclick={handleDelete}
        >
          {deleting ? "..." : "Delete permanently"}
        </button>
        <button
          style="appearance: none; border: 0; background: transparent; cursor: pointer; font-size: 13px; color: var(--color-ink-3); padding: 8px 0;"
          onclick={() => { deleteTarget = null; }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Toast -->
{#if toast}
  <div style="position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 80; background: var(--color-bg-elev); color: var(--color-ink); border: 1px solid var(--color-line); box-shadow: 0 4px 16px rgba(0,0,0,0.1); font-size: 13.5px; font-weight: 500; padding: 10px 20px; border-radius: 999px; animation: fade-in 0.15s; pointer-events: none;">
    {toast}
  </div>
{/if}
