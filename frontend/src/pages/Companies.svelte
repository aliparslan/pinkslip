<script lang="ts">
  import { api } from "../lib/api";
  import CompanyRow from "../components/CompanyRow.svelte";
  import FilterChips from "../components/FilterChips.svelte";

  const ATS_TYPES = ["All", "greenhouse", "lever", "ashby", "custom"];

  let companies: any[] = $state([]);
  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let selectedAts: string = $state("All");

  let filteredCompanies = $derived(
    selectedAts === "All"
      ? companies
      : companies.filter((c) => c.ats_type === selectedAts)
  );

  $effect(() => {
    loading = true;
    error = null;
    api.companies
      .list()
      .then((res) => {
        companies = res.companies ?? [];
      })
      .catch((e) => {
        error = e.message;
      })
      .finally(() => {
        loading = false;
      });
  });

  async function handleToggle(id: string, enabled: boolean) {
    // Optimistic update
    companies = companies.map((c) => (c.id === id ? { ...c, enabled } : c));
    try {
      await api.companies.toggle(id, enabled);
    } catch (e: any) {
      // Revert on failure
      companies = companies.map((c) => (c.id === id ? { ...c, enabled: !enabled } : c));
      error = e.message;
    }
  }
</script>

<div class="flex flex-col min-h-screen">
  <!-- Header -->
  <header class="sticky top-0 z-10 bg-base-100 border-b border-base-300 px-4 py-3">
    <div class="flex items-center gap-3">
      <h1 class="text-xl font-bold">Companies</h1>
      <span class="badge badge-neutral">{companies.length}</span>
    </div>
    <div class="mt-2">
      <FilterChips
        filters={ATS_TYPES}
        selected={selectedAts}
        onSelect={(f) => (selectedAts = f)}
      />
    </div>
  </header>

  <main class="flex-1 px-4 py-4">
    {#if loading}
      <div class="flex justify-center items-center py-20">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    {:else if error}
      <div class="alert alert-error">
        <span>{error}</span>
      </div>
    {:else if filteredCompanies.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-base-content/50">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <p class="text-sm">No companies found</p>
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each filteredCompanies as company (company.id)}
          <CompanyRow {company} onToggle={handleToggle} />
        {/each}
      </div>
    {/if}
  </main>
</div>
