<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Company } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import { sessionAccess } from "../lib/session-access";
  import { feedback } from "../lib/feedback.svelte";
  import { companySourceLabel } from "../lib/company-sources";
  import CompanyRow from "../components/CompanyRow.svelte";
  import FilterChips from "../components/FilterChips.svelte";
  import Modal from "../components/Modal.svelte";
  import Spinner from "../components/Spinner.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Plus from "phosphor-svelte/lib/Plus";
  import { isIosApp } from "../lib/platform";
  import { headerChrome } from "../lib/header-chrome.svelte";

  let {
    mode = "user",
    embedded = false,
  }: {
    mode?: "user" | "admin";
    embedded?: boolean;
  } = $props();
  let isAdminMode = $derived(mode === "admin" && $sessionAccess.isAdmin);

  const MANAGED_ATS_TYPES = [
    "greenhouse",
    "lever",
    "ashby",
    "workday",
    "rippling",
    "gem",
    "smartrecruiters",
    "yc",
  ] as const;
  const ATS_TYPES = ["All", ...MANAGED_ATS_TYPES, "custom"];
  const USER_VIEWS = ["All", "Hidden"];
  const ADMIN_STATUSES = [
    { value: "active", label: "Active" },
    { value: "attention", label: "Needs attention" },
    { value: "disabled", label: "Disabled" },
    { value: "all", label: "Any status" },
  ] as const;
  const COMPANY_PAGE_SIZE = 40;

  type AdminStatus = typeof ADMIN_STATUSES[number]["value"];
  interface SourceVerification {
    busy: boolean;
    error: string | null;
    message: string | null;
  }

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

  function commitSearch(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    (event.currentTarget as HTMLInputElement).blur();
  }

  function resetVerification(state: SourceVerification) {
    state.busy = false;
    state.error = null;
    state.message = null;
  }

  let companies: Company[] = $state([]);
  let loading: boolean = $state(true);
  let loadError: string | null = $state(null);
  let selectedAts: string = $state("All");
  let selectedView: string = $state("All");
  let adminStatus: AdminStatus = $state("active");
  let search: string = $state("");
  let visibleCount: number = $state(COMPANY_PAGE_SIZE);
  let pendingVisibilityIds: Set<string> = $state(new Set());

  let showAddForm: boolean = $state(false);
  let addName: string = $state("");
  let addAtsType: string = $state("greenhouse");
  let addSlug: string = $state("");
  let addWebsite: string = $state("");
  let adding: boolean = $state(false);
  let addVerification = $state<SourceVerification>({ busy: false, error: null, message: null });

  let editTarget: { id: string; name: string; ats_type: string; ats_slug: string } | null = $state(null);
  let saving: boolean = $state(false);
  let editVerification = $state<SourceVerification>({ busy: false, error: null, message: null });

  let deleteTarget: { id: string; name: string } | null = $state(null);
  let deleting: boolean = $state(false);
  let reportTarget: { id: string; name: string } | null = $state(null);
  let reportNotes: string = $state("");
  let reporting: boolean = $state(false);
  let showCompanyRequest: boolean = $state(false);
  let requestCompanyName: string = $state("");
  let requestCareersUrl: string = $state("");
  let requestCompanyNotes: string = $state("");
  let requestingCompany: boolean = $state(false);
  let requestCompanyError: string | null = $state(null);
  const nativeIos = isIosApp();

  let filteredCompanies = $derived(
    companies.filter((c) => {
      const matchesAts = selectedAts === "All" || c.ats_type === selectedAts;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query === "" ||
        c.name.toLowerCase().includes(query) ||
        c.ats_slug.toLowerCase().includes(query);
      const enabled = Boolean(c.enabled);
      const needsAttention = c.last_poll_status === "error" || Boolean(c.quarantined_at);
      const matchesVisibility = isAdminMode
        ? adminStatus === "all"
          || (adminStatus === "active" && enabled)
          || (adminStatus === "disabled" && !enabled)
          || (adminStatus === "attention" && needsAttention)
        : enabled && (
          selectedView === "Hidden"
            ? Boolean(c.blocked)
            : nativeIos || !c.blocked
        );
      return matchesAts && matchesSearch && matchesVisibility;
    })
  );
  let visibleCompanies = $derived(filteredCompanies.slice(0, visibleCount));
  let remainingCompanyCount = $derived(Math.max(0, filteredCompanies.length - visibleCompanies.length));

  $effect(() => {
    selectedAts;
    selectedView;
    adminStatus;
    search;
    visibleCount = COMPANY_PAGE_SIZE;
  });
  let requestCandidate = $derived(search.trim());
  let hasExactCompanyMatch = $derived(
    requestCandidate.length > 0
      && companies.some((company) => company.name.trim().toLowerCase() === requestCandidate.toLowerCase())
  );
  let showRequestCandidate = $derived(
    !isAdminMode
      && selectedView === "All"
      && requestCandidate.length >= 2
      && !hasExactCompanyMatch
  );

  function openCompanyRequest() {
    requestCompanyName = requestCandidate;
    requestCompanyError = null;
    showCompanyRequest = true;
  }

  async function loadCompanies() {
    loading = true;
    loadError = null;
    try {
      const result = await api.companies.list();
      companies = result.companies ?? [];
    } catch (e) {
      loadError = errorMessage(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const unregisterHeaderSearch = nativeIos
      ? headerChrome.registerSearch({
          id: isAdminMode ? "sources" : "companies",
          placeholder: isAdminMode ? "Search sources" : "Search companies",
          value: () => search,
          onInput: (value) => { search = value; },
        })
      : () => undefined;
    void loadCompanies();
    return unregisterHeaderSearch;
  });

  async function handleToggle(id: string, enabled: boolean): Promise<boolean> {
    if (pendingVisibilityIds.has(id)) return false;
    pendingVisibilityIds = new Set([...pendingVisibilityIds, id]);
    companies = companies.map((c) => (c.id === id ? { ...c, enabled } : c));
    try {
      await api.companies.toggle(id, enabled);
      return true;
    } catch (e) {
      companies = companies.map((c) => (c.id === id ? { ...c, enabled: !enabled } : c));
      feedback.error(errorMessage(e, "Could not update that source."));
      return false;
    } finally {
      pendingVisibilityIds = new Set([...pendingVisibilityIds].filter((pendingId) => pendingId !== id));
    }
  }

  async function handleBlock(id: string) {
    if (pendingVisibilityIds.has(id)) return;
    pendingVisibilityIds = new Set([...pendingVisibilityIds, id]);
    companies = companies.map((company) => company.id === id ? { ...company, blocked: true } : company);
    try {
      await api.companies.block(id);
      if (!nativeIos) {
        feedback.success("Company hidden from jobs", {
          action: { label: "Undo", run: () => handleRestore(id) },
        });
      }
    } catch (e) {
      companies = companies.map((company) => company.id === id ? { ...company, blocked: false } : company);
      feedback.error(errorMessage(e, "Could not hide that company."));
    } finally {
      pendingVisibilityIds = new Set([...pendingVisibilityIds].filter((pendingId) => pendingId !== id));
    }
  }

  async function handleRestore(id: string) {
    if (pendingVisibilityIds.has(id)) return;
    pendingVisibilityIds = new Set([...pendingVisibilityIds, id]);
    companies = companies.map((company) => company.id === id ? { ...company, blocked: false } : company);
    try {
      await api.companies.restore(id);
      if (!nativeIos) feedback.success("Company restored");
    } catch (e) {
      companies = companies.map((company) => company.id === id ? { ...company, blocked: true } : company);
      feedback.error(errorMessage(e, "Could not restore that company."));
    } finally {
      pendingVisibilityIds = new Set([...pendingVisibilityIds].filter((pendingId) => pendingId !== id));
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
      feedback.success(`Report sent for ${reportTarget.name}`);
      reportTarget = null;
      reportNotes = "";
    } catch (e) {
      feedback.error(errorMessage(e, "Could not send that report."));
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
      feedback.success(result.duplicate
        ? "That company is already in your request queue"
        : "Company request sent");
    } catch (e) {
      requestCompanyError = errorMessage(e);
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
      addVerification.error = null;
      addVerification.message = null;
      feedback.success(`${trimmedName} added`);
    } catch (e) {
      feedback.error(errorMessage(e, "Could not add that company."));
    } finally {
      adding = false;
    }
  }

  function openEdit(id: string) {
    const c = companies.find((co) => co.id === id);
    if (!c) return;
    editTarget = { id: c.id, name: c.name, ats_type: c.ats_type, ats_slug: c.ats_slug };
    resetVerification(editVerification);
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
      feedback.show({
        message: `${targetName} saved · checking source`,
        tone: "info",
        duration: null,
        dedupeKey: `company-poll-${targetId}`,
      });

      const pollResult = await api.companies.poll(targetId);
      companies = companies.map((c) => (c.id === targetId ? { ...c, ...pollResult } : c));

      if (pollResult.last_poll_status === "error") {
        feedback.error(`${targetName} is still failing`, {
          duration: null,
          dedupeKey: `company-poll-${targetId}`,
        });
      } else {
        feedback.success(
          `${targetName} fixed` + (pollResult.new_jobs ? ` · ${pollResult.new_jobs} new jobs` : ""),
          { dedupeKey: `company-poll-${targetId}` },
        );
      }
    } catch (e) {
      feedback.error(errorMessage(e, "Could not save that company."));
    } finally {
      saving = false;
    }
  }

  async function verifySource(atsType: string, rawSlug: string, state: SourceVerification) {
    const atsSlug = rawSlug.trim();
    if (!atsSlug || state.busy) return;
    state.busy = true;
    state.error = null;
    state.message = null;
    try {
      const result = await api.companies.verify({
        ats_type: atsType,
        ats_slug: atsSlug,
      });
      if (!result.ok) {
        state.error = result.error ?? "Verification failed";
      } else {
        state.message = `${result.total_jobs ?? 0} jobs found` + (
          result.sample_jobs?.[0]?.title ? ` · ${result.sample_jobs[0].title}` : ""
        );
      }
    } catch (e) {
      state.error = errorMessage(e);
    } finally {
      state.busy = false;
    }
  }

  function verifyEditedSource() {
    if (!editTarget) return;
    return verifySource(editTarget.ats_type, editTarget.ats_slug, editVerification);
  }

  function promptDelete(id: string, name: string) {
    deleteTarget = { id, name };
  }

  async function handleHide() {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    const disabled = await handleToggle(deleteTarget.id, false);
    if (!disabled) return;
    deleteTarget = null;
    feedback.success(`${name} disabled`);
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    deleting = true;
    const name = deleteTarget.name;
    try {
      await api.companies.delete(deleteTarget.id);
      companies = companies.filter((c) => c.id !== deleteTarget!.id);
      deleteTarget = null;
      feedback.success(`${name} deleted`);
    } catch (e) {
      feedback.error(errorMessage(e, "Could not delete that company."));
    } finally {
      deleting = false;
    }
  }

  let enabledCount = $derived(companies.filter(c => c.enabled).length);
  let attentionCount = $derived(companies.filter(
    (company) => company.last_poll_status === "error" || Boolean(company.quarantined_at)
  ).length);
