<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { api, ApiError } from "@pinkslip/core/api";
  import { currentRoute, navigate, routeDefinition } from "../router";
  import { syncSessionAccess } from "../lib/session-access";
  import { applicationIntent } from "../lib/application-intent.svelte";
  import { syncFeedPreferences } from "../lib/feed-store.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import {
    clearBootstrapCache,
    readBootstrapCache,
    writeBootstrapCache,
    type BootstrapSnapshot,
  } from "../lib/bootstrap-cache";
  import { isIosApp, platform } from "../lib/platform";
  import {
    hasReadableJobCache,
    leaveCachedReadMode,
    setJobReadCacheOwner,
  } from "../lib/job-read-cache";
  import Onboarding from "../components/Onboarding.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import Spinner from "../components/Spinner.svelte";
  import BrandLoading from "../components/BrandLoading.svelte";
  import ToastViewport from "../components/ToastViewport.svelte";
  import ApplicationReturnPrompt from "../components/ApplicationReturnPrompt.svelte";
  import {
    ONBOARDING_VERSION,
    type SearchProfile,
  } from "../../../../shared/search-profile";

  const NATIVE_STARTUP_SHELL_CAP_MS = 650;
  let { children }: { children: Snippet } = $props();
  const nativeIos = isIosApp();
  const initialBootstrap = nativeIos ? readBootstrapCache() : null;
  let showOnboarding = $state(false);
  let onboardingProfile: SearchProfile | null = $state(null);
  let sessionReady = $state(false);
  let booting = $state(initialBootstrap === null);
  let bootError: string | null = $state(null);
  let showAccessGate = $state(false);
  let accessCode = $state("");
  let accessError: string | null = $state(null);
  let unlocking = $state(false);
  let accessCodeInput: HTMLInputElement | null = $state(null);
  let bootGeneration = 0;
  let nativeStartupCapElapsed = $state(false);
  let offlineSession = $state(false);

  function applyBootstrap({ me, preferences }: BootstrapSnapshot): void {
    syncSessionAccess(me);
    // v3 replays onboarding for existing users, but the form must begin with
    // their saved role and location choices intact. Profile normalization has
    // already supplied the three migrated career stages.
    const nextOnboardingProfile = preferences.search_profile;
    syncFeedPreferences(nextOnboardingProfile);
    onboardingProfile = nextOnboardingProfile;
    showOnboarding = preferences.search_profile.onboarding_version < ONBOARDING_VERSION
      || !preferences.search_profile.onboarding_completed_at;
    sessionReady = true;
  }

  if (initialBootstrap) applyBootstrap(initialBootstrap);

  async function bootstrapSession(): Promise<void> {
    const generation = ++bootGeneration;
    bootError = null;
    accessError = null;
    showAccessGate = false;
    const hadRenderableSession = sessionReady;
    try {
      const bootstrap = await api.bootstrap.get();
      if (generation !== bootGeneration) return;
      await setJobReadCacheOwner(bootstrap.me.user?.id ?? null);
      if (generation !== bootGeneration) return;
      applyBootstrap(bootstrap);
      offlineSession = false;
      leaveCachedReadMode();
      if (nativeIos) writeBootstrapCache(bootstrap);
    } catch (error) {
      if (generation !== bootGeneration) return;
      if (error instanceof ApiError && error.status === 401 && error.code === "access_required") {
        sessionReady = false;
        if (nativeIos) clearBootstrapCache();
        showAccessGate = true;
        return;
      }
      if (hadRenderableSession) {
        feedback.error("Couldn’t refresh your account. Showing the last saved state.", {
          dedupeKey: "bootstrap-refresh",
        });
        return;
      }
      if (!nativeIos && await hasReadableJobCache()) {
        sessionReady = true;
        showOnboarding = false;
        offlineSession = true;
        const offlineRoute = routeDefinition($currentRoute);
        if (offlineRoute.id !== "feed" && offlineRoute.id !== "job") {
          navigate("/", { replace: true });
        }
        return;
      }
      sessionReady = false;
      bootError = error instanceof Error
        ? error.message
        : `Could not load ${nativeIos ? "Pinkslip" : "pinkslip"}.`;
    } finally {
      if (generation === bootGeneration) booting = false;
    }
  }

  async function unlock(): Promise<void> {
    if (unlocking) return;
    if (!accessCode.trim()) {
      accessError = "Enter the shared access code.";
      window.requestAnimationFrame(() => accessCodeInput?.focus());
      return;
    }
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
          : `Could not unlock ${nativeIos ? "Pinkslip" : "pinkslip"}.`;
      booting = false;
      window.requestAnimationFrame(() => accessCodeInput?.focus());
    } finally {
      unlocking = false;
    }
  }

  async function completeMagicLink(token: string): Promise<void> {
    // Invalidate a cold-launch bootstrap that may still be using the guest
    // token. The API client also protects the newly rotated token if that stale
    // request returns `invalid_token` after this exchange completes.
    bootGeneration += 1;
    booting = true;
    bootError = null;
    try {
      const accountState = await api.auth.verifyEmailToken(token);
      syncSessionAccess(accountState);
      await bootstrapSession();
      navigate("/you/account");
      feedback.success("You’re signed in.");
    } catch (error) {
      const invalidOrExpired = error instanceof ApiError && error.code === "invalid_email_token";
      feedback.error(
        invalidOrExpired
          ? "That sign-in link is invalid or expired. Request a new one."
          : error instanceof Error ? error.message : "Could not complete email sign-in.",
        {
          dedupeKey: "email-sign-in",
          action: invalidOrExpired
            ? { label: "Request new link", run: () => navigate("/you/account") }
            : undefined,
        }
      );
      if (!sessionReady) await bootstrapSession();
      if (invalidOrExpired) navigate("/you/account");
    }
  }

  function retryBootstrap() {
    if (booting) return;
    booting = true;
    void bootstrapSession();
  }

  onMount(() => {
    const detachApplicationIntent = applicationIntent.initialize();
    const detachMagicLink = platform().auth.attachMagicLink((token) => void completeMagicLink(token));
    const startupCap = nativeIos
      ? window.setTimeout(() => { nativeStartupCapElapsed = true; }, NATIVE_STARTUP_SHELL_CAP_MS)
      : null;
    void bootstrapSession();
    const retryWhenOnline = () => {
      if (bootError || offlineSession) retryBootstrap();
    };
    window.addEventListener("online", retryWhenOnline);
    return () => {
      if (startupCap !== null) window.clearTimeout(startupCap);
      window.removeEventListener("online", retryWhenOnline);
      detachApplicationIntent();
      detachMagicLink();
    };
  });

  $effect(() => {
    if (!showAccessGate) return;
    window.requestAnimationFrame(() => accessCodeInput?.focus());
  });
