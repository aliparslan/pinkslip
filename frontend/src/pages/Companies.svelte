<script lang="ts">
  import { fly } from "svelte/transition";
  import { onMount } from "svelte";
  import { api, type Company } from "../lib/api";
  import { focusTrap } from "../lib/focus-trap";
  import { sessionAccess } from "../lib/session-access";
  import CompanyRow from "../components/CompanyRow.svelte";
  import FilterChips from "../components/FilterChips.svelte";
  import Plus from "phosphor-svelte/lib/Plus";
  import Warning from "phosphor-svelte/lib/Warning";

  const ATS_TYPES = [
    "All",
    "greenhouse",
    "lever",
    "ashby",
    "workday",
    "rippling",
    "gem",
    "smartrecruiters",
    "yc",
    "custom",
  ];
  const USER_VIEWS = ["All", "Hidden"];

  const SOURCE_INPUTS: Record<string, { label: string; type: string; placeholder: string }> = {
    workday: {
      label: "Board URL",
      type: "url",
      placeholder: "https://company.wd5.myworkdayjobs.com/en-US/Site",
    },
    rippling: {
      label: "Board slug or URL",
      type: "text",
      placeholder: "e.g. pace",
    },
    gem: {
      label: "Board slug or URL",
      type: "text",
      placeholder: "e.g. gem",
    },
    smartrecruiters: {
      label: "Company identifier or URL",
      type: "text",
      placeholder: "e.g. smartrecruiters",
    },
    yc: {
      label: "YC company slug or URL",
      type: "text",
      placeholder: "e.g. onechronos",
    },
  };

  function sourceInput(type: string) {
    return SOURCE_INPUTS[type] ?? {
      label: "ATS slug",
      type: "text",
      placeholder: "e.g. stripe",
    };
  }

  let companies: Company[] = $state([]);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let selectedAts: string = $state("All");
  let selectedView: string = $state("All");
  let search: string = $state("");
  let showDisabled: boolean = $state(false);

  // Add company form
  let showAddForm: boolean = $state(false);
  let addName: string = $state("");
  let addAtsType: string = $state("greenhouse");
  let addSlug: string = $state("");
  let addWebsite: string = $state("");
  let adding: boolean = $state(false);
  let addVerifyBusy: boolean = $state(false);
  let addVerifyError: string | null = $state(null);
  let addVerifyMsg: string | null = $state(null);

  // Edit company
  let editTarget: { id: string; name: string; ats_type: string; ats_slug: string } | null = $state(null);
  let saving: boolean = $state(false);
  let editVerifyBusy: boolean = $state(false);
  let editVerifyError: string | null = $state(null);
  let editVerifyMsg: string | null = $state(null);

  // Delete confirmation
  let deleteTarget: { id: string; name: string } | null = $state(null);
  let deleting: boolean = $state(false);
  let toast: string | null = $state(null);
  let reportTarget: { id: string; name: string } | null = $state(null);
  let reportNotes: string = $state("");
  let reporting: boolean = $state(false);
  let showCompanyRequest: boolean = $state(false);
  let requestCompanyName: string = $state("");
  let requestCareersUrl: string = $state("");
  let requestCompanyNotes: string = $state("");
  let requestingCompany: boolean = $state(false);
  let requestCompanyError: string | null = $state(null);

  let filteredCompanies = $derived(
    companies.filter((c) => {
      const matchesAts = selectedAts === "All" || c.ats_type === selectedAts;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query === "" ||
        c.name.toLowerCase().includes(query) ||
        c.ats_slug.toLowerCase().includes(query);
      const matchesVisibility = $sessionAccess.isAdmin
        ? showDisabled || Boolean(c.enabled)
        : selectedView === "Hidden" ? Boolean(c.blocked) : !c.blocked;
      return matchesAts && matchesSearch && matchesVisibility;
    })
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

  async function handleBlock(id: string) {
    companies = companies.map((company) => company.id === id ? { ...company, blocked: true } : company);
    try {
      await api.companies.block(id);
      toast = "Company hidden from your feed";
      setTimeout(() => { toast = null; }, 2200);
    } catch (e: any) {
      companies = companies.map((company) => company.id === id ? { ...company, blocked: false } : company);
      error = e.message;
    }
  }

  async function handleRestore(id: string) {
    companies = companies.map((company) => company.id === id ? { ...company, blocked: false } : company);
    try {
      await api.companies.restore(id);
      toast = "Company restored";
      setTimeout(() => { toast = null; }, 2200);
    } catch (e: any) {
      companies = companies.map((company) => company.id === id ? { ...company, blocked: true } : company);
      error = e.message;
    }
  }

  async function submitCompanyReport() {
    if (!reportTarget || reporting) return;
    reporting = true;
    try {
      await api.interactions.report({
        company_id: reportTarget.id,
        report_type: "broken_source",
        notes: reportNotes,
      });
      toast = `Report sent for ${reportTarget.name}`;
      reportTarget = null;
      reportNotes = "";
      setTimeout(() => { toast = null; }, 2400);
    } catch (e: any) {
      error = e.message;
    } finally {
      reporting = false;
    }
  }

  async function submitCompanyRequest() {
    const companyName = requestCompanyName.trim();
    if (!companyName || requestingCompany) return;
    requestingCompany = true;
    requestCompanyError = null;
    try {
      const result = await api.interactions.submitFeedback({
        submission_type: "company_request",
        title: companyName,
        careers_url: requestCareersUrl.trim() || undefined,
        details: requestCompanyNotes.trim(),
      });
      showCompanyRequest = false;
      requestCompanyName = "";
      requestCareersUrl = "";
      requestCompanyNotes = "";
      toast = result.duplicate
        ? "That company is already in your request queue"
        : "Company request sent";
      setTimeout(() => { toast = null; }, 2600);
    } catch (e: any) {
      requestCompanyError = e.message;
    } finally {
      requestingCompany = false;
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
        website: addWebsite.trim() || undefined,
      });
      companies = [...companies, created].sort((a, b) => a.name.localeCompare(b.name));
      addName = "";
      addSlug = "";
      addWebsite = "";
      addAtsType = "greenhouse";
      showAddForm = false;
      addVerifyError = null;
      addVerifyMsg = null;
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
    editVerifyBusy = false;
    editVerifyError = null;
    editVerifyMsg = null;
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

  async function verifyAddSource() {
    if (!addSlug.trim() || addVerifyBusy) return;
    addVerifyBusy = true;
    addVerifyError = null;
    addVerifyMsg = null;
    try {
      const result = await api.companies.verify({
        ats_type: addAtsType,
        ats_slug: addSlug.trim(),
      });
      if (!result.ok) {
        addVerifyError = result.error ?? "Verification failed";
      } else {
        addVerifyMsg = `${result.total_jobs ?? 0} jobs found` + (
          result.sample_jobs?.[0]?.title ? ` · ${result.sample_jobs[0].title}` : ""
        );
      }
    } catch (e: any) {
      addVerifyError = e.message;
    } finally {
      addVerifyBusy = false;
    }
  }

  async function verifyEditSource() {
    if (!editTarget?.ats_slug.trim() || editVerifyBusy) return;
    editVerifyBusy = true;
    editVerifyError = null;
    editVerifyMsg = null;
    try {
      const result = await api.companies.verify({
        ats_type: editTarget.ats_type,
        ats_slug: editTarget.ats_slug.trim(),
      });
      if (!result.ok) {
        editVerifyError = result.error ?? "Verification failed";
      } else {
        editVerifyMsg = `${result.total_jobs ?? 0} jobs found` + (
          result.sample_jobs?.[0]?.title ? ` · ${result.sample_jobs[0].title}` : ""
        );
      }
    } catch (e: any) {
      editVerifyError = e.message;
    } finally {
      editVerifyBusy = false;
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
  <div class="page-frame" style="padding-left: 22px; padding-right: 22px;">
    <div class="page-hero" style="margin-bottom: 10px;">
      <div class="page-hero-copy">
        <h1 class="h-display page-title" style="font-size: 30px; margin: 0;">
          Companies
        </h1>
        <p class="page-subtitle">
          {#if $sessionAccess.isAdmin}
            Shared catalog, source health, and polling controls.
          {:else}
            Companies pinkslip monitors directly for new roles.
          {/if}
        </p>
      </div>
    </div>
    <div class="stat-row" style="margin-bottom: 16px;">
      <span><strong style="color: var(--color-ink);">{enabledCount}</strong> active</span>
      <span><strong style="color: var(--color-ink);">{companies.length}</strong> total</span>
      {#if $sessionAccess.isAdmin && errorCount > 0}
        <span><strong style="color: var(--color-bad);">{errorCount}</strong> error{errorCount !== 1 ? "s" : ""}</span>
      {/if}
      {#if $sessionAccess.isAdmin && !showDisabled}
        <span>disabled hidden</span>
      {/if}
    </div>

    <!-- Filter chips + toggle all -->
    <div class="surface-card-padded" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
      <input
        class="input-field"
        type="search"
        placeholder={$sessionAccess.isAdmin ? "Search companies or ATS slugs" : "Search companies"}
        bind:value={search}
      />
      <div style="display: flex; flex-direction: column; gap: 12px; min-width: 0;">
        <div style="min-width: 0;">
          {#if $sessionAccess.isAdmin}
            <FilterChips
              filters={ATS_TYPES}
              selected={selectedAts}
              onSelect={(f) => (selectedAts = f)}
            />
          {:else}
            <FilterChips
              filters={USER_VIEWS}
              selected={selectedView}
              onSelect={(f) => (selectedView = f)}
            />
          {/if}
        </div>
        {#if $sessionAccess.isAdmin}
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <button
              class="btn-secondary"
              style="height: 32px; padding: 0 12px; font-size: 12px;"
              onclick={() => showDisabled = !showDisabled}
            >
              {showDisabled ? "Hide disabled" : "Show disabled"}
            </button>
            {#if filteredCompanies.length > 0}
              <button
                class="btn-secondary"
                style="height: 32px; padding: 0 12px; font-size: 12px;"
                onclick={() => toggleAll(!filteredAllEnabled)}
              >
                {filteredAllEnabled ? "Deselect all" : "Select all"}
              </button>
            {/if}
            <button
              class="btn-primary btn-accent"
              style="height: 32px; padding: 0 12px; font-size: 12px; gap: 4px;"
              onclick={() => { showAddForm = !showAddForm; }}
            >
              <Plus size={12} weight="bold" />
              Add
            </button>
          </div>
        {:else}
          <button
            class="btn-secondary"
            style="height: 36px; padding: 0 14px; font-size: 12px; gap: 5px; align-self: flex-start;"
            onclick={() => {
              requestCompanyName = search.trim();
              requestCompanyError = null;
              showCompanyRequest = true;
            }}
          >
            <Plus size={13} weight="bold" />
            Request a company
          </button>
        {/if}
      </div>
    </div>

    <!-- Add company form -->
    {#if $sessionAccess.isAdmin && showAddForm}
      <div style="padding: 16px; border-radius: 14px; background: var(--color-bg-sunken); border: 1px solid var(--color-line-2); margin-bottom: 20px; animation: fade-in 0.2s;">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Add a company</div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div>
            <label for="add-name" class="field-label">Company name</label>
            <input id="add-name" class="input-field" type="text" placeholder="e.g. Stripe" bind:value={addName} />
          </div>
          <div style="display: flex; gap: 10px;">
            <div style="flex: 1;">
              <label for="add-ats" class="field-label">ATS type</label>
              <select id="add-ats" class="input-field" bind:value={addAtsType}>
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
                <option value="ashby">Ashby</option>
                <option value="workday">Workday</option>
                <option value="rippling">Rippling</option>
                <option value="gem">Gem</option>
                <option value="smartrecruiters">SmartRecruiters</option>
                <option value="yc">Y Combinator</option>
              </select>
            </div>
            <div style="flex: 1;">
              <label for="add-slug" class="field-label">{sourceInput(addAtsType).label}</label>
              <input
                id="add-slug"
                class="input-field"
                type={sourceInput(addAtsType).type}
                placeholder={sourceInput(addAtsType).placeholder}
                bind:value={addSlug}
              />
            </div>
          </div>
          <div>
            <label for="add-website" class="field-label">Website</label>
            <input id="add-website" class="input-field" type="url" placeholder="https://stripe.com" bind:value={addWebsite} />
          </div>
          {#if addVerifyError}
            <div style="padding: 10px 12px; border-radius: 12px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px;">
              {addVerifyError}
            </div>
          {/if}
          {#if addVerifyMsg}
            <div style="padding: 10px 12px; border-radius: 12px; background: color-mix(in oklch, var(--color-good) 14%, transparent); color: var(--color-good); font-size: 12px;">
              {addVerifyMsg}
            </div>
          {/if}
          <div class="action-row compact" style="margin-top: 4px;">
            <button
              class="btn-secondary"
              disabled={!addSlug.trim() || addVerifyBusy}
              onclick={verifyAddSource}
            >
              {addVerifyBusy ? "..." : "Verify"}
            </button>
            <button
              class="btn-primary btn-accent"
              style="flex: 1;"
              disabled={!addName.trim() || !addSlug.trim() || adding}
              onclick={handleAdd}
            >
              {adding ? "..." : "Add company"}
            </button>
            <button
              class="btn-secondary"
              onclick={() => { showAddForm = false; }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if loading}
      <div class="surface-list">
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
        <div style="font-size: 13px;">
          {$sessionAccess.isAdmin ? "Adjust your filters or add a company." : selectedView === "Hidden" ? "You have not hidden any companies." : "Try a different company name."}
        </div>
      </div>
    {:else}
      <div class="surface-list">
        {#each filteredCompanies as company (company.id)}
          <CompanyRow
            {company}
            admin={$sessionAccess.isAdmin}
            onToggle={handleToggle}
            onDelete={promptDelete}
            onEdit={openEdit}
            onBlock={handleBlock}
            onRestore={handleRestore}
            onReport={(id, name) => { reportTarget = { id, name }; }}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Edit company modal -->
{#if $sessionAccess.isAdmin && editTarget}
  <div
    style="position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
    role="presentation"
    onclick={() => { editTarget = null; }}
    onkeydown={(e) => { if (e.key === 'Escape') editTarget = null; }}
  >
    <div
      role="dialog"
      aria-modal="true"
      use:focusTrap
      aria-labelledby="edit-title"
      tabindex="-1"
      style="width: 100%; max-width: 340px; background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 18px; padding: 24px; animation: fade-in 0.15s;"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') editTarget = null; }}
    >
      <div id="edit-title" style="font-size: 17px; font-weight: 600; margin-bottom: 16px;">Edit company</div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div>
          <label for="edit-name" class="field-label">Name</label>
          <input id="edit-name" class="input-field" type="text" bind:value={editTarget.name} />
        </div>
        <div style="display: flex; gap: 10px;">
          <div style="flex: 1;">
            <label for="edit-ats" class="field-label">ATS type</label>
            <select id="edit-ats" class="input-field" bind:value={editTarget.ats_type}>
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
              <option value="workday">Workday</option>
              <option value="rippling">Rippling</option>
              <option value="gem">Gem</option>
              <option value="smartrecruiters">SmartRecruiters</option>
              <option value="yc">Y Combinator</option>
            </select>
          </div>
          <div style="flex: 1;">
            <label for="edit-slug" class="field-label">{sourceInput(editTarget.ats_type).label}</label>
            <input
              id="edit-slug"
              class="input-field"
              type={sourceInput(editTarget.ats_type).type}
              placeholder={sourceInput(editTarget.ats_type).placeholder}
              bind:value={editTarget.ats_slug}
            />
          </div>
        </div>
        {#if editVerifyError}
          <div style="padding: 10px 12px; border-radius: 12px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px;">
            {editVerifyError}
          </div>
        {/if}
        {#if editVerifyMsg}
          <div style="padding: 10px 12px; border-radius: 12px; background: color-mix(in oklch, var(--color-good) 14%, transparent); color: var(--color-good); font-size: 12px;">
            {editVerifyMsg}
          </div>
        {/if}
        <div class="action-row compact" style="margin-top: 4px;">
          <button
            class="btn-secondary"
            disabled={!editTarget.ats_slug.trim() || editVerifyBusy}
            onclick={verifyEditSource}
          >
            {editVerifyBusy ? "..." : "Verify"}
          </button>
          <button
            class="btn-primary btn-accent"
            style="flex: 1;"
            disabled={!editTarget.name.trim() || !editTarget.ats_slug.trim() || saving}
            onclick={handleSaveEdit}
          >
            {saving ? "..." : "Save"}
          </button>
          <button
            class="btn-secondary"
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
{#if $sessionAccess.isAdmin && deleteTarget}
  <div
    style="position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
    role="presentation"
    onclick={() => { deleteTarget = null; }}
    onkeydown={(e) => { if (e.key === 'Escape') deleteTarget = null; }}
  >
    <div
      role="dialog"
      aria-modal="true"
      use:focusTrap
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
      <p style="font-size: 13px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 20px;">
        This will permanently delete <strong>{deleteTarget.name}</strong> and all its job listings from the database. This affects all users.
        <br /><br />
        If you only want to pause this source, disable it for everyone instead.
      </p>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button
          class="btn-secondary"
          style="width: 100%;"
          onclick={handleHide}
        >
          Disable for everyone
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

{#if !$sessionAccess.isAdmin && showCompanyRequest}
  <div class="modal-backdrop" role="presentation" onclick={() => { if (!requestingCompany) showCompanyRequest = false; }}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      use:focusTrap
      aria-labelledby="company-request-title"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => { if (event.key === "Escape" && !requestingCompany) showCompanyRequest = false; }}
    >
      <div id="company-request-title" class="h-display" style="font-size: 22px; margin-bottom: 6px;">
        Request a company
      </div>
      <p style="font-size: 12px; color: var(--color-ink-3); line-height: 1.5; margin-bottom: 16px;">
        Tell us which company should join the catalog. A careers link helps us find the right source faster.
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label for="request-company-name" class="field-label">Company name</label>
          <input
            id="request-company-name"
            class="input-field"
            type="text"
            maxlength="160"
            placeholder="e.g. Figma"
            bind:value={requestCompanyName}
          />
        </div>
        <div>
          <label for="request-careers-url" class="field-label">Careers URL <span style="font-weight: 400; color: var(--color-ink-4);">optional</span></label>
          <input
            id="request-careers-url"
            class="input-field"
            type="url"
            placeholder="https://company.com/careers"
            bind:value={requestCareersUrl}
          />
        </div>
        <div>
          <label for="request-company-notes" class="field-label">Notes <span style="font-weight: 400; color: var(--color-ink-4);">optional</span></label>
          <textarea
            id="request-company-notes"
            class="input-field"
            rows="4"
            maxlength="2000"
            placeholder="Anything useful about the company or its job board"
            bind:value={requestCompanyNotes}
            style="height: auto; resize: vertical;"
          ></textarea>
        </div>
        {#if requestCompanyError}
          <div style="padding: 10px 12px; border-radius: 12px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px;">
            {requestCompanyError}
          </div>
        {/if}
      </div>
      <div class="action-row" style="margin-top: 16px;">
        <button class="btn-secondary" onclick={() => { showCompanyRequest = false; }} disabled={requestingCompany}>Cancel</button>
        <button
          class="btn-primary btn-accent"
          onclick={submitCompanyRequest}
          disabled={requestingCompany || requestCompanyName.trim().length < 2}
        >
          {requestingCompany ? "Sending..." : "Send request"}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if !$sessionAccess.isAdmin && reportTarget}
  <div class="modal-backdrop" role="presentation" onclick={() => { if (!reporting) reportTarget = null; }}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      use:focusTrap
      aria-labelledby="company-report-title"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => { if (event.key === "Escape" && !reporting) reportTarget = null; }}
    >
      <div id="company-report-title" class="h-display" style="font-size: 22px; margin-bottom: 6px;">
        Report {reportTarget.name}
      </div>
      <p style="font-size: 12px; color: var(--color-ink-3); line-height: 1.5; margin-bottom: 16px;">
        Let us know if its careers source is stale, broken, or missing jobs.
      </p>
      <textarea
        class="input-field"
        rows="4"
        placeholder="What did you notice?"
        bind:value={reportNotes}
        style="height: auto; resize: vertical; margin-bottom: 14px;"
      ></textarea>
      <div class="action-row">
        <button class="btn-secondary" onclick={() => { reportTarget = null; }} disabled={reporting}>Cancel</button>
        <button class="btn-primary btn-accent" onclick={submitCompanyReport} disabled={reporting}>
          {reporting ? "Sending..." : "Send report"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Toast -->
{#if toast}
  <div class="toast-wrap">
    <div class="toast-pill" in:fly={{ y: -14, duration: 160 }} out:fly={{ y: -10, duration: 120 }}>
      {toast}
    </div>
  </div>
{/if}
