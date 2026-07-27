<script lang="ts">
  // Search-profile summary + inline editor (Jobs tab).
  import SearchProfileFields from "../../components/SearchProfileFields.svelte";
  import {
    DEFAULT_SEARCH_PROFILE,
    normalizeSearchProfile,
    type SearchProfileV1,
  } from "../../../../shared/search-profile";

  let {
    searchProfile = $bindable(),
    showHeading = true,
  }: {
    searchProfile: SearchProfileV1;
    showHeading?: boolean;
  } = $props();

  function resetToDefaults() {
    searchProfile = normalizeSearchProfile(DEFAULT_SEARCH_PROFILE);
  }
</script>

<section>
  {#if showHeading}<h2 class="section-eyebrow">Search profile</h2>{/if}
  <div class="surface-card" style="padding: 18px; display: flex; flex-direction: column; gap: 24px;">
    <SearchProfileFields bind:profile={searchProfile} />
    <div>
      <button class="btn-secondary" onclick={resetToDefaults}>
        Reset defaults
      </button>
    </div>
  </div>
</section>