</script>

{#if (sessionReady || (nativeIos && nativeStartupCapElapsed && booting)) && !showOnboarding}
  {@render children()}
{:else if sessionReady && showOnboarding && onboardingProfile}
  <Onboarding initialProfile={onboardingProfile} onComplete={() => { showOnboarding = false; }} />
{:else if showAccessGate}
  <main class="access-gate">
    <form
      class="access-card"
      aria-labelledby="access-gate-title"
      onsubmit={(event) => {
        event.preventDefault();
        void unlock();
      }}
    >
      <h1 id="access-gate-title" class="h-display h-display-lg access-title">Enter the shared code</h1>
      <p class="access-copy">
        <span class="brand-word"><span class="brand-word-pink">Pink</span>slip</span>
        keeps shared state for your group, so the app checks a single access code before it loads.
      </p>
      <label for="access-code" class="field-label access-label">Access code</label>
      <input
        bind:this={accessCodeInput}
        id="access-code"
        name="access-code"
        class="input-field"
        type="password"
        placeholder="Enter code"
        bind:value={accessCode}
        autocapitalize="off"
        spellcheck="false"
        aria-invalid={accessError ? "true" : undefined}
        aria-describedby={accessError ? "access-error" : undefined}
        oninput={() => { accessError = null; }}
      />
      {#if accessError}<div id="access-error" class="alert alert-error access-alert" role="alert">{accessError}</div>{/if}
      <button class="btn-primary btn-accent full-width access-submit" type="submit" disabled={unlocking}>
        {unlocking ? "Checking…" : "Unlock"}
      </button>
    </form>
  </main>
{:else if bootError}
  {#if nativeIos}
    <main class="boot-error-wrap native-session-failure">
      <PageFailure
        title="Can’t connect right now"
        message="Check your internet connection, then try again."
        onRetry={retryBootstrap}
      />
    </main>
  {:else}
    <main class="boot-error-wrap">
      <div class="boot-error-card">
        <h1 class="h-display h-display-sm boot-error-title">Couldn’t load the app</h1>
        <div class="boot-error-copy">{bootError}</div>
        <button class="btn-primary btn-accent" onclick={retryBootstrap}>Try again</button>
      </div>
    </main>
  {/if}
{:else}
  {#if nativeIos}
    <BrandLoading label="Starting Pinkslip" />
  {:else}
    <div class="page-loading" aria-busy="true">
      <Spinner size={22} label="Starting up" />
    </div>
  {/if}
{/if}

<ToastViewport />
<ApplicationReturnPrompt />
