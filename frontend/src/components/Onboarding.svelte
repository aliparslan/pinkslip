<script lang="ts">
  import { api } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { isNativeIosAuthAvailable, signInWithAppleNative } from "../lib/native-auth";
  import { enableNativePush, isNativeIos } from "../lib/native-push";
  import { syncSessionAccess } from "../lib/session-access";
  import {
    DEFAULT_SEARCH_PROFILE,
    ONBOARDING_VERSION,
    normalizeSearchProfile,
    type SearchProfile,
  } from "../../../shared/search-profile";
  import SearchProfileFields from "./SearchProfileFields.svelte";
  import Check from "phosphor-svelte/lib/Check";
  import Spinner from "./Spinner.svelte";

  let { onComplete }: { onComplete: (name: string) => void } = $props();

  const TOTAL_STEPS = 4;

  let step: number = $state(1);
  let name: string = $state("");
  let saving: boolean = $state(false);
  let pushStatus: string = $state("idle");
  let enablingPush: boolean = $state(false);
  let profile: SearchProfile = $state(normalizeSearchProfile(DEFAULT_SEARCH_PROFILE));
  let profileError: string | null = $state(null);

  // Final step: optional account creation. Guests can always skip; their data is
  // stored server-side against the session cookie and signing in folds that guest
  // data into the account.
  const appleAvailable = isNativeIosAuthAvailable();
  let emailLogin: string = $state("");
  let signingInWithApple: boolean = $state(false);
  let sendingEmailLogin: boolean = $state(false);
  let emailLinkSent: boolean = $state(false);
  let accountError: string | null = $state(null);
  let onboardingStartRecorded = false;
  let scrollEl: HTMLDivElement | null = $state(null);

  $effect(() => {
    step;
    if (scrollEl) scrollEl.scrollTop = 0;
  });

  async function beginOnboarding() {
    if (!onboardingStartRecorded) {
      onboardingStartRecorded = true;
      await api.interactions.event({
        event_name: "onboarding_started",
        entity_type: "onboarding",
        properties: { onboarding_version: ONBOARDING_VERSION },
      }).catch(() => undefined);
    }
    step = 2;
  }

  async function handleEnablePush() {
    enablingPush = true;
    try {
      const ok = (await enableNativePush()) === "enabled";
      pushStatus = ok ? "enabled" : "denied";
      if (ok) {
        const saved = await api.preferences.update({
          search_profile: { ...profile, notifications_enabled: true },
        });
        profile = normalizeSearchProfile(saved.search_profile);
      }
    } catch {
      pushStatus = "error";
    } finally {
      enablingPush = false;
    }
  }

  async function handleProfileSubmit() {
    if (profile.roles.length === 0 || profile.work_modes.length === 0 || saving) return;

    saving = true;
    profileError = null;
    try {
      const saved = await api.preferences.update({
        search_profile: {
          ...profile,
          onboarding_version: ONBOARDING_VERSION,
          onboarding_completed_at: new Date().toISOString(),
        },
      });
      profile = normalizeSearchProfile(saved.search_profile);
      await api.interactions.event({
        event_name: "onboarding_completed",
        entity_type: "onboarding",
        properties: { onboarding_version: ONBOARDING_VERSION },
      }).catch(() => undefined);
      step = 3;
    } catch (e) {
      profileError = errorMessage(e, "Could not save your search profile.");
    } finally {
      saving = false;
    }
  }

  async function handleAppleLogin() {
    if (signingInWithApple) return;
    signingInWithApple = true;
    accountError = null;
    try {
      if (name.trim()) await api.me.update({ name: name.trim() });
      const credential = await signInWithAppleNative();
      const accountState = await api.auth.signInWithApple(credential);
      syncSessionAccess(accountState);
      // Signed in — the guest data we just gathered now lives on the account.
      await finish();
    } catch (e) {
      if ((e as { code?: string })?.code === "CANCELED") return; // user dismissed the sheet — not an error
      accountError = errorMessage(e, "Could not complete Sign in with Apple.");
    } finally {
      signingInWithApple = false;
    }
  }

  async function handleEmailLoginStart() {
    if (!emailLogin.trim() || sendingEmailLogin) return;
    sendingEmailLogin = true;
    accountError = null;
    try {
      if (name.trim()) await api.me.update({ name: name.trim() });
      await api.auth.startEmailLogin(emailLogin.trim());
      emailLinkSent = true;
    } catch (e) {
      accountError = errorMessage(e, "Could not send the sign-in link.");
    } finally {
      sendingEmailLogin = false;
    }
  }

  async function finish() {
    if (saving) return;
    saving = true;
    accountError = null;
    try {
      if (name.trim()) await api.me.update({ name: name.trim() });
      onComplete(name.trim());
    } catch (e) {
      accountError = errorMessage(e, "Could not finish setup. Check your connection and try again.");
    } finally {
      saving = false;
    }
  }
