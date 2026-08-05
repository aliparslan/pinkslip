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
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Check from "phosphor-svelte/lib/Check";
  import Switch from "./Switch.svelte";

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

  const workModeOptions: Array<{ id: WorkMode; label: string }> = [
    { id: "remote", label: "Remote" },
    { id: "hybrid", label: "Hybrid" },
    { id: "onsite", label: "On-site" },
  ];
  const authorizationOptions: Array<{ id: WorkAuthorization; label: string }> = [
    { id: "authorized", label: "Authorized to work in the US" },
    { id: "sponsorship", label: "I need sponsorship" },
    { id: "not_sure", label: "I’m not sure" },
  ];
  let workModePicker: HTMLDetailsElement | null = $state(null);
  let workModeSummary = $derived(
    profile.work_modes.length === workModeOptions.length
      ? "Any work mode"
      : workModeOptions
          .filter((option) => profile.work_modes.includes(option.id))
          .map((option) => option.label)
          .join(", "),
  );

  $effect(() => {
    function closeWorkModePicker(event: PointerEvent) {
      if (
        workModePicker?.open
        && event.target instanceof Node
        && !workModePicker.contains(event.target)
      ) {
        workModePicker.open = false;
      }
    }

    function closeWorkModePickerWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !workModePicker?.open) return;
      workModePicker.open = false;
      workModePicker.querySelector<HTMLElement>("summary")?.focus();
    }

    document.addEventListener("pointerdown", closeWorkModePicker);
    document.addEventListener("keydown", closeWorkModePickerWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWorkModePicker);
      document.removeEventListener("keydown", closeWorkModePickerWithEscape);
    };
  });

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
        : workModeOptions
            .map((option) => option.id)
            .filter((item) => item === mode || profile.work_modes.includes(item)),
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
          Your job list is limited to new-grad and early-career roles. Jobs asking for
          more than 3 years&mdash;or using senior, staff, or management titles&mdash;are
          filtered out. Jobs without a stated requirement stay in.
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
          <div class="profile-field-help">Only show roles you can actually take.</div>
        </div>
      </div>
    {/if}

    <div class="subfield">
      <div class="subfield-label">US work authorization</div>
      <div class="select-field-wrap">
        <select
          class="input-field tall-control"
          value={profile.work_authorization}
          onchange={(event) => profile = {
            ...profile,
            work_authorization: event.currentTarget.value as WorkAuthorization,
          }}
        >
          {#each authorizationOptions as option}
            <option value={option.id}>{option.label}</option>
          {/each}
        </select>
        <span class="select-chevron"><CaretDown size={15} weight="bold" /></span>
      </div>
    </div>

    <div class="subfield">
      <div class="subfield-label">Work mode</div>
      <details
        bind:this={workModePicker}
        class="work-mode-picker"
      >
        <summary class="work-mode-trigger">
          <span>{workModeSummary || "Choose work modes"}</span>
          <span class="work-mode-chevron" aria-hidden="true">
            <CaretDown size={15} weight="bold" />
          </span>
        </summary>
        <div class="work-mode-menu" aria-label="Work modes">
          {#each workModeOptions as option}
            <button
              type="button"
              class="work-mode-option"
              class:active={profile.work_modes.includes(option.id)}
              aria-pressed={profile.work_modes.includes(option.id)}
              onclick={() => toggleWorkMode(option.id)}
            >
              <span>{option.label}</span>
              <span class="select-check" aria-hidden="true">
                {#if profile.work_modes.includes(option.id)}
                  <Check size={14} weight="bold" />
                {/if}
              </span>
            </button>
          {/each}
        </div>
      </details>
    </div>

    <div class="anywhere-row">
      <div>
        <div class="anywhere-title">Open to anywhere</div>
        <div class="anywhere-help">Include roles outside your preferred metros.</div>
      </div>
      <Switch
        checked={profile.relocation_willing}
        onCheckedChange={(value) => profile = { ...profile, relocation_willing: value }}
        aria-label="Open to anywhere"
      />
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
    </div>

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
  .profile-field-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
  .profile-field-title { font-size: var(--fs-base); font-weight: 500; color: var(--color-ink); }
  .profile-field-help { margin-top: 3px; color: var(--color-ink-3); font-size: var(--fs-xs); line-height: 1.4; }
  .selection-count { flex-shrink: 0; color: var(--color-ink-3); font-family: var(--font-sans); font-size: var(--fs-xs); font-weight: 500; }
  .choice-grid { display: grid; gap: var(--space-2); }
  .role-grid { display: flex; flex-wrap: wrap; gap: 7px; }
  .choice-card, .location-chip {
    border: 1px solid var(--color-line-2);
    background: var(--color-bg-elev);
    color: var(--color-ink-2);
    font-family: inherit;
    cursor: pointer;
    transition: border-color 140ms ease, background 140ms ease, color 140ms ease, transform 140ms ease;
  }
  .choice-card { min-height: 48px; padding: 10px var(--space-3); border-radius: var(--radius-md); text-align: left; font-size: var(--fs-sm); font-weight: 500; }
  .role-card { min-height: 40px; padding: 0 13px; display: flex; align-items: center; border-radius: var(--radius-full); }
  .choice-card:active, .location-chip:active { transform: scale(0.97); }
  .choice-card.active, .location-chip.active {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-ink);
    font-weight: 600;
  }
  .subfield { display: flex; flex-direction: column; gap: var(--space-2); }
  .subfield-label { color: var(--color-ink-2); font-size: var(--fs-xs); font-weight: 500; }
  .work-mode-picker { position: relative; }
  .work-mode-trigger {
    width: 100%;
    min-height: 48px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    border: 1px solid var(--color-line-2);
    border-radius: var(--radius-md);
    background: var(--color-bg-elev);
    color: var(--color-ink);
    font-size: var(--fs-md);
    cursor: pointer;
    list-style: none;
  }
  .work-mode-trigger::-webkit-details-marker { display: none; }
  .work-mode-chevron {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    color: var(--color-ink-3);
    transition: transform 140ms ease;
  }
  .work-mode-picker[open] .work-mode-chevron { transform: rotate(180deg); }
  .work-mode-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 8;
    padding: 5px;
    border: 1px solid var(--color-line-2);
    border-radius: var(--radius-md);
    background: var(--color-bg-elev);
    box-shadow: var(--shadow-toast);
  }
  .work-mode-option {
    width: 100%;
    min-height: 42px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-ink-2);
    font-size: var(--fs-md);
    text-align: left;
    cursor: pointer;
  }
  .work-mode-option:hover { background: var(--color-bg-sunken); }
  .work-mode-option.active { color: var(--color-ink); }
  /* .select-check lives in app.css — shared with the location filter dropdown. */
  .location-grid { display: flex; flex-wrap: wrap; gap: 7px; }
  .location-chip { min-height: 40px; padding: 6px 11px; border-radius: var(--radius-full); font-size: var(--fs-xs); font-weight: 500; }
  .anywhere-row { min-height: 52px; padding: 0 2px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .anywhere-title { color: var(--color-ink); font-size: var(--fs-sm); font-weight: 500; }
  .anywhere-help { margin-top: 2px; color: var(--color-ink-3); font-size: var(--fs-xs); line-height: 1.35; }
  .advanced-fields { border-top: 0.5px solid var(--color-line); padding-top: var(--space-3); }
  .advanced-fields summary { cursor: pointer; color: var(--color-ink-3); font-family: var(--font-sans); font-size: var(--fs-xs); font-weight: 500; }
  .advanced-body { display: flex; flex-direction: column; gap: 13px; padding-top: 13px; }
  .advanced-body label { display: flex; flex-direction: column; gap: 6px; color: var(--color-ink-2); font-size: var(--fs-xs); font-weight: 500; }
  .advanced-body small { color: var(--color-ink-4); font-size: var(--fs-2xs); font-weight: 400; line-height: 1.4; }
</style>