</script>

<div class="page pushed-screen" class:native-layout={nativeIos}>
  {#if !embedded}
    <ScreenNav
      title={isAdminMode ? "Sources" : "Companies"}
      collapsible
      searchable
      chromeOwnerId={isAdminMode ? "sources" : "companies"}
      onBack={() => { if (!requestBack()) navigate("/you"); }}
    />
  {/if}
  <div class="page-frame companies-page">
    {#if nativeIos && !embedded}<h1 class="screen-large-title" data-screen-title-anchor>{isAdminMode ? "Sources" : "Companies"}</h1>{/if}
    {#if isAdminMode}
      <div class="source-summary" aria-label="Source status">
        <span><strong>{enabledCount}</strong> active</span>
        {#if attentionCount > 0}
          <span class="attention"><strong>{attentionCount}</strong> need attention</span>
        {/if}
        <span>{companies.length} total</span>
      </div>

      <div class="source-tools page-block">
        <div class="source-search-row">
          <input
            class="input-field"
            type="search"
            enterkeyhint="search"
            aria-label="Search sources"
            placeholder="Search sources"
            bind:value={search}
            onkeydown={commitSearch}
          />
          <button
            class="btn-primary btn-accent source-add"
            type="button"
            aria-label="Add source"
            aria-expanded={showAddForm}
            onclick={() => { showAddForm = !showAddForm; }}
          >
            <Plus size={15} weight="bold" />
            <span>Add source</span>
          </button>
        </div>

        <div class="source-filter-row">
          <label for="source-type-filter">
            <span>Source</span>
            <div class="select-field-wrap">
              <select id="source-type-filter" class="input-field" bind:value={selectedAts}>
                {#each ATS_TYPES as atsType}
                  <option value={atsType}>{companySourceLabel(atsType)}</option>
                {/each}
              </select>
              <span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span>
            </div>
          </label>
          <label for="source-status-filter">
            <span>Status</span>
            <div class="select-field-wrap">
              <select id="source-status-filter" class="input-field" bind:value={adminStatus}>
                {#each ADMIN_STATUSES as status}
                  <option value={status.value}>{status.label}</option>
                {/each}
              </select>
              <span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span>
            </div>
          </label>
          <span class="source-result-count">{filteredCompanies.length} shown</span>
        </div>
      </div>
    {:else}
      <div class="stack-md page-block">
        <input
          class="input-field"
          type="search"
          enterkeyhint="search"
          aria-label="Search companies"
          placeholder="Search companies"
          bind:value={search}
          onkeydown={commitSearch}
        />
        <div class="flex-fill">
          <FilterChips
            filters={USER_VIEWS}
            selected={selectedView}
            onSelect={(filter) => (selectedView = filter)}
          />
        </div>
      </div>
    {/if}

    {#if isAdminMode && showAddForm}
      <div class="content-card stack-md page-block muted-card">
        <div class="row-title">Add a company</div>
        <div class="form-stack">
          <div>
            <label for="add-name" class="field-label">Company name</label>
            <input id="add-name" class="input-field" type="text" placeholder="e.g. Stripe" bind:value={addName} />
          </div>
          <div class="form-grid-2">
            <div class="flex-fill">
              <label for="add-ats" class="field-label">ATS type</label>
              {#if nativeIos}
                <div class="select-field-wrap">
                  <select id="add-ats" class="input-field" bind:value={addAtsType}>
                    {#each MANAGED_ATS_TYPES as atsType}
                      <option value={atsType}>{companySourceLabel(atsType)}</option>
                    {/each}
                  </select>
                  <span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span>
                </div>
              {:else}
                <select id="add-ats" class="input-field" bind:value={addAtsType}>
                  {#each MANAGED_ATS_TYPES as atsType}
                    <option value={atsType}>{companySourceLabel(atsType)}</option>
                  {/each}
                </select>
              {/if}
            </div>
            <div class="flex-fill">
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
          {#if addVerification.error}
            <div class="alert alert-error alert-compact" role="alert">
              {addVerification.error}
            </div>
          {/if}
          {#if addVerification.message}
            <div class="alert alert-success alert-compact" role="status">
              {addVerification.message}
            </div>
          {/if}
          <div class="action-row compact card-actions">
            <button
              class="btn-secondary"
              disabled={!addSlug.trim() || addVerification.busy}
              onclick={() => verifySource(addAtsType, addSlug, addVerification)}
            >
              {#if addVerification.busy}<Spinner />{/if}
              Verify
            </button>
            <button
              class="btn-primary btn-accent flex-fill"
              disabled={!addName.trim() || !addSlug.trim() || adding}
              onclick={handleAdd}
            >
              {#if adding}<Spinner />{/if}
              Add company
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
        {#each Array(5) as _}
          <div class="grouped-row company-skeleton-row">
            <div class="skeleton company-skeleton-logo"></div>
            <div class="flex-fill">
              <div class="skeleton company-skeleton-title"></div>
              <div class="skeleton company-skeleton-meta"></div>
            </div>
            <div class="skeleton company-skeleton-switch"></div>
          </div>
        {/each}
      </div>
    {:else if loadError}
      {#if nativeIos}
        <PageFailure
          title={isAdminMode ? "Sources didn’t load" : "Companies didn’t load"}
          message="Check your connection and try again."
          onRetry={loadCompanies}
        />
      {:else}
        <div class="stack-sm align-start">
          <div class="alert alert-error full-width" role="alert">{loadError}</div>
          <button class="btn-secondary" onclick={loadCompanies}>Try again</button>
        </div>
      {/if}
    {:else if filteredCompanies.length === 0 && !showRequestCandidate}
      {#if nativeIos}
        <EmptyState
          title="No companies found"
          message={isAdminMode
            ? "Adjust your filters or add a company."
            : selectedView === "Hidden"
              ? "You haven’t hidden any companies."
              : "Try a different company name."}
        />
      {:else}
        <div class="empty-state">
          <div class="h-display h-display-sm empty-state-title">No companies found</div>
          <div class="empty-state-copy">
            {isAdminMode ? "Adjust your filters or add a company." : selectedView === "Hidden" ? "You haven’t hidden any companies." : "Try a different company name."}
          </div>
        </div>
      {/if}
    {:else}
      <div class="surface-list company-list">
        {#each visibleCompanies as company (company.id)}
          <CompanyRow
            {company}
            admin={isAdminMode}
            {nativeIos}
            busy={pendingVisibilityIds.has(company.id)}
            onToggle={handleToggle}
            onDelete={promptDelete}
            onEdit={openEdit}
            onBlock={handleBlock}
            onRestore={handleRestore}
            onReport={(id, name) => { reportTarget = { id, name }; }}
          />
        {/each}
        {#if showRequestCandidate}
          <button type="button" class="company-request-row" onclick={openCompanyRequest}>
            <span class="grouped-row-copy">
              <span class="row-title">Request “{requestCandidate}”</span>
              <span class="helper-text">Not seeing the company you want?</span>
            </span>
            <Plus size={17} weight="bold" aria-hidden="true" />
          </button>
        {/if}
      </div>
      {#if remainingCompanyCount > 0}
        <div class="company-list-footer">
          {#if !nativeIos}<span>{visibleCompanies.length} of {filteredCompanies.length}</span>{/if}
          <button
            type="button"
            class="btn-secondary"
            onclick={() => { visibleCount += COMPANY_PAGE_SIZE; }}
          >
            Show {Math.min(COMPANY_PAGE_SIZE, remainingCompanyCount)} more
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if isAdminMode && editTarget}
  <Modal
    title="Edit company"
    busy={saving}
    maxWidth={340}
    initialFocus={nativeIos ? "dialog" : "first"}
    onclose={() => (editTarget = null)}
  >
    <div class="form-stack">
      <div>
        <label for="edit-name" class="field-label">Name</label>
        <input id="edit-name" class="input-field" type="text" bind:value={editTarget.name} />
      </div>
      <div class="form-grid-2">
        <div class="flex-fill">
          <label for="edit-ats" class="field-label">ATS type</label>
          {#if nativeIos}
            <div class="select-field-wrap">
              <select id="edit-ats" class="input-field" bind:value={editTarget.ats_type}>
                {#each MANAGED_ATS_TYPES as atsType}
                  <option value={atsType}>{companySourceLabel(atsType)}</option>
                {/each}
              </select>
              <span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span>
            </div>
          {:else}
            <select id="edit-ats" class="input-field" bind:value={editTarget.ats_type}>
              {#each MANAGED_ATS_TYPES as atsType}
                <option value={atsType}>{companySourceLabel(atsType)}</option>
              {/each}
            </select>
          {/if}
        </div>
        <div class="flex-fill">
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
      {#if editVerification.error}
        <div class="alert alert-error alert-compact" role="alert">
          {editVerification.error}
        </div>
      {/if}
      {#if editVerification.message}
        <div class="alert alert-success alert-compact" role="status">
          {editVerification.message}
        </div>
      {/if}
      <div class="action-row compact card-actions">
        <button
          class="btn-secondary"
          onclick={() => { editTarget = null; }}
        >
          Cancel
        </button>
        <button
          class="btn-secondary"
          disabled={!editTarget.ats_slug.trim() || editVerification.busy}
          onclick={verifyEditedSource}
        >
          {#if editVerification.busy}<Spinner />{/if}
          Verify
        </button>
        <button
          class="btn-primary btn-accent flex-fill"
          disabled={!editTarget.name.trim() || !editTarget.ats_slug.trim() || saving}
          onclick={handleSaveEdit}
        >
          {#if saving}<Spinner />{/if}
          Save
        </button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  .native-layout .companies-page {
    padding-bottom: calc(var(--space-10) + var(--safe-bottom));
  }

  .source-summary {
    margin-bottom: 14px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
  }

  .source-summary strong {
    color: var(--color-ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .source-summary .attention,
  .source-summary .attention strong { color: var(--color-bad); }

  .source-tools {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .source-search-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .source-search-row .input-field,
  .source-add { height: 44px; }

  .source-add {
    padding: 0 14px;
    font-size: var(--fs-sm);
  }

  .source-filter-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
    gap: 8px;
  }

  .source-filter-row label {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .source-filter-row .input-field {
    height: 40px;
    font-size: var(--fs-sm);
  }

  .native-layout .source-filter-row .input-field { height: var(--tap-min); }

  .source-result-count {
    grid-column: 1 / -1;
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
  }

  .company-list-footer {
    padding: var(--space-4) 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
  }

  .native-layout .company-list-footer {
    justify-content: center;
  }

  .native-layout .company-list-footer :global(.btn-secondary) {
    min-width: min(220px, 100%);
  }

  .company-list { overflow: visible; }

  .native-layout .company-list {
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .native-layout .company-list :global(.company-row),
  .native-layout .company-request-row {
    padding-inline: 0;
  }

  @media (max-width: 390px) {
    .source-add { width: 44px; padding: 0; overflow: hidden; }
    .source-add span { display: none; }
    .source-add :global(svg) { width: 17px; height: 17px; }
  }

  @media (min-width: 640px) {
    .source-tools {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) auto;
      align-items: end;
    }

    .source-filter-row {
      grid-template-columns: 170px 170px;
    }

    .source-result-count { display: none; }
  }
</style>

{#if isAdminMode && deleteTarget}
  <Modal
    title="Remove {deleteTarget.name}?"
    busy={deleting}
    maxWidth={340}
    onclose={() => (deleteTarget = null)}
  >
    <p class="modal-copy">
      This will permanently delete <strong>{deleteTarget.name}</strong> and all its job listings from the database. This affects all users.
      <br /><br />
      If you only want to pause this source, disable it for everyone instead.
    </p>
    <div class="stack-sm">
      <button
        class="btn-secondary full-width"
        onclick={handleHide}
      >
        Disable for everyone
      </button>
      <button
        class="btn-secondary btn-danger full-width"
        disabled={deleting}
        onclick={handleDelete}
      >
        {#if deleting}<Spinner />{/if}
        Delete permanently
      </button>
      <button
        class="text-button"
        onclick={() => { deleteTarget = null; }}
      >
        Cancel
      </button>
    </div>
  </Modal>
{/if}

{#if !isAdminMode && showCompanyRequest}
  <Modal
    title="Request a company"
    subtitle="Tell us which company should join the catalog. A careers link helps us find the right source faster."
    busy={requestingCompany}
    onclose={() => (showCompanyRequest = false)}
  >
    <div class="form-stack loose">
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
        <label for="request-careers-url" class="field-label">Careers URL <span class="label-opt">optional</span></label>
        <input
          id="request-careers-url"
          class="input-field"
          type="url"
          placeholder="https://company.com/careers"
          bind:value={requestCareersUrl}
        />
      </div>
      <div>
        <label for="request-company-notes" class="field-label">Notes <span class="label-opt">optional</span></label>
        <textarea
          id="request-company-notes"
          class="input-field textarea-field"
          rows="4"
          maxlength="2000"
          placeholder="Anything useful about the company or its job board"
          bind:value={requestCompanyNotes}
        ></textarea>
      </div>
      {#if requestCompanyError}
        <div class="alert alert-error alert-compact" role="alert">
          {requestCompanyError}
        </div>
      {/if}
    </div>
    <div class="action-row modal-actions">
      <button class="btn-secondary" onclick={() => { showCompanyRequest = false; }} disabled={requestingCompany}>Cancel</button>
      <button
        class="btn-primary btn-accent flex-fill"
        onclick={submitCompanyRequest}
        disabled={requestingCompany || requestCompanyName.trim().length < 2}
      >
        {#if requestingCompany}<Spinner />{/if}
        Send request
      </button>
    </div>
  </Modal>
{/if}

{#if !isAdminMode && reportTarget}
  <Modal
    title="Report {reportTarget.name}"
    subtitle="Let us know if its careers source is stale, broken, or missing jobs."
    busy={reporting}
    onclose={() => (reportTarget = null)}
  >
    {#if nativeIos}<label for="company-report-notes" class="field-label">What did you notice?</label>{/if}
    <textarea
      id="company-report-notes"
      aria-label={nativeIos ? undefined : "What did you notice?"}
      class="input-field textarea-field textarea-spaced"
      rows="4"
      placeholder="What did you notice?"
      bind:value={reportNotes}
    ></textarea>
    <div class="action-row">
      <button class="btn-secondary" onclick={() => { reportTarget = null; }} disabled={reporting}>Cancel</button>
      <button class="btn-primary btn-accent flex-fill" onclick={submitCompanyReport} disabled={reporting}>
        {#if reporting}<Spinner />{/if}
        Send report
      </button>
    </div>
  </Modal>
{/if}
