<script lang="ts">
  import { api } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { isNativeIosAuthAvailable, signInWithAppleNative } from "../lib/native-auth";
  import { enableNativePush, isNativeIos } from "../lib/native-push";
  import { syncSessionAccess } from "../lib/session-access";
  import {
    createLocalResumeAsset,
    formatFileSize,
    loadLocalTailorKit,
    updateLocalTailorKit,
    type LocalResumeAsset,
  } from "../lib/local-tailor";
  import {
    DEFAULT_SEARCH_PROFILE,
    ONBOARDING_VERSION,
    normalizeSearchProfile,
    type SearchProfile,
  } from "../../../shared/search-profile";
  import SearchProfileFields from "./SearchProfileFields.svelte";
  import AppleMark from "./AppleMark.svelte";
  import CaretLeft from "phosphor-svelte/lib/CaretLeft";
  import Check from "phosphor-svelte/lib/Check";
  import UploadSimple from "phosphor-svelte/lib/UploadSimple";
  import Spinner from "./Spinner.svelte";

  let { onComplete }: { onComplete: (name: string) => void } = $props();

  const TOTAL_STEPS = 4;

  let step: number = $state(1);
  let name: string = $state("");
  let saving: boolean = $state(false);
  let pushStatus: string = $state("idle");
  let enablingPush: boolean = $state(false);
  let resume: LocalResumeAsset | null = $state(loadLocalTailorKit().resume);
  let resumeUploadInput: HTMLInputElement | null = $state(null);
  let resumeUploading: boolean = $state(false);
  let resumeError: string | null = $state(null);
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

  function goBack() {
    if (
      step <= 1
      || saving
      || enablingPush
      || resumeUploading
      || signingInWithApple
      || sendingEmailLogin
    ) return;
    step -= 1;
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

  async function handleResumeUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || resumeUploading) return;

    resumeUploading = true;
    resumeError = null;
    try {
      resume = await createLocalResumeAsset(file);
      updateLocalTailorKit({ resume });
    } catch (e) {
      resumeError = errorMessage(e, "Could not add that resume.");
    } finally {
      resumeUploading = false;
      if (input) input.value = "";
    }
  }

  function removeResume() {
    resume = null;
    resumeError = null;
    updateLocalTailorKit({ resume: null });
  }

  async function syncResumeAfterSignIn() {
    if (!resume) return;
    await api.resumeAssets.upload({
      fileName: resume.fileName,
      mimeType: resume.mimeType,
      size: resume.size,
      dataUrl: resume.dataUrl,
      extractedText: resume.textContent,
    });
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
      await syncResumeAfterSignIn().catch(() => undefined);
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
  <!-- Navigation and progress stay clear of the status bar / Dynamic Island. -->
  <div class="onboarding-progress">
    <div class="onboarding-progress-row">
      {#if step > 1}
        <button type="button" class="onboarding-back" aria-label="Back" onclick={goBack}>
          <CaretLeft size={22} weight="bold" />
        </button>
      {:else}
        <span class="onboarding-back-spacer" aria-hidden="true"></span>
      {/if}
      <div class="onboarding-progress-track" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
        {#each Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1) as s}
          <div class="onboarding-progress-segment" class:active={s <= step}></div>
        {/each}
      </div>
      <span class="onboarding-step-count">{step} of {TOTAL_STEPS}</span>
    </div>
  </div>

  <!-- Top-aligned scrolling keeps short and tall steps anchored consistently. -->
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
            Choose the roles you want. We&rsquo;ll alert you the moment we see a new posting.
          </p>
          <div class="onboarding-fields">
            <SearchProfileFields bind:profile section="roles" showAdvanced={false} showHeadings={false} />
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
          <div class="onboarding-fields onboarding-fields-after-title">
            <SearchProfileFields bind:profile section="locations" showAdvanced={false} showHeadings={false} />
          </div>

          {#if profileError}
            <div class="alert alert-error onboarding-alert" role="alert">
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
            Get an alert when a new role fits your search.
          </p>

          {#if pushStatus === "enabled"}
            <div class="onboarding-inline-success">
              <Check size={16} weight="bold" /> Notifications are on
            </div>
          {:else}
            <button
              class="btn-secondary full-width onboarding-notification-action"
              disabled={enablingPush}
              onclick={handleEnablePush}
            >
              {#if enablingPush}<Spinner />{/if}
              Enable notifications
            </button>
          {/if}

          {#if pushStatus === "denied"}
            <div class="alert alert-warn alert-compact onboarding-alert">
              Permission denied. Turn on notifications in {isNativeIos() ? "iOS Settings" : "your browser settings"}.
            </div>
          {/if}
          {#if pushStatus === "error"}
            <div class="alert alert-error alert-compact onboarding-alert" role="alert">
              Couldn&rsquo;t enable notifications. You can try again later in Settings.
            </div>
          {/if}

          <div class="onboarding-divider onboarding-section-divider">
            <div></div>
          </div>

          <div class="onboarding-resume-heading">
            <div>
              <div class="row-title">Add your resume <span class="label-opt">(optional)</span></div>
              <div class="helper-text">Use it to tailor applications to each role.</div>
            </div>
          </div>

          <input
            bind:this={resumeUploadInput}
            type="file"
            accept=".txt,.md,.markdown,.pdf,.rtf"
            class="visually-hidden-input"
            onchange={handleResumeUpload}
          />

          {#if resume}
            <div class="onboarding-resume-file">
              <div class="onboarding-resume-copy">
                <div class="onboarding-resume-name">{resume.fileName}</div>
                <div class="helper-text">{formatFileSize(resume.size)}</div>
              </div>
              <div class="onboarding-resume-actions">
                <button class="btn-secondary btn-mini" type="button" onclick={() => resumeUploadInput?.click()}>
                  Replace
                </button>
                <button class="onboarding-remove" type="button" onclick={removeResume}>Remove</button>
              </div>
            </div>
          {:else}
            <button
              class="onboarding-upload"
              type="button"
              disabled={resumeUploading}
              onclick={() => resumeUploadInput?.click()}
            >
              {#if resumeUploading}<Spinner />{:else}<UploadSimple size={17} />{/if}
              Upload resume
            </button>
          {/if}

          {#if resumeError}
            <div class="alert alert-error alert-compact onboarding-alert" role="alert">{resumeError}</div>
          {/if}

          <button class="btn-primary btn-accent full-width onboarding-step-cta" onclick={() => step = 4}>
            Continue
          </button>
        </div>

      {:else if step === 4}
        <div class="onboarding-step">
          <h2 class="h-display h-display-lg onboarding-title">Save your progress</h2>
          <p class="onboarding-copy">
            Guest mode still works, but you&rsquo;ll only be able to browse jobs. Sign in to save your progress.
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
            <div class="alert alert-error onboarding-alert" role="alert">
              {accountError}
            </div>
          {/if}

          {#if appleAvailable}
            <button
              class="btn-primary btn-apple onboarding-apple"
              disabled={signingInWithApple}
              onclick={handleAppleLogin}
            >
              {#if signingInWithApple}<Spinner />{/if}
              <AppleMark />
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
                class="btn-secondary full-width"
                disabled={sendingEmailLogin || !emailLogin.trim()}
                onclick={handleEmailLoginStart}
              >
                {#if sendingEmailLogin}<Spinner />{/if}
                Send link
              </button>
            </div>
          {/if}

          <button
            type="button"
            class="btn-primary btn-accent full-width onboarding-enter"
            disabled={saving}
            onclick={() => void finish()}
          >
            {#if saving}<Spinner />{/if}
            {emailLinkSent ? "Let’s go!" : "Let me in!"}
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
    padding: var(--space-2) var(--space-4) 0;
    background: var(--color-bg);
  }

  .onboarding-progress-row {
    min-height: var(--tap-min);
    display: grid;
    grid-template-columns: var(--tap-min) minmax(0, 1fr) var(--tap-min);
    align-items: center;
    gap: var(--space-3);
  }

  .onboarding-back,
  .onboarding-back-spacer {
    width: var(--tap-min);
    height: var(--tap-min);
  }

  .onboarding-back {
    margin-left: -4px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink);
    cursor: pointer;
  }

  .onboarding-back:hover { background: var(--color-bg-elev); }

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

  .onboarding-step-count {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    line-height: 1;
    text-align: right;
    white-space: nowrap;
  }

  .onboarding-scroll {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: var(--space-5) var(--space-8) var(--space-10);
  }

  .onboarding-content {
    width: 100%;
    max-width: 360px;
    margin-block: auto;
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

  .onboarding-field-label {
    display: block;
    margin-bottom: var(--space-2);
  }

  .onboarding-fields,
  .onboarding-email-form {
    margin-bottom: var(--space-6);
  }

  .onboarding-fields-after-title {
    margin-top: var(--space-6);
  }

  .onboarding-alert {
    margin-bottom: var(--space-4);
    font-size: var(--fs-xs);
  }

  .onboarding-notification-action {
    margin-bottom: var(--space-3);
  }

  .onboarding-inline-success {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-good);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  .onboarding-section-divider {
    margin: var(--space-5) 0;
  }

  .onboarding-resume-heading {
    margin-bottom: var(--space-3);
  }

  .onboarding-upload,
  .onboarding-resume-file {
    width: 100%;
    min-height: 52px;
    margin-bottom: var(--space-4);
    border: 1px dashed var(--color-line-2);
    border-radius: var(--radius-md);
    background: color-mix(in oklch, var(--color-bg-elev) 55%, transparent);
  }

  .onboarding-upload {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .onboarding-upload:disabled { opacity: 0.55; cursor: default; }

  .onboarding-resume-file {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    border-style: solid;
  }

  .onboarding-resume-copy { min-width: 0; }
  .onboarding-resume-name {
    overflow: hidden;
    color: var(--color-ink);
    font-size: var(--fs-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .onboarding-resume-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .onboarding-remove {
    min-height: 34px;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    cursor: pointer;
  }

  .onboarding-step-cta {
    margin-top: var(--space-2);
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

  .onboarding-enter {
    margin-top: var(--space-3);
  }

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
