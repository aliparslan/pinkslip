<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { api, ApiError } from "../lib/api";
  import { navigate } from "../router";
  import { syncSessionAccess } from "../lib/session-access";
  import { loadLocalTailorKit } from "../lib/local-tailor";
  import { applicationIntent } from "../lib/application-intent.svelte";
  import { syncFeedPreferences } from "../lib/feed-store.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import { platform } from "../lib/platform";
  import Onboarding from "../components/Onboarding.svelte";
  import Spinner from "../components/Spinner.svelte";
  import ToastViewport from "../components/ToastViewport.svelte";
  import ApplicationReturnPrompt from "../components/ApplicationReturnPrompt.svelte";
  import type { SearchProfile } from "../../../../shared/search-profile";

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
  let bootGeneration = 0;

  async function bootstrapSession(): Promise<void> {
    const generation = ++bootGeneration;
    bootError = null;
    accessError = null;
    showAccessGate = false;
    try {
      const { me, preferences } = await api.bootstrap.get();
      if (generation !== bootGeneration) return;
      syncSessionAccess(me);
      syncFeedPreferences(preferences.search_profile);
      onboardingProfile = preferences.search_profile;
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
      const resume = loadLocalTailorKit().resume;
      if (resume) {
        await api.resumeAssets.upload({
          fileName: resume.fileName,
          mimeType: resume.mimeType,
          size: resume.size,
          dataUrl: resume.dataUrl,
          extractedText: resume.textContent,
        }).catch(() => undefined);
      }
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

  onMount(() => {
    const detachApplicationIntent = applicationIntent.initialize();
    const detachMagicLink = platform().auth.attachMagicLink((token) => void completeMagicLink(token));
    void platform().notifications.initialize().catch((error) => {
      console.error("Notification initialization failed:", error);
    });
    void bootstrapSession();
    return () => {
      detachApplicationIntent();
      detachMagicLink();
    };
  });
</script>

{#if sessionReady && !showOnboarding}
  {@render children()}
{:else if bootError}
  <div class="boot-error-wrap">
    <div class="boot-error-card">
      <div class="h-display h-display-sm boot-error-title">Couldn’t load the app</div>
      <div class="boot-error-copy">{bootError}</div>
      <button class="btn-primary btn-accent" onclick={() => { booting = true; bootstrapSession(); }}>Try again</button>
    </div>
  </div>
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
        id="access-code"
        class="input-field"
        type="password"
        placeholder="Enter code"
        bind:value={accessCode}
        onkeydown={(event) => event.key === "Enter" && unlock()}
      />
      {#if accessError}<div class="alert alert-error access-alert" role="alert">{accessError}</div>{/if}
      <button class="btn-primary btn-accent full-width access-submit" disabled={!accessCode.trim() || unlocking} onclick={unlock}>
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
