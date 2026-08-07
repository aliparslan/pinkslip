<script lang="ts">
  import SearchProfileFields from "../../components/SearchProfileFields.svelte";
  import {
    DEFAULT_SEARCH_PROFILE,
    ROLE_OPTIONS,
    normalizeSearchProfile,
    type SearchProfileV1,
  } from "../../../../../shared/search-profile";

  let {
    searchProfile = $bindable(),
    showHeading = true,
    nativeIos = false,
  }: {
    searchProfile: SearchProfileV1;
    showHeading?: boolean;
    nativeIos?: boolean;
  } = $props();

  function resetToDefaults() {
    const defaults = normalizeSearchProfile(DEFAULT_SEARCH_PROFILE);
    searchProfile = nativeIos
      ? { ...defaults, roles: ROLE_OPTIONS.map((role) => role.id), primary_role: ROLE_OPTIONS[0].id }
      : defaults;
  }
</script>

<section class="jobs-section">
  {#if showHeading}<h2 class="section-eyebrow">Search profile</h2>{/if}
  <div class="content-card stack-lg jobs-settings-content">
    <SearchProfileFields bind:profile={searchProfile} />
    <div>
      <button class="btn-secondary" class:full-width={nativeIos} onclick={resetToDefaults}>
        Reset defaults
      </button>
    </div>
  </div>
</section>
