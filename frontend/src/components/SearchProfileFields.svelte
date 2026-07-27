<script lang="ts">
  import {
    LOCATION_OPTIONS,
    ROLE_OPTIONS,
    type LocationId,
    type RoleId,
    type SearchProfile,
    type WorkAuthorization,
    type WorkMode,
  } from "../../../shared/search-profile";

  let {
    profile = $bindable(),
    section = "all",
    showAdvanced = true,
    showHeadings = true,
  }: {
    profile: SearchProfile;
    section?: "all" | "roles" | "experience" | "locations";
    showAdvanced?: boolean;
    showHeadings?: boolean;
  } = $props();

  let customTitlesText = $derived(profile.custom_titles.join(", "));
  let excludedTitlesText = $derived(profile.excluded_titles.join(", "));
  let customLocationsText = $derived(profile.custom_locations.join(", "));

  const workModes: Array<{ id: WorkMode; label: string }> = [
    { id: "remote", label: "Remote" },
    { id: "hybrid", label: "Hybrid" },
    { id: "onsite", label: "On-site" },
  ];
  const authorizationOptions: Array<{ id: WorkAuthorization; label: string; detail: string }> = [
    { id: "authorized", label: "Authorized", detail: "No sponsorship needed" },
    { id: "sponsorship", label: "Need sponsorship", detail: "Prioritize open employers" },
    { id: "not_sure", label: "Not sure", detail: "Keep options broad" },
  ];

  function parseList(value: string): string[] {
    return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  }

  function toggleRole(role: RoleId) {
    const selected = profile.roles.includes(role);
    if (selected && profile.roles.length === 1) return;
    const roles = selected
      ? profile.roles.filter((item) => item !== role)
      : [...profile.roles, role];
    profile = {
      ...profile,
      roles,
      primary_role: roles[0],
    };
  }

  function toggleWorkMode(mode: WorkMode) {
    const selected = profile.work_modes.includes(mode);
    if (selected && profile.work_modes.length === 1) return;
    profile = {
      ...profile,
      work_modes: selected
        ? profile.work_modes.filter((item) => item !== mode)
        : [...profile.work_modes, mode],
    };
  }

  function toggleLocation(location: LocationId) {
    profile = {
      ...profile,
      location_ids: profile.location_ids.includes(location)
        ? profile.location_ids.filter((item) => item !== location)
        : [...profile.location_ids, location],
    };
  }
</script>

