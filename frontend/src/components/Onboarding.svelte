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

<div class="onboarding">
  <!-- Progress bars pinned to top (clear of the status bar / Dynamic Island).
       Solid background so scrolled content never shows through behind them. -->
  <div class="onboarding-progress">
    <div class="onboarding-progress-track">
      {#each Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1) as s}
        <div class="onboarding-progress-segment" class:active={s <= step}></div>
      {/each}
    </div>
  </div>

  <!-- Content: top-aligned scroll region (consistent across short and tall
       steps — centering left huge dead space on short steps). The mask fades
       content out as it scrolls under the progress strip instead of clipping
       it mid-line. -->
  <div bind:this={scrollEl} class="onboarding-scroll">
    <div class="onboarding-content">

      {#if step === 1}
        <div class="onboarding-step">
          <div class="onboarding-brand">
            <svg class="onboarding-brand-mark" width="32" height="38" viewBox="0 0 22 26" fill="none">
              <rect x="1" y="1" width="20" height="24" rx="3" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="0.5"/>
              <rect x="5" y="6" width="12" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
              <rect x="5" y="10" width="9" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
              <rect x="5" y="14" width="11" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
            </svg>
            <span class="h-display h-display-lg onboarding-wordmark">
              <span class="brand-word-pink">pink</span>slip
            </span>
          </div>
          <h2 class="h-display h-display-lg onboarding-title">Beat the crowd</h2>
          <p class="onboarding-copy intro">
            Pick the work you want. We&rsquo;ll show you relevant early-career roles already in pinkslip.
          </p>
          <h3 class="section-label onboarding-section-label">What are you targeting?</h3>
          <div class="onboarding-fields">
            <SearchProfileFields bind:profile section="roles" showAdvanced={false} />
          </div>
          <button
            class="btn-primary btn-accent full-width"
            disabled={profile.roles.length === 0}
            onclick={beginOnboarding}
          >
            Continue
          </button>
        </div>

      {:else if step === 2}
        <div class="onboarding-step">
          <h2 class="h-display h-display-lg onboarding-title">Where can you work?</h2>
          <p class="onboarding-copy">
            Choose work modes, preferred metros, authorization, and whether relocation is on the table.
          </p>
          <div class="onboarding-fields">
            <SearchProfileFields bind:profile section="locations" showAdvanced={false} />
          </div>

          {#if profileError}
            <div class="alert alert-error onboarding-alert">
              {profileError}
            </div>
          {/if}

          <button
            class="btn-primary btn-accent full-width"
            disabled={saving || profile.work_modes.length === 0}
            onclick={handleProfileSubmit}
          >
            {#if saving}<Spinner />{/if}
            Save preferences
          </button>
        </div>

      {:else if step === 3}
        <div class="onboarding-step">
          <h2 class="h-display h-display-lg onboarding-title">Stay in the loop</h2>
          <p class="onboarding-copy">
            Turn on notifications so <span class="brand-word"><span class="brand-word-pink">pink</span>slip</span> can alert you when a new role fits your search.
          </p>

          <!-- Push notifications -->
          <div class="surface-list onboarding-notification-card">
            <div class="grouped-row">
              <div class="grouped-row-copy">
                <div class="row-title">Push notifications</div>
                <div class="helper-text">Get alerted about relevant new jobs</div>
              </div>
              {#if pushStatus === "enabled"}
                <span class="mono-value good">Enabled</span>
              {/if}
            </div>
            {#if pushStatus === "denied"}
              <div class="onboarding-notification-note">
                <div class="alert alert-warn alert-compact">
                  Permission denied. Turn on notifications for pinkslip in {isNativeIos() ? "iOS Settings" : "your browser settings"}.
                </div>
              </div>
            {/if}
            {#if pushStatus === "error"}
              <div class="onboarding-notification-note">
                <div class="alert alert-error alert-compact">
                  Something went wrong. You can set up notifications later in Settings.
                </div>
              </div>
            {/if}
          </div>

          {#if pushStatus === "enabled"}
            <button class="btn-primary btn-accent full-width" onclick={() => step = 4}>
              Continue
            </button>
          {:else}
            <button
              class="btn-primary btn-accent full-width"
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
        <div class="onboarding-step">
          <h2 class="h-display h-display-lg onboarding-title">Save your progress</h2>
          <p class="onboarding-copy">
            Create an account so your jobs, profile, preferences, and resume follow you across devices. Totally optional &mdash; as a guest, your data is saved to this app and tied to this browser session until you sign in.
          </p>

          <label for="onboarding-name" class="field-label onboarding-field-label">
            Your name <span class="label-opt">(optional)</span>
          </label>
          <input
            id="onboarding-name"
            class="input-field onboarding-name"
            type="text"
            placeholder="e.g. Alex"
            bind:value={name}
            autocomplete="name"
          />

          {#if accountError}
            <div class="alert alert-error onboarding-alert">
              {accountError}
            </div>
          {/if}

          {#if appleAvailable}
            <button
              class="btn-primary btn-accent onboarding-apple"
              disabled={signingInWithApple}
              onclick={handleAppleLogin}
            >
              {#if signingInWithApple}<Spinner />{/if}
              Continue with Apple
            </button>

            <div class="onboarding-divider">
              <div></div>
              <span>or</span>
              <div></div>
            </div>
          {/if}

          {#if emailLinkSent}
            <div class="onboarding-email-sent">
              <div class="onboarding-email-sent-title">
                <Check size={16} weight="bold" color="var(--color-good)" /> Check your email
              </div>
              <div class="helper-text">
                We sent a sign-in link to {emailLogin.trim()}. Open it on this device to finish &mdash; the link expires in 15 minutes.
              </div>
            </div>
          {:else}
            <label for="onboarding-email" class="field-label onboarding-field-label">
              Continue with email
            </label>
            <div class="stack-sm onboarding-email-form">
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
                class="btn-primary btn-accent full-width"
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
  .onboarding {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    padding: var(--safe-top) 0 var(--safe-bottom);
    background: var(--color-bg);
    overscroll-behavior: contain;
  }

  .onboarding-progress {
    flex-shrink: 0;
    padding: var(--space-5) var(--space-6) var(--space-2);
    background: var(--color-bg);
  }

  .onboarding-progress-track {
    display: flex;
    gap: 6px;
  }

  .onboarding-progress-segment {
    height: 3px;
    flex: 1;
    border-radius: var(--radius-full);
    background: var(--color-line);
    transition: background 180ms ease;
  }

  .onboarding-progress-segment.active {
    background: var(--color-accent);
  }

  /* Fade content out as it slides under the progress strip (instead of a hard
     mid-line clip at the scroll boundary). */
  .onboarding-scroll {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: var(--space-5) var(--space-8) var(--space-10);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 16px);
    mask-image: linear-gradient(to bottom, transparent 0, black 16px);
  }

  .onboarding-content {
    width: 100%;
    max-width: 360px;
  }

  .onboarding-step {
    animation: fade-in 300ms ease both;
  }

  .onboarding-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: var(--space-3);
  }

  .onboarding-brand-mark {
    flex-shrink: 0;
    transform: rotate(-8deg);
  }

  .onboarding-wordmark {
    line-height: 1;
  }

  .onboarding-title {
    margin-bottom: var(--space-2);
  }

  .onboarding-copy {
    margin: 0 0 var(--space-6);
    color: var(--color-ink-2);
    font-size: var(--fs-md);
    line-height: 1.5;
  }

  .onboarding-copy.intro {
    margin-bottom: var(--space-8);
    line-height: 1.55;
  }

  .onboarding-section-label,
  .onboarding-field-label {
    display: block;
    margin-bottom: var(--space-2);
  }

  .onboarding-fields,
  .onboarding-notification-card,
  .onboarding-email-form {
    margin-bottom: var(--space-6);
  }

  .onboarding-alert {
    margin-bottom: var(--space-4);
    font-size: var(--fs-xs);
  }

  .onboarding-notification-note {
    padding: 0 var(--space-4) 14px;
  }

  .onboarding-name {
    margin-bottom: var(--space-5);
  }

  .onboarding-apple {
    width: 100%;
    margin-bottom: var(--space-3);
  }

  .onboarding-divider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-1) 0 var(--space-4);
  }

  .onboarding-divider > div {
    height: 1px;
    flex: 1;
    background: var(--color-line);
  }

  .onboarding-divider span {
    color: var(--color-ink-4);
    font-family: var(--font-mono);
    font-size: var(--fs-2xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .onboarding-email-sent {
    padding: var(--space-4);
    margin-bottom: var(--space-6);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-bg-elev);
  }

  .onboarding-email-sent-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
    font-size: var(--fs-md);
    font-weight: 600;
  }

  .onboarding-skip {
    width: 100%;
    min-height: var(--tap-min);
    margin-top: var(--space-3);
    padding: 10px;
    border: 0;
    background: transparent;
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    cursor: pointer;
  }

  .onboarding-skip:hover { color: var(--color-ink); }
  .onboarding-skip:disabled { opacity: 0.5; cursor: default; }

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
