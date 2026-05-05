<script lang="ts">
  import { onMount } from "svelte";
  import { currentRoute, navigate } from "./router";
  import { themeMode, cycleTheme } from "./lib/theme";
  import { searchOpen, unviewedCount } from "./lib/feed-state";
  import { api, ApiError } from "./lib/api";
  import Sun from "phosphor-svelte/lib/Sun";
  import Moon from "phosphor-svelte/lib/Moon";
  import CircleHalf from "phosphor-svelte/lib/CircleHalf";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import Bell from "phosphor-svelte/lib/Bell";
  import Feed from "./pages/Feed.svelte";
  import JobDetail from "./pages/JobDetail.svelte";
  import Tracker from "./pages/Tracker.svelte";
  import Companies from "./pages/Companies.svelte";
  import Settings from "./pages/Settings.svelte";
  import Events from "./pages/Events.svelte";
  import Corpus from "./pages/Corpus.svelte";
  import Tailor from "./pages/Tailor.svelte";
  import TabBar from "./components/TabBar.svelte";
  import Onboarding from "./components/Onboarding.svelte";

  const routes: Record<string, any> = {
    "/": Feed,
    "/tracker": Tracker,
    "/events": Events,
    "/profile": Settings,
    "/companies": Companies,
    "/corpus": Corpus,
    "/settings": Settings,
  };

  let route = $derived($currentRoute);
  let isDetailPage = $derived(route.startsWith("/jobs/"));
  let isTailorPage = $derived(route.startsWith("/tailor/"));
  let CurrentPage = $derived(
    isDetailPage ? JobDetail : isTailorPage ? Tailor : (routes[route] ?? Feed)
  );
  let jobId = $derived(
    isDetailPage
      ? route.split("/jobs/")[1]
      : isTailorPage
        ? route.split("/tailor/")[1]
        : null
  );
  let showTabBar = $derived(!isDetailPage && !isTailorPage);
  let mode = $derived($themeMode);
  let badgeCount = $derived($unviewedCount);
  let isOnFeed = $derived(route === "/");

  function toggleSearch() {
    if (!isOnFeed) navigate("/");
    searchOpen.update((v) => !v);
  }

  function goToFeed() {
    if (!isOnFeed) navigate("/");
  }

  let showOnboarding: boolean = $state(false);
  let userName: string = $state("");
  let booting: boolean = $state(true);
  let sessionReady: boolean = $state(false);
  let bootError: string | null = $state(null);
  let showAccessGate: boolean = $state(false);
  let accessCode: string = $state("");
  let accessError: string | null = $state(null);
  let unlocking: boolean = $state(false);

  async function bootstrapSession() {
    bootError = null;
    accessError = null;
    showAccessGate = false;

    try {
      const res = await api.me.get();
      userName = res.user?.name ?? "";
      showOnboarding = !userName;
      sessionReady = true;
    } catch (error) {
      sessionReady = false;
      if (error instanceof ApiError && error.status === 401 && error.code === "access_required") {
        showAccessGate = true;
        return;
      }
      bootError = error instanceof Error ? error.message : "Could not load pinkslip.";
    } finally {
      booting = false;
    }
  }

  async function handleAccessSubmit() {
    if (!accessCode.trim() || unlocking) return;
    unlocking = true;
    accessError = null;

    try {
      await api.access.unlock(accessCode.trim());
      accessCode = "";
      booting = true;
      await bootstrapSession();
    } catch (error) {
      accessError = error instanceof ApiError && error.status === 401
        ? "That code did not match."
        : error instanceof Error
          ? error.message
          : "Could not unlock pinkslip.";
      booting = false;
    } finally {
      unlocking = false;
    }
  }

  onMount(() => {
    bootstrapSession();
  });
</script>

