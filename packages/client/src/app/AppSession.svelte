<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { api, ApiError } from "../lib/api";
  import { navigate } from "../router";
  import { syncSessionAccess } from "../lib/session-access";
  import { applicationIntent } from "../lib/application-intent.svelte";
  import { syncFeedPreferences } from "../lib/feed-store.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import { isIosApp, platform } from "../lib/platform";
  import Onboarding from "../components/Onboarding.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import Spinner from "../components/Spinner.svelte";
  import ToastViewport from "../components/ToastViewport.svelte";
  import ApplicationReturnPrompt from "../components/ApplicationReturnPrompt.svelte";
  import {
    DEFAULT_SEARCH_PROFILE,
    ONBOARDING_VERSION,
    ROLE_OPTIONS,
    type SearchProfile,
  } from "../../../../shared/search-profile";

  let { children }: { children: Snippet } = $props();
  let showOnboarding = $state(false);
  let onboardingProfile: SearchProfile | null = $state(null);
  let sessionReady = $state(false);
  let booting = $state(true);
  let bootError: string | null = $state(null);
  let showAccessGate = $state(false);
  let accessCode = $state("");
  let accessError: string | null = $state(null);
  let unlocking = $state(false);
  let accessCodeInput: HTMLInputElement | null = $state(null);
  let bootGeneration = 0;
  const nativeIos = isIosApp();

  function initialNativeOnboardingProfile(profile: SearchProfile): SearchProfile {
    if (!nativeIos || profile.onboarding_version >= ONBOARDING_VERSION) return profile;
    const untouchedRoles = profile.roles.length === DEFAULT_SEARCH_PROFILE.roles.length
      && DEFAULT_SEARCH_PROFILE.roles.every((role) => profile.roles.includes(role));
    if (!untouchedRoles) return profile;
    return {
      ...profile,
      roles: ROLE_OPTIONS.map((role) => role.id),
      primary_role: ROLE_OPTIONS[0].id,
    };
  }

  async function bootstrapSession(): Promise<void> {
    const generation = ++bootGeneration;
    bootError = null;
    accessError = null;
    showAccessGate = false;
    try {
      const { me, preferences } = await api.bootstrap.get();
      if (generation !== bootGeneration) return;
      syncSessionAccess(me);
      const nextOnboardingProfile = initialNativeOnboardingProfile(preferences.search_profile);
      syncFeedPreferences(nextOnboardingProfile);
      onboardingProfile = nextOnboardingProfile;
      showOnboarding = preferences.search_profile.onboarding_version < 2
        || !preferences.search_profile.onboarding_completed_at;
      sessionReady = true;
    } catch (error) {
      if (generation !== bootGeneration) return;
      sessionReady = false;
      if (error instanceof ApiError && error.status === 401 && error.code === "access_required") {
        showAccessGate = true;
        return;
      }
      bootError = error instanceof Error ? error.message : "Could not load pinkslip.";
    } finally {
      if (generation === bootGeneration) booting = false;
    }
  }

  async function unlock(): Promise<void> {
    if (unlocking) return;
    if (!accessCode.trim()) {
      if (nativeIos) {
        accessError = "Enter the shared access code.";
        window.requestAnimationFrame(() => accessCodeInput?.focus());
      }
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
        : error instanceof Error ? error.message : "Could not unlock pinkslip.";
      booting = false;
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
      feedback.error(
        error instanceof ApiError && error.code === "invalid_email_token"
          ? "That sign-in link is invalid or expired. Request a new one."
          : error instanceof Error ? error.message : "Could not complete email sign-in.",
        { dedupeKey: "email-sign-in" }
      );
      if (!sessionReady) await bootstrapSession();
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
    void platform().notifications.initialize().catch((error) => {
      console.error("Notification initialization failed:", error);
    });
    void bootstrapSession();
    const retryWhenOnline = () => {
      if (bootError) retryBootstrap();
    };
    if (nativeIos) window.addEventListener("online", retryWhenOnline);
    return () => {
      if (nativeIos) window.removeEventListener("online", retryWhenOnline);
      detachApplicationIntent();
      detachMagicLink();
    };
  });
</script>

{#if sessionReady && !showOnboarding}
  {@render children()}
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
    <div class="boot-error-wrap">
      <div class="boot-error-card">
        <div class="h-display h-display-sm boot-error-title">Couldn’t load the app</div>
        <div class="boot-error-copy">{bootError}</div>
        <button class="btn-primary btn-accent" onclick={retryBootstrap}>Try again</button>
      </div>
    </div>
  {/if}
{:else}
  <div class="page-loading" aria-busy="true">
    <Spinner size={22} label={booting ? "Starting up" : "Waiting for access"} />
  </div>
{/if}

{#if showAccessGate}
  <div class="access-gate">
    <div class="access-card">
      <h2 class="h-display h-display-lg access-title">Enter the shared code</h2>
      <p class="access-copy">
        <span class="brand-word"><span class="brand-word-pink">Pink</span>slip</span>
        keeps shared state for your group, so the app checks a single access code before it loads.
      </p>
      <label for="access-code" class="field-label access-label">Access code</label>
      <input
        bind:this={accessCodeInput}
        id="access-code"
        class="input-field"
        type="password"
        placeholder="Enter code"
        bind:value={accessCode}
        aria-invalid={nativeIos && accessError ? "true" : undefined}
        aria-describedby={nativeIos && accessError ? "access-error" : undefined}
        oninput={() => { if (nativeIos) accessError = null; }}
        onkeydown={(event) => event.key === "Enter" && unlock()}
      />
      {#if accessError}<div id="access-error" class="alert alert-error access-alert" role="alert">{accessError}</div>{/if}
      <button class="btn-primary btn-accent full-width access-submit" disabled={unlocking || (!nativeIos && !accessCode.trim())} onclick={unlock}>
        {unlocking ? "Checking…" : "Unlock"}
      </button>
    </div>
  </div>
{/if}

{#if sessionReady && showOnboarding && onboardingProfile}
  <Onboarding initialProfile={onboardingProfile} onComplete={() => { showOnboarding = false; }} />
{/if}

<ToastViewport />
<ApplicationReturnPrompt />
