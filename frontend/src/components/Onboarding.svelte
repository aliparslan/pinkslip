<script lang="ts">
  import { api, type MatchPreviewJob } from "../lib/api";
  import { isNativeIosAuthAvailable, signInWithAppleNative } from "../lib/native-auth";
  import { enableNativePush } from "../lib/native-push";
  import { syncSessionAccess } from "../lib/session-access";
  import {
    DEFAULT_SEARCH_PROFILE,
    ONBOARDING_VERSION,
    normalizeSearchProfile,
    type SearchProfile,
  } from "../../../shared/search-profile";
  import { normalizeJobScore } from "../lib/scoring";
  import SearchProfileFields from "./SearchProfileFields.svelte";
  import Check from "phosphor-svelte/lib/Check";

  let { onComplete }: { onComplete: (name: string) => void } = $props();

  const TOTAL_STEPS = 7;

  let step: number = $state(1);
  let name: string = $state("");
  let saving: boolean = $state(false);
  let pushStatus: string = $state("idle");
  let enablingPush: boolean = $state(false);
  let profile: SearchProfile = $state(normalizeSearchProfile(DEFAULT_SEARCH_PROFILE));
  let profileError: string | null = $state(null);
  let previewJobs: MatchPreviewJob[] = $state([]);
  let previewLoading: boolean = $state(false);

  // Final step: optional account creation. Guests can always skip and keep
  // everything on-device — signing in folds the guest data into the account.
  const appleAvailable = isNativeIosAuthAvailable();
  let emailLogin: string = $state("");
  let signingInWithApple: boolean = $state(false);
  let sendingEmailLogin: boolean = $state(false);
  let emailLinkSent: boolean = $state(false);
  let accountError: string | null = $state(null);
  let onboardingStartRecorded = false;

  $effect(() => {
    if (onboardingStartRecorded) return;
    onboardingStartRecorded = true;
    void api.interactions.event({
      event_name: "onboarding_started",
      entity_type: "onboarding",
      properties: { onboarding_version: ONBOARDING_VERSION },
    }).catch(() => undefined);
  });

  async function handleNameSubmit() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    saving = true;
    try {
      await api.me.update({ name: trimmed });
      saving = false;
      step = 2;
    } catch {
      saving = false;
    }
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
        search_profile: profile,
        notify_threshold: profile.match_threshold,
      });
      profile = normalizeSearchProfile(saved.search_profile);
      previewLoading = true;
      step = 5;
      previewJobs = await api.preferences.preview().then((result) => result.jobs);
    } catch (e: any) {
      profileError = e?.message ?? "Could not save your search profile.";
    } finally {
      saving = false;
      previewLoading = false;
    }
  }

  async function acceptPreview() {
    if (saving) return;
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
      step = 6;
    } catch (e: any) {
      profileError = e?.message ?? "Could not finish your search profile.";
    } finally {
      saving = false;
    }
  }

  async function handleAppleLogin() {
    if (signingInWithApple) return;
    signingInWithApple = true;
    accountError = null;
    try {
      const credential = await signInWithAppleNative();
      const accountState = await api.auth.signInWithApple(credential);
      syncSessionAccess(accountState);
      // Signed in — the guest data we just gathered now lives on the account.
      finish();
    } catch (e: any) {
      if (e?.code === "CANCELED") return; // user dismissed the sheet — not an error
      accountError = e?.message ?? "Could not complete Sign in with Apple.";
    } finally {
      signingInWithApple = false;
    }
  }

  async function handleEmailLoginStart() {
    if (!emailLogin.trim() || sendingEmailLogin) return;
    sendingEmailLogin = true;
    accountError = null;
    try {
      await api.auth.startEmailLogin(emailLogin.trim());
      emailLinkSent = true;
    } catch (e: any) {
      accountError = e?.message ?? "Could not send the sign-in link.";
    } finally {
      sendingEmailLogin = false;
    }
  }

  function finish() {
    onComplete(name.trim());
  }
</script>