</script>

<div style="position: fixed; inset: 0; z-index: 30; background: var(--color-bg); display: flex; flex-direction: column; padding-top: var(--safe-top); padding-bottom: var(--safe-bottom); overscroll-behavior: contain;">
  <!-- Progress bars pinned to top (clear of the status bar / Dynamic Island).
       Solid background so scrolled content never shows through behind them. -->
  <div style="padding: 20px 24px 8px; flex-shrink: 0; background: var(--color-bg);">
    <div style="display: flex; gap: 6px;">
      {#each Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1) as s}
        <div style="height: 3px; flex: 1; border-radius: var(--radius-full); background: {s <= step ? 'var(--color-accent)' : 'var(--color-line)'}; transition: background 0.3s;"></div>
      {/each}
    </div>
  </div>

  <!-- Content: top-aligned scroll region (consistent across short and tall
       steps — centering left huge dead space on short steps). The mask fades
       content out as it scrolls under the progress strip instead of clipping
       it mid-line. -->
  <div bind:this={scrollEl} class="onboarding-scroll" style="flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; align-items: center; padding: 20px 32px 40px;">
    <div style="width: 100%; max-width: 360px; margin: 0;">

      {#if step === 1}
        <div style="animation: fade-in 0.3s;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <svg width="32" height="38" viewBox="0 0 22 26" fill="none" style="transform: rotate(-8deg); flex-shrink: 0;">
              <rect x="1" y="1" width="20" height="24" rx="3" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="0.5"/>
              <rect x="5" y="6" width="12" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
              <rect x="5" y="10" width="9" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
              <rect x="5" y="14" width="11" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
            </svg>
            <span class="h-display h-display-lg" style="line-height: 1;">
              <span style="color: var(--color-accent);">pink</span>slip
            </span>
          </div>
          <h2 class="h-display h-display-lg" style="margin-bottom: 8px;">Beat the crowd</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.55; margin-bottom: 32px;">
            Pick the work you want. We&rsquo;ll show you relevant early-career roles already in pinkslip.
          </p>
          <h3 class="section-label" style="margin-bottom: 12px;">What are you targeting?</h3>
          <div style="margin-bottom: 24px;">
            <SearchProfileFields bind:profile section="roles" showAdvanced={false} />
          </div>
          <button
            class="btn-primary btn-accent"
            style="width: 100%;"
            disabled={profile.roles.length === 0}
            onclick={beginOnboarding}
          >
            Continue
          </button>
        </div>

      {:else if step === 2}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display h-display-lg" style="margin-bottom: 8px;">Where can you work?</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            Choose work modes, preferred metros, authorization, and whether relocation is on the table.
          </p>
          <div style="margin-bottom: 24px;">
            <SearchProfileFields bind:profile section="locations" showAdvanced={false} />
          </div>

          {#if profileError}
            <div class="alert alert-error" style="margin-bottom: 16px; font-size: var(--fs-xs);">
              {profileError}
            </div>
          {/if}

          <button
            class="btn-primary btn-accent"
            style="width: 100%;"
            disabled={saving || profile.work_modes.length === 0}
            onclick={handleProfileSubmit}
          >
            {#if saving}<Spinner />{/if}
            Save preferences
          </button>
        </div>

      {:else if step === 3}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display h-display-lg" style="margin-bottom: 8px;">Stay in the loop</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            Turn on notifications so <span class="brand-word"><span class="brand-word-pink">pink</span>slip</span> can alert you when a new role fits your search.
          </p>

          <!-- Push notifications -->
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 24px;">
            <div style="padding: 16px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 14px; font-weight: 600;">Push notifications</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">Get alerted about relevant new jobs</div>
              </div>
              {#if pushStatus === "enabled"}
                <span style="font-family: var(--font-mono); font-size: 12px; color: var(--color-good); font-weight: 500;">Enabled</span>
              {/if}
            </div>
            {#if pushStatus === "denied"}
              <div style="padding: 0 16px 14px;">
                <div class="alert alert-warn" style="font-size: var(--fs-xs);">
                  Permission denied. Turn on notifications for pinkslip in {isNativeIos() ? "iOS Settings" : "your browser settings"}.
                </div>
              </div>
            {/if}
            {#if pushStatus === "error"}
              <div style="padding: 0 16px 14px;">
                <div class="alert alert-error" style="font-size: var(--fs-xs);">
                  Something went wrong. You can set up notifications later in Settings.
                </div>
              </div>
            {/if}
          </div>

          {#if pushStatus === "enabled"}
            <button class="btn-primary btn-accent" style="width: 100%;" onclick={() => step = 4}>
              Continue
            </button>
          {:else}
            <button
              class="btn-primary btn-accent"
              style="width: 100%;"
              disabled={enablingPush}
              onclick={handleEnablePush}
            >
              {#if enablingPush}<Spinner />{/if}
              Enable notifications
            </button>
            <button class="onboarding-skip" onclick={() => step = 4}>Not now</button>
          {/if}
        </div>

      {:else if step === 4}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display h-display-lg" style="margin-bottom: 8px;">Save your progress</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            Create an account so your jobs, profile, preferences, and resume follow you across devices. Totally optional &mdash; as a guest, your data is saved to this app and tied to this browser session until you sign in.
          </p>

          <label for="onboarding-name" class="field-label" style="margin-bottom: 8px;">
            Your name <span style="color: var(--color-ink-3); font-weight: 400;">(optional)</span>
          </label>
          <input
            id="onboarding-name"
            class="input-field"
            type="text"
            placeholder="e.g. Alex"
            bind:value={name}
            autocomplete="name"
            style="margin-bottom: 20px;"
          />

          {#if accountError}
            <div class="alert alert-error" style="margin-bottom: 16px; font-size: var(--fs-xs);">
              {accountError}
            </div>
          {/if}

          {#if appleAvailable}
            <button
              class="btn-primary btn-accent"
              style="width: 100%; margin-bottom: 12px;"
              disabled={signingInWithApple}
              onclick={handleAppleLogin}
            >
              {#if signingInWithApple}<Spinner />{/if}
              Continue with Apple
            </button>

            <div style="display: flex; align-items: center; gap: 12px; margin: 4px 0 16px;">
              <div style="height: 0.5px; flex: 1; background: var(--color-line);"></div>
              <span style="font-size: 11px; color: var(--color-ink-3); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em;">or</span>
              <div style="height: 0.5px; flex: 1; background: var(--color-line);"></div>
            </div>
          {/if}

          {#if emailLinkSent}
            <div style="padding: 16px; border-radius: var(--radius-lg); background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 24px;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; margin-bottom: 4px;">
                <Check size={16} weight="bold" color="var(--color-good)" /> Check your email
              </div>
              <div style="font-size: 12px; color: var(--color-ink-3); line-height: 1.45;">
                We sent a sign-in link to {emailLogin.trim()}. Open it on this device to finish &mdash; the link expires in 15 minutes.
              </div>
            </div>
          {:else}
            <label for="onboarding-email" class="field-label" style="margin-bottom: 8px;">
              Continue with email
            </label>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
              <input
                id="onboarding-email"
                class="input-field"
                type="email"
                placeholder="you@example.com"
                bind:value={emailLogin}
                autocapitalize="off"
                autocomplete="email"
                spellcheck="false"
                onkeydown={(e) => e.key === "Enter" && handleEmailLoginStart()}
              />
              <button
                class="btn-primary btn-accent"
                style="width: 100%;"
                disabled={sendingEmailLogin || !emailLogin.trim()}
                onclick={handleEmailLoginStart}
              >
                {#if sendingEmailLogin}<Spinner />{/if}
                Send link
              </button>
            </div>
          {/if}

          <button class="onboarding-skip" disabled={saving} onclick={() => void finish()}>
            {emailLinkSent ? "Continue to pinkslip" : "Maybe later — keep using as guest"}
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>

<style>
  /* Fade content out as it slides under the progress strip (instead of a hard
     mid-line clip at the scroll boundary). */
  .onboarding-scroll {
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 16px);
    mask-image: linear-gradient(to bottom, transparent 0, black 16px);
  }

  .onboarding-skip { width: 100%; margin-top: 12px; padding: 10px; border: 0; background: transparent; color: var(--color-ink-3); font-size: var(--fs-sm); cursor: pointer; }
  .onboarding-skip:hover { color: var(--color-ink); }
  .onboarding-skip:disabled { opacity: 0.5; cursor: default; }
</style>
