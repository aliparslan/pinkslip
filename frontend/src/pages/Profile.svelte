<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { companyMark } from "../lib/utils";
  import { navigate } from "../router";
  import CaretRight from "phosphor-svelte/lib/CaretRight";

  let loading: boolean = $state(true);
  let userName: string = $state("");

  let initials = $derived(userName ? companyMark(userName) : "?");

  onMount(() => {
    loading = true;
    api.me.get()
      .then((me) => { userName = me.user?.name ?? ""; })
      .catch(() => {})
      .finally(() => { loading = false; });
  });

  const settingsRows = [
    { label: "Job preferences", sub: "Locations, keywords, YOE", path: "/settings" },
    { label: "Companies", sub: "Manage tracked sources", path: "/profile/companies" },
    { label: "Notifications", sub: "Push alerts for new matches", path: "/settings" },
  ];
</script>

<div class="page">
  <div style="padding: 0 22px 28px;">
    <p class="h-eyebrow" style="margin-bottom: 6px;">Profile</p>

    {#if loading}
      <div style="padding: 20px 18px; border-radius: 18px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 20px;">
        <div style="display: flex; gap: 14px; align-items: center;">
          <div class="skeleton" style="width: 56px; height: 56px; border-radius: 14px;"></div>
          <div style="flex: 1;">
            <div class="skeleton" style="width: 55%; height: 18px; margin-bottom: 6px;"></div>
            <div class="skeleton" style="width: 35%; height: 12px;"></div>
          </div>
        </div>
      </div>
    {:else}
      <!-- Hero card -->
      <div style="padding: 20px 18px; border-radius: 18px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 24px;">
        <div style="display: flex; gap: 14px; align-items: center;">
          <div class="logo-mark" style="width: 56px; height: 56px; font-size: 22px; border-radius: 14px; background: var(--color-accent); color: var(--color-accent-ink); border-color: transparent; font-family: var(--font-display); font-weight: 700;">
            {initials}
          </div>
          <div style="flex: 1; min-width: 0;">
            <h2 class="h-display" style="font-size: 22px; margin-bottom: 2px;">{userName || "Set your name"}</h2>
            <div style="font-size: 13px; color: var(--color-ink-3);">Software Engineer</div>
          </div>
        </div>
      </div>

      <!-- Account settings -->
      <h3 class="h-eyebrow" style="margin-bottom: 10px;">Account</h3>
      <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden;">
        {#each settingsRows as row, i}
          <button
            style="appearance: none; border: 0; background: transparent; cursor: pointer; width: 100%; text-align: left; padding: 14px 16px; display: flex; align-items: center; gap: 12px; {i > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''} color: inherit;"
            onclick={() => navigate(row.path)}
          >
            <div style="flex: 1;">
              <div style="font-size: 14px; font-weight: 500;">{row.label}</div>
              <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">{row.sub}</div>
            </div>
            <CaretRight size={16} color="var(--color-ink-4)" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