<div style="position: fixed; inset: 0; z-index: 30; background: var(--color-bg); display: flex; flex-direction: column; padding-top: var(--safe-top); padding-bottom: var(--safe-bottom); overscroll-behavior: contain;">
  <!-- Progress bars pinned to top (clear of the status bar / Dynamic Island) -->
  <div style="padding: 20px 24px 4px; flex-shrink: 0;">
    <div style="display: flex; gap: 6px;">
      {#each Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1) as s}
        <div style="height: 3px; flex: 1; border-radius: 999px; background: {s <= step ? 'var(--color-accent)' : 'var(--color-line)'}; transition: background 0.3s;"></div>
      {/each}
    </div>
  </div>

  <!-- Content: scroll region; margin auto centers it but stays scroll-safe when tall -->
  <div style="flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; align-items: center; padding: 24px 32px 40px;">
    <div style="width: 100%; max-width: 360px; margin: auto 0;">

      {#if step === 1}
        <div style="animation: fade-in 0.3s;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <svg width="32" height="38" viewBox="0 0 22 26" fill="none" style="transform: rotate(-8deg); flex-shrink: 0;">
              <rect x="1" y="1" width="20" height="24" rx="3" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="0.5"/>
              <rect x="5" y="6" width="12" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
              <rect x="5" y="10" width="9" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
              <rect x="5" y="14" width="11" height="1.5" rx="0.75" fill="var(--color-accent-ink)" opacity="0.5"/>
            </svg>
            <span class="h-display" style="font-size: 30px; line-height: 1;">
              <span style="color: var(--color-accent);">pink</span>slip
            </span>
          </div>
          <h2 class="h-display" style="font-size: 26px; margin-bottom: 8px;">Beat the crowd</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.55; margin-bottom: 32px;">
            Get alerted the moment roles drop &mdash; before everyone else applies. We scan company job boards every 15 minutes so you never miss a match.
          </p>
          <label for="onboarding-name" class="field-label" style="margin-bottom: 8px;">
            Your name
          </label>
          <input
            id="onboarding-name"
            class="input-field"
            type="text"
            placeholder="e.g. Alex"
            bind:value={name}
            onkeydown={(e) => e.key === "Enter" && handleNameSubmit()}
          />
          <button
            class="btn-primary btn-accent"
            style="width: 100%; margin-top: 16px;"
            disabled={!name.trim() || saving}
            onclick={handleNameSubmit}
          >
            {saving ? "..." : "Continue"}
          </button>
        </div>

      {:else if step === 2}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">What are you targeting?</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            Pick one or several role families. This directly controls which jobs rise in your feed.
          </p>
          <div style="margin-bottom: 24px;">
            <SearchProfileFields bind:profile section="roles" showAdvanced={false} />
          </div>
          <button
            class="btn-primary btn-accent"
            style="width: 100%;"
            disabled={profile.roles.length === 0}
            onclick={() => step = 3}
          >
            Continue
          </button>
        </div>

      {:else if step === 3}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">What level fits?</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            Add your real experience, then choose the levels you want us to include.
          </p>
          <div style="margin-bottom: 24px;">
            <SearchProfileFields bind:profile section="experience" showAdvanced={false} />
          </div>
          <button class="btn-primary btn-accent" style="width: 100%;" onclick={() => step = 4}>
            Continue
          </button>
        </div>

      {:else if step === 4}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">Where can you work?</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            Choose work modes, preferred metros, authorization, and whether relocation is on the table.
          </p>
          <div style="margin-bottom: 24px;">
            <SearchProfileFields bind:profile section="locations" showAdvanced={false} />
          </div>

          {#if profileError}
            <div style="padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px; line-height: 1.4;">
              {profileError}
            </div>
          {/if}

          <button
            class="btn-primary btn-accent"
            style="width: 100%;"
            disabled={saving || profile.work_modes.length === 0}
            onclick={handleProfileSubmit}
          >
            {saving ? "Matching..." : "Show my matches"}
          </button>
        </div>

      {:else if step === 5}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">This is your starting line</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 20px;">
            These are real jobs in pinkslip right now. The labels explain why each one made the cut.
          </p>

          {#if previewLoading}
            <div class="preview-empty">Classifying and matching current jobs...</div>
          {:else if previewJobs.length === 0}
            <div class="preview-empty">
              No confident matches yet. Go back and broaden a role, level, metro, or work mode.
            </div>
          {:else}
            <div class="preview-list">
              {#each previewJobs as job}
                <div class="preview-job">
                  <div class="preview-job-top">
                    <span>{job.company_name}</span>
                    <strong>{normalizeJobScore(job.score)}</strong>
                  </div>
                  <div class="preview-job-title">{job.title}</div>
                  <div class="preview-job-location">{job.location || "Location not specified"}</div>
                  <div class="preview-reasons">
                    {#each job.match_reasons.slice(0, 3) as reason}
                      <span>{reason}</span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          {#if profileError}
            <div style="padding: 10px 12px; border-radius: 8px; margin: 16px 0; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px;">
              {profileError}
            </div>
          {/if}

          <div style="display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; margin-top: 20px;">
            <button class="btn-secondary" style="padding: 0 18px;" onclick={() => step = 2}>Adjust</button>
            <button class="btn-primary btn-accent" disabled={saving || previewJobs.length === 0} onclick={acceptPreview}>
              {saving ? "Saving..." : "Use this feed"}
            </button>
          </div>
        </div>

      {:else if step === 6}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">Stay in the loop</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            Turn on notifications so <span class="brand-word"><span class="brand-word-pink">pink</span>slip</span> can alert you the moment a high-scoring role drops.
          </p>

          <!-- Push notifications -->
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden; margin-bottom: 24px;">
            <div style="padding: 16px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 14px; font-weight: 600;">Push notifications</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">Get alerted for high-scoring jobs</div>
              </div>
              {#if pushStatus === "enabled"}
                <span style="font-family: var(--font-mono); font-size: 12px; color: var(--color-good); font-weight: 500;">Enabled</span>
              {:else}
                <button
                  class="btn-secondary"
                  style="height: 34px; padding: 0 16px; font-size: 13px;"
                  disabled={enablingPush}
                  onclick={handleEnablePush}
                >
                  {enablingPush ? "..." : "Enable"}
                </button>
              {/if}
            </div>
            {#if pushStatus === "denied"}
              <div style="padding: 0 16px 14px;">
                <div style="padding: 8px 12px; border-radius: 8px; background: color-mix(in oklch, var(--color-warn) 14%, transparent); color: var(--color-warn); font-size: 12px; line-height: 1.4;">
                  Permission denied. Turn on notifications for pinkslip in the iOS Settings app.
                </div>
              </div>
            {/if}
            {#if pushStatus === "error"}
              <div style="padding: 0 16px 14px;">
                <div style="padding: 8px 12px; border-radius: 8px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px; line-height: 1.4;">
                  Something went wrong. You can set up notifications later in Settings.
                </div>
              </div>
            {/if}
          </div>

          <button class="btn-primary btn-accent" style="width: 100%;" onclick={() => step = 7}>
            Continue
          </button>
        </div>

      {:else if step === 7}
        <div style="animation: fade-in 0.3s;">
          <h2 class="h-display" style="font-size: 28px; margin-bottom: 8px;">Save your progress</h2>
          <p style="font-size: 14px; color: var(--color-ink-2); line-height: 1.5; margin-bottom: 24px;">
            Create an account so your jobs, profile, preferences, and resume follow you across devices. Totally optional &mdash; you can keep everything on this device as a guest.
          </p>

          {#if accountError}
            <div style="padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px; line-height: 1.4;">
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
              {signingInWithApple ? "Connecting..." : "Continue with Apple"}
            </button>

            <div style="display: flex; align-items: center; gap: 12px; margin: 4px 0 16px;">
              <div style="height: 0.5px; flex: 1; background: var(--color-line);"></div>
              <span style="font-size: 11px; color: var(--color-ink-3); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em;">or</span>
              <div style="height: 0.5px; flex: 1; background: var(--color-line);"></div>
            </div>
          {/if}

          {#if emailLinkSent}
            <div style="padding: 16px; border-radius: 14px; background: var(--color-bg-sunken); border: 1px solid var(--color-line); margin-bottom: 24px;">
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
            <div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-bottom: 24px;">
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
                class="btn-secondary"
                style="padding: 0 16px;"
                disabled={sendingEmailLogin || !emailLogin.trim()}
                onclick={handleEmailLoginStart}
              >
                {sendingEmailLogin ? "..." : "Send link"}
              </button>
            </div>
          {/if}

          <button class="btn-secondary" style="width: 100%;" onclick={finish}>
            {emailLinkSent ? "Continue to pinkslip" : "Maybe later — keep using as guest"}
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>

<style>
  .preview-list { display: flex; flex-direction: column; gap: 9px; }
  .preview-job { padding: 13px 14px; border: 1px solid var(--color-line-2); border-radius: 13px; background: var(--color-bg-sunken); }
  .preview-job-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--color-ink-3); font-size: 11px; }
  .preview-job-top strong { color: var(--color-accent); font-family: var(--font-mono); }
  .preview-job-title { margin-top: 3px; color: var(--color-ink); font-size: 14px; font-weight: 650; line-height: 1.3; }
  .preview-job-location { margin-top: 3px; color: var(--color-ink-3); font-size: 11px; }
  .preview-reasons { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
  .preview-reasons span { padding: 4px 7px; border-radius: 999px; background: var(--color-accent-soft); color: var(--color-accent-soft-ink); font-size: 9px; font-weight: 650; }
  .preview-empty { padding: 24px 18px; border: 1px dashed var(--color-line-3); border-radius: 14px; color: var(--color-ink-3); font-size: 12px; line-height: 1.5; text-align: center; }
</style>
