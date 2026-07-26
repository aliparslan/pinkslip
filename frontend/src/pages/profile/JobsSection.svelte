<script lang="ts">
  // Search-profile summary + inline editor (Jobs tab).
  import SearchProfileFields from "../../components/SearchProfileFields.svelte";
  import {
    DEFAULT_SEARCH_PROFILE,
    LOCATION_OPTIONS,
    MAX_YEARS_EXPERIENCE,
    ROLE_OPTIONS,
    normalizeSearchProfile,
    type SearchProfileV1,
  } from "../../../../shared/search-profile";

  let { searchProfile = $bindable() }: { searchProfile: SearchProfileV1 } = $props();

  let profileEditing: boolean = $state(false);

  let primaryRoleLabel = $derived(
    ROLE_OPTIONS.find((role) => role.id === searchProfile.primary_role)?.label ?? "Not set"
  );
  let specialtyLabels = $derived(
    ROLE_OPTIONS
      .filter((role) => role.id !== searchProfile.primary_role && searchProfile.roles.includes(role.id))
      .map((role) => role.shortLabel)
      .join(", ") || "No secondary roles"
  );
  let metroLabels = $derived(
    LOCATION_OPTIONS
      .filter((location) => searchProfile.location_ids.includes(location.id))
      .map((location) => location.label)
      .join(", ") || "Any US metro"
  );

  function resetToDefaults() {
    searchProfile = normalizeSearchProfile(DEFAULT_SEARCH_PROFILE);
  }
</script>

<section>
  <h2 class="section-eyebrow">Search profile</h2>
  <div class="surface-card" style="padding: 18px; display: flex; flex-direction: column; gap: 24px;">
    {#if profileEditing}
      <SearchProfileFields bind:profile={searchProfile} />
      <div style="display: flex; justify-content: space-between; gap: 8px;">
        <button class="btn-secondary" style="height: 40px; padding: 0 14px;" onclick={resetToDefaults}>
          Reset defaults
        </button>
        <button class="btn-secondary" style="height: 40px; padding: 0 14px;" onclick={() => { profileEditing = false; }}>
          Close editor
        </button>
      </div>
    {:else}
      <div class="profile-summary-grid">
        <div class="profile-summary-item">
          <span>Primary role</span>
          <strong>{primaryRoleLabel}</strong>
        </div>
        <div class="profile-summary-item">
          <span>Also targeting</span>
          <strong>{specialtyLabels}</strong>
        </div>
        <div class="profile-summary-item">
          <span>Experience band</span>
          <strong>New grad to early career · up to {MAX_YEARS_EXPERIENCE} years required</strong>
        </div>
        <div class="profile-summary-item">
          <span>Work modes</span>
          <strong>{searchProfile.work_modes.join(", ")}</strong>
        </div>
        <div class="profile-summary-item">
          <span>Preferred metros</span>
          <strong>{metroLabels}</strong>
        </div>
        <div class="profile-summary-item">
          <span>Authorization</span>
          <strong>{searchProfile.work_authorization.replaceAll("_", " ")} · {searchProfile.relocation_willing ? "open to relocation" : "no relocation"}</strong>
        </div>
        <div class="profile-summary-item">
          <span>Min match score</span>
          <strong>{searchProfile.match_threshold}+</strong>
        </div>
      </div>
      <button class="btn-secondary" onclick={() => { profileEditing = true; }}>
        Edit search profile
      </button>
    {/if}
  </div>
</section>
