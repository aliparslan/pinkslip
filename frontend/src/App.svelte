<script lang="ts">
  import { onMount } from "svelte";
  import { currentRoute } from "./router";
  import { themeMode, cycleTheme } from "./lib/theme";
  import { api } from "./lib/api";
  import Sun from "phosphor-svelte/lib/Sun";
  import Moon from "phosphor-svelte/lib/Moon";
  import CircleHalf from "phosphor-svelte/lib/CircleHalf";
  import Feed from "./pages/Feed.svelte";
  import JobDetail from "./pages/JobDetail.svelte";
  import Tracker from "./pages/Tracker.svelte";
  import Events from "./pages/Events.svelte";
  import Profile from "./pages/Profile.svelte";
  import Companies from "./pages/Companies.svelte";
  import TabBar from "./components/TabBar.svelte";
  import Onboarding from "./components/Onboarding.svelte";

  const routes: Record<string, any> = {
    "/": Feed,
    "/tracker": Tracker,
    "/events": Events,
    "/profile": Profile,
    "/profile/companies": Companies,
  };

  let route = $derived($currentRoute);
  let isDetailPage = $derived(route.startsWith("/jobs/"));
  let CurrentPage = $derived(
    isDetailPage ? JobDetail : (routes[route] ?? Feed)
  );
  let jobId = $derived(isDetailPage ? route.split("/jobs/")[1] : null);
  let mode = $derived($themeMode);

  let showOnboarding: boolean = $state(false);
  let userName: string = $state("");

  onMount(() => {
    api.me.get()
      .then(res => {
        userName = res.user?.name ?? "";
        if (!userName) showOnboarding = true;
      })
      .catch(() => {});
  });
</script>

<!-- Top bar -->
<header style="position: sticky; top: 0; z-index: 40; padding: 10px 22px; display: flex; align-items: center; justify-content: space-between; background: color-mix(in oklch, var(--color-bg) 94%, transparent); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid var(--color-line); box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
  <div style="display: flex; align-items: center; gap: 8px;">
    <!-- pinkslip icon -->
    <svg width="22" height="26" viewBox="0 0 22 26" fill="none" style="transform: rotate(-8deg); flex-shrink: 0;">
      <rect x="1" y="1" width="20" height="24" rx="3" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="0.5"/>
      <rect x="5" y="6" width="12" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
      <rect x="5" y="10" width="9" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
      <rect x="5" y="14" width="11" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
    </svg>
    <span class="h-display" style="font-size: 22px; line-height: 1;">
      <span style="color: var(--color-accent);">pink</span>slip
    </span>
  </div>
  <button class="icon-btn" onclick={cycleTheme} aria-label="Toggle theme">
    {#if mode === "light"}
      <Sun size={18} weight="regular" />
    {:else if mode === "dark"}
      <Moon size={18} weight="regular" />
    {:else}
      <CircleHalf size={18} weight="regular" />
    {/if}
  </button>
</header>

<div class="min-h-screen pb-28">
  {#if isDetailPage}
    <CurrentPage {jobId} />
  {:else}
    <CurrentPage />
  {/if}
  <TabBar />
</div>

{#if showOnboarding}
  <Onboarding onComplete={(name) => { userName = name; showOnboarding = false; }} />
{/if}
