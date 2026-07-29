<script lang="ts">
  import { api } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { enableNativePush, isNativeIos } from "../lib/native-push";
  import {
    DEFAULT_SEARCH_PROFILE,
    ONBOARDING_VERSION,
    normalizeSearchProfile,
    type SearchProfile,
  } from "../../../shared/search-profile";
  import SearchProfileFields from "./SearchProfileFields.svelte";
  import BrandMark from "./BrandMark.svelte";
  import CaretLeft from "phosphor-svelte/lib/CaretLeft";
  import Check from "phosphor-svelte/lib/Check";
  import Bell from "phosphor-svelte/lib/Bell";
  import Spinner from "./Spinner.svelte";
  import { syncFeedPreferences } from "../lib/feed-store.svelte";

  let { onComplete }: { onComplete: (name: string) => void } = $props();

  const TOTAL_STEPS = 3;

  let step = $state(1);
  let saving = $state(false);
  let enablingPush = $state(false);
  let pushStatus: "idle" | "enabled" | "denied" | "error" = $state("idle");
  let profile: SearchProfile = $state(normalizeSearchProfile(DEFAULT_SEARCH_PROFILE));
  let error: string | null = $state(null);
  let onboardingStartRecorded = false;
  let scrollEl: HTMLDivElement | null = $state(null);

  $effect(() => {
    step;
    if (scrollEl) scrollEl.scrollTop = 0;
  });

  async function beginOnboarding() {
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
    if (profile.roles.length === 0 || profile.work_modes.length === 0 || saving) return;
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
      syncFeedPreferences(profile, true);
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
  <header class="onboarding-progress">
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
    <div class="onboarding-progress-track" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
      {#each Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1) as item}
        <span class:active={item <= step}></span>
      {/each}
    </div>
    <span class="onboarding-step-count">{step} / {TOTAL_STEPS}</span>
  </header>

  <div bind:this={scrollEl} class="onboarding-scroll">
    <main class="onboarding-content">
      {#if step === 1}
        <section class="onboarding-step">
          <div class="onboarding-brand">
            <BrandMark size={34} />
            <span><strong>pink</strong>slip</span>
          </div>
          <h1>Beat the crowd</h1>
          <p class="onboarding-copy">
            Choose the roles you want. We&rsquo;ll alert you the moment we see a new posting.
          </p>
          <div class="onboarding-fields">
            <SearchProfileFields bind:profile section="roles" showAdvanced={false} showHeadings={false} />
          </div>
          <button
            type="button"
            class="btn-primary btn-accent full-width onboarding-cta"
            disabled={profile.roles.length === 0}
            onclick={beginOnboarding}
          >
            Continue
          </button>
        </section>

      {:else if step === 2}
        <section class="onboarding-step">
          <h1>Where can you work?</h1>
          <div class="onboarding-fields onboarding-fields-after-title">
            <SearchProfileFields bind:profile section="locations" showAdvanced={false} showHeadings={false} />
          </div>
          {#if error}
            <div class="alert alert-error onboarding-alert" role="alert">{error}</div>
          {/if}
          <button
            type="button"
            class="btn-primary btn-accent full-width onboarding-cta"
            disabled={saving || profile.work_modes.length === 0}
            onclick={saveSearchProfile}
          >
            {#if saving}<Spinner />{/if}
            Continue
          </button>
        </section>

      {:else}
        <section class="onboarding-step">
          <div class="onboarding-notification-mark" class:enabled={pushStatus === "enabled"}>
            {#if pushStatus === "enabled"}
              <Check size={25} weight="bold" />
            {:else}
              <Bell size={25} weight="fill" />
            {/if}
          </div>
          <h1>Stay in the loop</h1>
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
          {/if}

          {#if pushStatus === "denied"}
            <div class="alert alert-warn onboarding-alert">
              Permission is off. You can enable alerts later in {isNativeIos() ? "iOS Settings" : "your browser settings"}.
            </div>
          {:else if pushStatus === "error"}
            <div class="alert alert-error onboarding-alert" role="alert">
              Alerts could not be enabled right now. Your search is already saved.
            </div>
          {:else if error}
            <div class="alert alert-error onboarding-alert" role="alert">{error}</div>
          {/if}

          <button
            type="button"
            class="btn-primary btn-accent full-width onboarding-cta"
            disabled={saving || enablingPush}
            onclick={finish}
          >
            {#if saving}<Spinner />{/if}
            Start using pinkslip
          </button>
          {#if pushStatus !== "enabled"}
            <p class="onboarding-footnote">You can turn alerts on later from You → Job alerts.</p>
          {/if}
        </section>
      {/if}
    </main>
  </div>
</div>

<style>
  .onboarding {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    display: flex;
    flex-direction: column;
    padding: var(--safe-top) 0 var(--safe-bottom);
    background: var(--color-bg);
    overscroll-behavior: contain;
  }

  .onboarding-progress {
    min-height: var(--screen-nav-height);
    padding: 0 var(--space-4);
    display: grid;
    grid-template-columns: var(--tap-min) minmax(0, 1fr) var(--tap-min);
    align-items: center;
    gap: var(--space-3);
    background: var(--color-bg);
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

  .onboarding-step-count {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    line-height: 1;
    text-align: right;
  }

  .onboarding-scroll {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    padding: var(--space-5) var(--space-5) var(--space-10);
  }

  .onboarding-content {
    width: 100%;
    max-width: 400px;
    margin-block: auto;
  }

  .onboarding-step {
    animation: onboarding-enter var(--duration-standard) var(--ease-standard) both;
  }

  .onboarding-brand {
    margin-bottom: var(--space-8);
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--color-ink);
  }

  .onboarding-brand span {
    font-size: var(--fs-xl);
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
    font-size: var(--fs-4xl);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.08;
  }

  .onboarding-copy {
    max-width: 42ch;
    margin: 0 0 var(--space-6);
    color: var(--color-ink-2);
    font-size: var(--fs-md);
    line-height: 1.5;
  }

  .onboarding-fields { margin-bottom: var(--space-6); }
  .onboarding-fields-after-title { margin-top: var(--space-6); }
  .onboarding-alert { margin: var(--space-3) 0 0; }
  .onboarding-cta { margin-top: var(--space-5); }

  .onboarding-notification-mark {
    width: 54px;
    height: 54px;
    margin-bottom: var(--space-6);
    display: grid;
    place-items: center;
    border-radius: var(--radius-lg);
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-ink);
  }

  .onboarding-notification-mark.enabled {
    background: var(--color-good-soft);
    color: var(--color-good);
  }

  .onboarding-alert-action { margin-top: var(--space-2); }

  .onboarding-status {
    min-height: 48px;
    padding: 0 var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    font-size: var(--fs-sm);
    font-weight: 500;
  }

  .onboarding-status.success {
    border-color: color-mix(in oklch, var(--color-good) 28%, var(--color-line));
    background: var(--color-good-soft);
    color: var(--color-good);
  }

  .onboarding-footnote {
    margin: var(--space-3) 0 0;
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
    .onboarding-scroll { padding-top: var(--space-8); }
  }
</style>