<!-- Top bar -->
<header class="app-shell-header">
  <div style="display: flex; align-items: center; gap: 8px;">
    <!-- pinkslip icon -->
    <svg width="22" height="26" viewBox="0 0 22 26" fill="none" aria-hidden="true" style="transform: rotate(-8deg); flex-shrink: 0;">
      <rect x="1" y="1" width="20" height="24" rx="3" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="0.5"/>
      <rect x="5" y="6" width="12" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
      <rect x="5" y="10" width="9" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
      <rect x="5" y="14" width="11" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
    </svg>
    <span class="h-display" style="font-size: 22px; line-height: 1;">
      <span style="color: var(--color-accent);">pink</span>slip
    </span>
  </div>
  <div style="display: flex; align-items: center; gap: 2px;">
    <button class="icon-btn" onclick={toggleSearch} aria-label="Search jobs">
      <MagnifyingGlass size={18} weight="regular" />
    </button>
    <button class="icon-btn" onclick={goToFeed} aria-label="New jobs" style="position: relative;">
      <Bell size={18} weight="regular" />
      {#if badgeCount > 0}
        <span style="position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; border-radius: 50%; background: var(--color-accent); border: 1.5px solid var(--color-bg);"></span>
      {/if}
    </button>
    <button class="icon-btn" onclick={cycleTheme} aria-label="Toggle theme">
      {#if mode === "system"}
        <Sun size={18} weight="regular" />
      {:else if mode === "light"}
        <Moon size={18} weight="regular" />
      {:else}
        <CircleHalf size={18} weight="regular" />
      {/if}
    </button>
  </div>
</header>

<div class="app-container min-h-screen pb-28">
  {#if sessionReady}
    {#if isDetailPage}
      <CurrentPage {jobId} />
    {:else if isTailorPage}
      <CurrentPage {jobId} />
    {:else}
      <CurrentPage />
    {/if}
    {#if showTabBar}
      <TabBar />
    {/if}
  {:else if bootError}
    <div style="padding: 32px 22px 28px;">
      <div style="padding: 18px; border-radius: 16px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad);">
        <div class="h-display" style="font-size: 22px; margin-bottom: 6px;">Couldn’t load the app</div>
        <div style="font-size: 14px; margin-bottom: 14px;">{bootError}</div>
        <button class="btn-primary btn-accent" onclick={() => { booting = true; bootstrapSession(); }}>
          Try again
        </button>
      </div>
    </div>
  {:else}
    <div style="padding: 48px 22px 28px; text-align: center; color: var(--color-ink-3); font-family: var(--font-mono); font-size: 12px;">
      {booting ? "Starting up..." : "Waiting for access..."}
    </div>
  {/if}
</div>

{#if showAccessGate}
  <div style="position: fixed; inset: 0; z-index: 70; background: color-mix(in oklch, var(--color-bg) 92%, transparent); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center; padding: 24px;">
    <div style="width: min(100%, 360px); padding: 24px; border-radius: 20px; background: var(--color-bg-elev); border: 1px solid var(--color-line); box-shadow: 0 18px 50px rgba(0,0,0,0.16);">
      <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">Enter the shared code</h2>
      <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.55; margin-bottom: 18px;">
        <span class="brand-word"><span class="brand-word-pink">Pink</span>slip</span>
        keeps shared state for your group, so the app now checks a single access code before it loads.
      </p>
      <label for="access-code" class="field-label" style="margin-bottom: 8px;">
        Access code
      </label>
      <input
        id="access-code"
        class="input-field"
        type="password"
        placeholder="Enter code"
        bind:value={accessCode}
        onkeydown={(event) => event.key === "Enter" && handleAccessSubmit()}
      />
      {#if accessError}
        <div style="margin-top: 12px; padding: 12px 14px; border-radius: 12px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 13px;">
          {accessError}
        </div>
      {/if}
      <button
        class="btn-primary btn-accent"
        style="width: 100%; margin-top: 16px;"
        disabled={!accessCode.trim() || unlocking}
        onclick={handleAccessSubmit}
      >
        {unlocking ? "Checking..." : "Unlock"}
      </button>
    </div>
  </div>
{/if}

{#if sessionReady && showOnboarding}
  <Onboarding onComplete={(name) => { userName = name; showOnboarding = false; }} />
{/if}