{#if section === "all" || section === "roles"}
  <section class="profile-field-section">
    {#if showHeadings}
      <div class="profile-field-heading">
        <div>
          <div class="profile-field-title">Target roles</div>
          <div class="profile-field-help">Choose the work you would genuinely apply for.</div>
        </div>
        <span class="selection-count">{profile.roles.length} selected</span>
      </div>
    {/if}
    <div class="choice-grid role-grid">
      {#each ROLE_OPTIONS as role}
        <button
          type="button"
          class="choice-card role-card"
          class:active={profile.roles.includes(role.id)}
          aria-pressed={profile.roles.includes(role.id)}
          onclick={() => toggleRole(role.id)}
        >
          <span>{role.label}</span>
          <span class="choice-check">{profile.roles.includes(role.id) ? "✓" : ""}</span>
        </button>
      {/each}
    </div>

    {#if showAdvanced}
      <details class="advanced-fields">
        <summary>Advanced title matching</summary>
        <div class="advanced-body">
          <label>
            <span>Additional titles</span>
            <input
              class="input-field"
              value={customTitlesText}
              placeholder="Solutions Engineer, Developer Advocate"
              onchange={(event) => profile = { ...profile, custom_titles: parseList(event.currentTarget.value) }}
            />
            <small>Use this for titles that do not fit a role family.</small>
          </label>
          <label>
            <span>Always exclude</span>
            <input
              class="input-field"
              value={excludedTitlesText}
              placeholder="Sales, Recruiter"
              onchange={(event) => profile = { ...profile, excluded_titles: parseList(event.currentTarget.value) }}
            />
            <small>Experience and seniority are already handled separately.</small>
          </label>
        </div>
      </details>
    {/if}
  </section>
{/if}

{#if section === "all" || section === "experience"}
  <section class="profile-field-section">
    <div class="profile-field-heading">
      <div>
        <div class="profile-field-title">Experience level</div>
        <div class="profile-field-help">
          pinkslip only tracks new-grad and early-career roles &mdash; anything asking
          for more than 3 years, plus senior, staff and management titles, is filtered
          out. Postings that don't state a requirement are kept.
        </div>
      </div>
    </div>
  </section>
{/if}

{#if section === "all" || section === "locations"}
  <section class="profile-field-section">
    {#if showHeadings}
      <div class="profile-field-heading">
        <div>
          <div class="profile-field-title">Location and work eligibility</div>
          <div class="profile-field-help">This prevents attractive but unusable matches.</div>
        </div>
      </div>
    {/if}

    <div class="subfield">
      <div class="subfield-label">US work authorization</div>
      <div class="authorization-grid">
        {#each authorizationOptions as option}
          <button
            type="button"
            class="choice-card work-mode"
            class:active={profile.work_authorization === option.id}
            aria-pressed={profile.work_authorization === option.id}
            onclick={() => profile = { ...profile, work_authorization: option.id }}
          >
            <strong>{option.label}</strong>
            <small>{option.detail}</small>
          </button>
        {/each}
      </div>
    </div>

    <div class="subfield">
      <div class="subfield-label">Work mode</div>
      <div class="work-mode-grid">
        {#each workModes as mode}
          <button
            type="button"
            class="choice-card work-mode"
            class:active={profile.work_modes.includes(mode.id)}
            aria-pressed={profile.work_modes.includes(mode.id)}
            onclick={() => toggleWorkMode(mode.id)}
          >
            <strong>{mode.label}</strong>
          </button>
        {/each}
      </div>
    </div>

    <div class="subfield">
      <div class="subfield-label">Preferred metros</div>
      <div class="location-grid">
        {#each LOCATION_OPTIONS as location}
          <button
            type="button"
            class="location-chip"
            class:active={profile.location_ids.includes(location.id)}
            aria-pressed={profile.location_ids.includes(location.id)}
            onclick={() => toggleLocation(location.id)}
          >
            {location.label}
          </button>
        {/each}
      </div>
      <small class="empty-help">Leave metros empty to include any US location that fits your work mode.</small>
    </div>

    <button
      type="button"
      class="relocation-row"
      class:active={profile.relocation_willing}
      aria-pressed={profile.relocation_willing}
      onclick={() => profile = { ...profile, relocation_willing: !profile.relocation_willing }}
    >
      <strong>Open to relocation</strong>
      <span class="choice-check">{profile.relocation_willing ? "✓" : ""}</span>
    </button>

    {#if showAdvanced}
      <details class="advanced-fields">
        <summary>Add another location</summary>
        <div class="advanced-body">
          <label>
            <span>Additional cities or regions</span>
            <input
              class="input-field"
              value={customLocationsText}
              placeholder="Portland, Raleigh, Minneapolis"
              onchange={(event) => profile = { ...profile, custom_locations: parseList(event.currentTarget.value) }}
            />
          </label>
        </div>
      </details>
    {/if}
  </section>
{/if}

<style>
  .profile-field-section { display: flex; flex-direction: column; gap: 14px; }
  .profile-field-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .profile-field-title { font-size: var(--fs-base); font-weight: 600; color: var(--color-ink); }
  .profile-field-help { margin-top: 3px; color: var(--color-ink-3); font-size: var(--fs-xs); line-height: 1.4; }
  .selection-count { flex-shrink: 0; color: var(--color-accent); font-family: var(--font-mono); font-size: var(--fs-2xs); text-transform: uppercase; letter-spacing: 0.04em; }
  .choice-grid { display: grid; gap: 8px; }
  .role-grid { display: flex; flex-wrap: wrap; gap: 7px; }
  .choice-card, .location-chip, .relocation-row {
    border: 1px solid var(--color-line-2);
    background: var(--color-bg-sunken);
    color: var(--color-ink-2);
    font-family: inherit;
    cursor: pointer;
    transition: border-color 140ms ease, background 140ms ease, color 140ms ease, transform 140ms ease;
  }
  .choice-card { min-height: 48px; padding: 10px 12px; border-radius: var(--radius-md); text-align: left; font-size: var(--fs-sm); font-weight: 600; }
  .role-card { min-height: 40px; padding: 0 12px; display: flex; align-items: center; gap: 6px; border-radius: var(--radius-full); }
  .role-card .choice-check { width: auto; }
  .choice-card:active, .location-chip:active { transform: scale(0.98); }
  .choice-card.active, .location-chip.active, .relocation-row.active {
    border-color: color-mix(in oklch, var(--color-accent) 65%, var(--color-line));
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-ink);
  }
  .subfield { display: flex; flex-direction: column; gap: 8px; }
  .subfield-label { color: var(--color-ink-2); font-size: var(--fs-xs); font-weight: 600; }
  .choice-check { width: 18px; color: var(--color-accent); font-weight: 800; text-align: center; }
  .authorization-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .work-mode-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .location-grid { display: flex; flex-wrap: wrap; gap: 7px; }
  .location-chip { min-height: 40px; padding: 6px 11px; border-radius: var(--radius-full); font-size: var(--fs-xs); font-weight: 500; }
  .relocation-row { width: 100%; min-height: 44px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; border-radius: var(--radius-full); color: var(--color-ink-2); font-size: var(--fs-sm); text-align: left; }
  .advanced-fields { border-top: 0.5px solid var(--color-line); padding-top: 12px; }
  .advanced-fields summary { cursor: pointer; color: var(--color-ink-3); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 600; }
  .advanced-body { display: flex; flex-direction: column; gap: 13px; padding-top: 13px; }
  .advanced-body label { display: flex; flex-direction: column; gap: 6px; color: var(--color-ink-2); font-size: var(--fs-xs); font-weight: 600; }
  .advanced-body small { color: var(--color-ink-4); font-size: var(--fs-2xs); font-weight: 400; line-height: 1.4; }
  @media (max-width: 430px) {
    .authorization-grid { grid-template-columns: 1fr; }
  }
</style>
