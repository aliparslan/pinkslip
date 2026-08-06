<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { enableNativePush, getNativePushStatus, isNativeIos } from "../lib/native-push";
  import {
    DEFAULT_SEARCH_PROFILE,
    ONBOARDING_VERSION,
    normalizeSearchProfile,
    type SearchProfile,
  } from "../../../../shared/search-profile";
  import SearchProfileFields from "./SearchProfileFields.svelte";
  import BrandMark from "./BrandMark.svelte";
  import CaretLeft from "phosphor-svelte/lib/CaretLeft";
  import Check from "phosphor-svelte/lib/Check";
  import Bell from "phosphor-svelte/lib/Bell";
  import Spinner from "./Spinner.svelte";
  import { invalidateFeedForPreferences } from "../lib/feed-store.svelte";

  let {
    initialProfile,
    onComplete,
  }: {
    initialProfile: SearchProfile;
    onComplete: (name: string) => void;
  } = $props();

  const TOTAL_STEPS = 3;

  let step = $state(1);
  let saving = $state(false);
  let enablingPush = $state(false);
  let pushStatus: "idle" | "enabled" | "denied" | "error" = $state("idle");
  let profile: SearchProfile = $state(normalizeSearchProfile(DEFAULT_SEARCH_PROFILE));
  let error: string | null = $state(null);
  let onboardingStartRecorded = false;
  let profileInitialized = false;
  let scrollEl: HTMLDivElement | null = $state(null);

  $effect(() => {
    if (profileInitialized) return;
    profile = normalizeSearchProfile(initialProfile);
    profileInitialized = true;
  });

  onMount(() => {
    let active = true;
    void getNativePushStatus()
      .then((status) => {
        if (active && status === "enabled") {
          pushStatus = "enabled";
          profile = normalizeSearchProfile({ ...profile, notifications_enabled: true });
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  });

  $effect(() => {
    step;
    if (scrollEl) scrollEl.scrollTop = 0;
    if (isNativeIos()) {
      window.requestAnimationFrame(() => {
        scrollEl?.querySelector<HTMLElement>("h1")?.focus();
      });
    }
  });

  function focusFirst(selector: string) {
    window.requestAnimationFrame(() => {
      scrollEl?.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  async function beginOnboarding() {
    if (isNativeIos() && profile.roles.length === 0) {
      error = "Choose at least one role to continue.";
      focusFirst(".role-card");
      return;
    }
    error = null;
    if (!onboardingStartRecorded) {
      onboardingStartRecorded = true;
      void api.interactions.event({
        event_name: "onboarding_started",
        entity_type: "onboarding",
        properties: { onboarding_version: ONBOARDING_VERSION },
      }).catch(() => undefined);
    }
    step = 2;
  }

  function goBack() {
    if (step <= 1 || saving || enablingPush) return;
    error = null;
    step -= 1;
  }

  async function saveSearchProfile() {
    if (saving || (!isNativeIos() && (profile.roles.length === 0 || profile.work_modes.length === 0))) return;
    if (isNativeIos() && profile.roles.length === 0) {
      error = "Choose at least one role to continue.";
      focusFirst(".role-card");
      return;
    }
    if (isNativeIos() && profile.work_modes.length === 0) {
      error = "Choose at least one work mode to continue.";
      focusFirst(".work-mode-trigger");
      return;
    }
    saving = true;
    error = null;
    try {
      const saved = await api.preferences.update({ search_profile: profile });
      profile = normalizeSearchProfile(saved.search_profile);
      step = 3;
    } catch (caught) {
      error = errorMessage(caught, "Could not save your search. Check your connection and try again.");
    } finally {
      saving = false;
    }
  }

  async function handleEnablePush() {
    if (enablingPush) return;
    enablingPush = true;
    error = null;
    try {
      const enabled = (await enableNativePush()) === "enabled";
      pushStatus = enabled ? "enabled" : "denied";
      if (enabled) {
        await api.push.updateSettings({ enabled: true, push_enabled: true });
        profile = normalizeSearchProfile({ ...profile, notifications_enabled: true });
      }
    } catch {
      pushStatus = "error";
    } finally {
      enablingPush = false;
    }
  }

  async function finish() {
    if (saving) return;
    saving = true;
    error = null;
    try {
      const saved = await api.preferences.update({
        search_profile: {
          ...profile,
          onboarding_version: ONBOARDING_VERSION,
          onboarding_completed_at: new Date().toISOString(),
        },
      });
      profile = normalizeSearchProfile(saved.search_profile);
      invalidateFeedForPreferences(profile);
      void api.interactions.event({
        event_name: "onboarding_completed",
        entity_type: "onboarding",
        properties: {
          onboarding_version: ONBOARDING_VERSION,
          notifications_enabled: profile.notifications_enabled,
        },
      }).catch(() => undefined);
      onComplete("");
    } catch (caught) {
      error = errorMessage(caught, "Could not finish setup. Check your connection and try again.");
    } finally {
      saving = false;
    }
  }
</script>

<div class="onboarding">
  <header class="onboarding-header">
    <div class="onboarding-header-row">
      <button
        type="button"
        class="onboarding-back"
        class:hidden={step === 1}
        aria-label="Back"
        tabindex={step === 1 ? -1 : 0}
        onclick={goBack}
      >
        <CaretLeft size={21} weight="bold" />
      </button>
      <div class="onboarding-brand" aria-label="pinkslip">
        <BrandMark size={28} />
        <span><strong>pink</strong>slip</span>
      </div>
      <span aria-hidden="true"></span>
    </div>
    <div
      class="onboarding-progress-track"
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin="1"
      aria-valuemax={TOTAL_STEPS}
      aria-valuenow={step}
      aria-valuetext={`Step ${step} of ${TOTAL_STEPS}`}
    >
      {#each Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1) as item}
        <span class:active={item <= step}></span>
      {/each}
    </div>
  </header>

  <div bind:this={scrollEl} class="onboarding-scroll">
    <main class="onboarding-content">
      {#if step === 1}
        <section class="onboarding-step">
          <h1 tabindex="-1">Beat the crowd</h1>
          <p class="onboarding-copy">
            Choose the roles you want. We&rsquo;ll alert you the moment we see a new posting.
          </p>
          <div class="onboarding-fields">
            <SearchProfileFields bind:profile section="roles" showAdvanced={false} showHeadings={false} />
          </div>
          {#if error && isNativeIos()}
            <div class="alert alert-error onboarding-alert" role="alert">{error}</div>
          {/if}
        </section>

      {:else if step === 2}
        <section class="onboarding-step">
          <h1 tabindex="-1">Set your work preferences</h1>
          <div class="onboarding-fields onboarding-fields-after-title">
            <SearchProfileFields bind:profile section="locations" showAdvanced={false} showHeadings={false} />
          </div>
          {#if error}
            <div class="alert alert-error onboarding-alert" role="alert">{error}</div>
          {/if}
        </section>

      {:else}
        <section class="onboarding-step">
          <h1 tabindex="-1">Stay in the loop</h1>
          <p class="onboarding-copy">
            Get an alert when a new role fits your search.
          </p>

          {#if pushStatus === "enabled"}
            <div class="onboarding-status success">
              <Check size={17} weight="bold" /> Alerts are on for this device
            </div>
          {:else}
            <button
              type="button"
              class="btn-secondary full-width tall-control onboarding-alert-action"
              disabled={enablingPush}
              onclick={handleEnablePush}
            >
              {#if enablingPush}<Spinner />{:else}<Bell size={17} />{/if}
              Enable notifications
            </button>
            <p class="onboarding-footnote">Alerts can be turned on later.</p>
          {/if}

          {#if pushStatus === "denied"}
            <div class="alert alert-warn onboarding-alert">
              Permission is off. You can enable alerts later in {isNativeIos() ? "iOS Settings" : "your browser settings"}.
            </div>
          {:else if pushStatus === "error"}
            <div class="alert alert-error onboarding-alert" role="alert">
              Unable to turn on alerts. Check your connection and try again.
            </div>
          {:else if error}
            <div class="alert alert-error onboarding-alert" role="alert">{error}</div>
          {/if}

        </section>
      {/if}
    </main>
  </div>

  <footer class="onboarding-footer">
    <div class="onboarding-footer-inner">
      {#if step === 1}
        <button
          type="button"
          class="btn-primary btn-accent full-width onboarding-cta"
          disabled={!isNativeIos() && profile.roles.length === 0}
          onclick={beginOnboarding}
        >Continue</button>
      {:else if step === 2}
        <button
          type="button"
          class="btn-primary btn-accent full-width onboarding-cta"
          disabled={saving || (!isNativeIos() && profile.work_modes.length === 0)}
          onclick={saveSearchProfile}
        >
          {#if saving}<Spinner />{/if}
          Continue
        </button>
      {:else}
        <button
          type="button"
          class="btn-primary btn-accent full-width onboarding-cta"
          disabled={saving || enablingPush}
          onclick={finish}
        >
          {#if saving}<Spinner />{/if}
          Start using pinkslip
        </button>
      {/if}
    </div>
  </footer>
</div>

<style>
  .onboarding {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    display: flex;
    flex-direction: column;
    padding: var(--safe-top) 0 0;
    background: var(--color-bg);
    overscroll-behavior: contain;
  }

  .onboarding-header {
    flex: none;
    padding: 6px var(--space-4) 12px;
    background: var(--color-bg);
  }

  .onboarding-header-row {
    min-height: var(--screen-nav-height);
    display: grid;
    grid-template-columns: var(--tap-min) minmax(0, 1fr) var(--tap-min);
    align-items: center;
    gap: var(--space-3);
  }

  .onboarding-back {
    width: var(--tap-min);
    height: var(--tap-min);
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink);
    cursor: pointer;
  }

  .onboarding-back.hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .onboarding-back:hover { background: var(--color-bg-sunken); }

  .onboarding-progress-track {
    width: min(100%, 400px);
    margin: 0 auto;
    display: flex;
    gap: var(--space-2);
  }

  .onboarding-progress-track span {
    height: 3px;
    flex: 1;
    border-radius: var(--radius-full);
    background: var(--color-line);
    transition: background var(--duration-fast) var(--ease-standard);
  }

  .onboarding-progress-track span.active { background: var(--color-accent); }

  .onboarding-scroll {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    padding: var(--space-6) var(--space-5);
  }

  .onboarding-content {
    width: 100%;
    max-width: 400px;
    margin-block: 0;
  }

  .onboarding-step {
    animation: onboarding-enter var(--duration-standard) var(--ease-standard) both;
  }

  .onboarding-brand {
    display: flex;
    align-items: center;
    justify-self: center;
    gap: 8px;
    color: var(--color-ink);
  }

  .onboarding-brand span {
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.025em;
  }

  .onboarding-brand strong {
    color: var(--color-accent);
    font-weight: 600;
  }

  .onboarding h1 {
    max-width: 18ch;
    margin: 0 0 var(--space-3);
    color: var(--color-ink);
    font-family: var(--font-pixel);
    font-size: var(--fs-4xl);
    font-weight: 400;
    letter-spacing: 0;
    line-height: 1.15;
  }

  .onboarding-copy {
    max-width: 42ch;
    margin: 0 0 var(--space-6);
    color: var(--color-ink-2);
    font-size: var(--fs-md);
    line-height: 1.5;
  }

  .onboarding-fields { margin-bottom: 0; }
  .onboarding-fields-after-title { margin-top: var(--space-6); }
  .onboarding-alert { margin: var(--space-3) 0 0; }
  .onboarding-footer {
    flex: none;
    padding: 12px var(--space-5) calc(12px + var(--safe-bottom));
    background: color-mix(in oklch, var(--color-bg) 94%, transparent);
    box-shadow: 0 -1px 0 var(--color-line);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .onboarding-footer-inner {
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
  }

  .onboarding-cta { margin: 0; }

  .onboarding-alert-action { margin-top: var(--space-2); }

  .onboarding-status {
    min-height: 48px;
    padding: 0 var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    border: 1px solid var(--color-message-border);
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
    font-weight: 500;
  }

  .onboarding-status.success {
    background: var(--color-good-soft);
    color: var(--color-good);
  }

  .onboarding-footnote {
    margin: 8px 0 0;
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    line-height: 1.4;
    text-align: center;
  }

  @keyframes onboarding-enter {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (min-width: 720px) {
    .onboarding-scroll { padding-block: var(--space-8); }
  }
</style>
