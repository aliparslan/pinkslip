<script lang="ts">
  import { onMount } from "svelte";
  import type { Component } from "svelte";
  import { api, type AccountInfo, type AppFeatures } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { getNativePushStatus, initNativePush } from "../lib/native-push";
  import { sessionAccess, syncSessionAccess } from "../lib/session-access";
  import { themeMode, type ThemeMode } from "../lib/theme";
  import { loadLocalTailorKit } from "../lib/local-tailor";
  import { invalidateFeedForPreferences } from "../lib/feed-store.svelte";
  import {
    DEFAULT_SEARCH_PROFILE,
    LOCATION_OPTIONS,
    normalizeSearchProfile,
    type SearchProfileV1,
  } from "../../../../shared/search-profile";
  import { currentRoute, navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import ScreenNav from "../components/ScreenNav.svelte";
  import AccountSection from "./profile/AccountSection.svelte";
  import JobsSection from "./profile/JobsSection.svelte";
  import TailorSection from "./profile/TailorSection.svelte";
  import NotifySection from "./profile/NotifySection.svelte";
  import Bell from "phosphor-svelte/lib/Bell";
  import Buildings from "phosphor-svelte/lib/Buildings";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import ChatCircleDots from "phosphor-svelte/lib/ChatCircleDots";
  import FileText from "phosphor-svelte/lib/FileText";
  import MagicWand from "phosphor-svelte/lib/MagicWand";
  import Notebook from "phosphor-svelte/lib/Notebook";
  import PaintBrush from "phosphor-svelte/lib/PaintBrush";
  import SlidersHorizontal from "phosphor-svelte/lib/SlidersHorizontal";
  import Spinner from "../components/Spinner.svelte";
  import SaveStatus from "../components/SaveStatus.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import { SavePresentation } from "../lib/task-presentation.svelte";
  import { registerAutosaveFlush } from "../lib/autosave-lifecycle";
  import UserCircle from "phosphor-svelte/lib/UserCircle";
  import Wrench from "phosphor-svelte/lib/Wrench";
  import { isIosApp } from "../lib/platform";

  type YouDestination = "preferences" | "alerts" | "tailoring" | "account" | "feedback";
  type PhosphorIcon = Component<{ size?: number | string }>;

  let { routeOverride }: { routeOverride?: string } = $props();

  const destinationTitles: Record<YouDestination, string> = {
    preferences: "Job preferences",
    alerts: "Job alerts",
    tailoring: "Tailoring",
    account: "Account",
    feedback: "Send feedback",
  };
  const destinationIds = new Set<YouDestination>(Object.keys(destinationTitles) as YouDestination[]);

  let route = $derived(routeOverride ?? $currentRoute);
  let destination = $derived.by<YouDestination | null>(() => {
    if (!route.startsWith("/you/")) return null;
    const value = route.slice("/you/".length) as YouDestination;
    return destinationIds.has(value) ? value : null;
  });

  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  const savePresentation = new SavePresentation();

  let displayName: string = $state($sessionAccess.user?.name ?? "");
  let savedDisplayName: string = $state($sessionAccess.user?.name ?? "");
  let sessionState = $state<"anonymous" | "guest" | "authenticated">($sessionAccess.state);
  let account = $state<AccountInfo | null>($sessionAccess.account);
  let isAdmin: boolean = $state($sessionAccess.isAdmin);
  let features: AppFeatures | null = $state($sessionAccess.features);
  let searchProfile: SearchProfileV1 = $state(normalizeSearchProfile(DEFAULT_SEARCH_PROFILE));
  let notificationEnabled: boolean = $state(false);
  let pushStatus: string = $state("disabled");
  let resumeReady = $state(false);
  let tailoringReady = $state(false);

  let feedbackType: "feature_request" | "general_feedback" = $state("feature_request");
  let feedbackTitle: string = $state("");
  let feedbackDetails: string = $state("");
  let submittingFeedback: boolean = $state(false);
  let feedbackError: string | null = $state(null);
  let feedbackTitleInput: HTMLInputElement | null = $state(null);
  const nativeIos = isIosApp();

  let mode = $derived($themeMode);
  let preferenceSummary = $derived.by(() => {
    const roleCount = searchProfile.roles.length;
    const locations = LOCATION_OPTIONS.filter((option) => searchProfile.location_ids.includes(option.id));
    const location = locations.length === 0
      ? "Anywhere in the US"
      : locations.length === 1
        ? locations[0]?.label ?? "1 location"
        : `${locations[0]?.label ?? "Locations"} +${locations.length - 1}`;
    return `${roleCount} ${roleCount === 1 ? "role" : "roles"} · ${location}`;
  });
  let alertsSummary = $derived(
    notificationEnabled
      ? pushStatus === "enabled" ? "On" : "On · finish device setup"
      : "Off"
  );
  let accountSummary = $derived(
    sessionState === "authenticated"
      ? account?.email ?? "Signed in"
      : "Guest · sign in to sync"
  );

  function showSuccess(message: string) {
    feedback.success(message);
  }

  function showError(message: string) {
    error = message;
  }

  // Name, job preferences, and alerts autosave. Focused settings pages do not
  // need a permanent Save button competing with their actual controls.
  let loaded = false;
  let lastSavedKey = $state("");
  let savingPrefs = $state(false);
  let saveAgain = false;
  let autosaveTimer: number | null = null;
  let savedProfileKey = "";
  let savedNotificationEnabled = false;

  function currentKey(): string {
    return JSON.stringify({
      name: displayName.trim(),
      profile: searchProfile,
      enabled: notificationEnabled,
    });
  }

  $effect(() => {
    const key = currentKey();
    if (!loaded || key === lastSavedKey) return;
    savePresentation.markDirty();
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void performSave();
    }, 1200);
  });

  function flushAutosave() {
    if (autosaveTimer === null) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    void performSave();
  }

  async function performSave() {
    if (!loaded) return;
    if (savingPrefs) {
      saveAgain = true;
      return;
    }
    savingPrefs = true;
    const presentationGeneration = savePresentation.begin();
    const sentKey = currentKey();
    try {
      const trimmedName = displayName.trim();
      const profileKey = JSON.stringify(searchProfile);
      const sentNotificationEnabled = notificationEnabled;
      const nameChanged = Boolean(trimmedName && trimmedName !== savedDisplayName);
      const profileChanged = profileKey !== savedProfileKey;
      const notificationChanged = sentNotificationEnabled !== savedNotificationEnabled;
      const [, savedPreferences] = await Promise.all([
        nameChanged ? api.me.update({ name: trimmedName }) : Promise.resolve(null),
        profileChanged || notificationChanged
          ? api.preferences.update({
              search_profile: { ...searchProfile, notifications_enabled: sentNotificationEnabled },
            })
          : Promise.resolve(null),
        notificationChanged
          ? api.push.updateSettings({ enabled: sentNotificationEnabled, push_enabled: true })
          : Promise.resolve(null),
      ]);

      if (nameChanged) savedDisplayName = trimmedName;
      const currentStillSent = currentKey() === sentKey;
      if (savedPreferences) {
        const normalized = normalizeSearchProfile(savedPreferences.search_profile);
        if (profileChanged) invalidateFeedForPreferences(normalized);
        savedProfileKey = JSON.stringify(normalized);
        if (currentStillSent) searchProfile = normalized;
      }
      if (notificationChanged) savedNotificationEnabled = sentNotificationEnabled;
      lastSavedKey = currentStillSent ? currentKey() : sentKey;
      if (profileChanged || notificationChanged) {
        void api.interactions.event({
          event_name: "search_profile_adjusted",
          entity_type: "search_profile",
          properties: { source: "settings" },
        }).catch(() => undefined);
      }
      savePresentation.succeed(presentationGeneration);
      error = null;
    } catch (e) {
      const message = errorMessage(e);
      error = message;
      savePresentation.fail(presentationGeneration, message);
    } finally {
      savingPrefs = false;
      if (saveAgain) {
        saveAgain = false;
        void performSave();
      }
    }
  }

  async function loadSettings() {
    loading = true;
    error = null;
    const knownSessionState = $sessionAccess.state;
    try {
      const [bootstrapResult, notificationResult, resumeResult] = await Promise.allSettled([
        api.bootstrap.get(),
        api.push.settings(),
        api.profile.get(),
      ]);

      if (bootstrapResult.status !== "fulfilled") throw bootstrapResult.reason;
      const { me, preferences } = bootstrapResult.value;
      if (knownSessionState === "authenticated" && me.session.state !== "authenticated") {
        throw new Error("Unable to verify your session. Your signed-in state is unchanged. Try loading again.");
      }

      displayName = me.user?.name ?? "";
      savedDisplayName = displayName;
      sessionState = me.session.state;
      account = me.account ?? null;
      isAdmin = me.is_admin === true;
      features = me.features ?? null;
      syncSessionAccess(me);
      searchProfile = normalizeSearchProfile(preferences.search_profile);

      if (notificationResult.status === "fulfilled") {
        notificationEnabled = notificationResult.value.enabled;
      }
      const localKit = loadLocalTailorKit();
      const structuredResume = resumeResult.status === "fulfilled" ? resumeResult.value.data : null;
      resumeReady = Boolean(
        localKit.resume?.canTailor
        || structuredResume?.contact.name
        || structuredResume?.experience.length
        || structuredResume?.education.length
        || structuredResume?.projects.length
      );
      tailoringReady = Boolean(localKit.apiKey.trim() || features?.tailoring_enabled);

      pushStatus = await getNativePushStatus();
      if (pushStatus === "enabled") {
        await initNativePush().catch(() => {});
      }

      lastSavedKey = currentKey();
      savedProfileKey = JSON.stringify(searchProfile);
      savedNotificationEnabled = notificationEnabled;
      savePresentation.hydrate(null);
      loaded = true;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }

  function consumeAuthFeedbackFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const authState = params.get("auth");
    if (!authState) return;

    if (authState === "email-success") {
      showSuccess("Signed in from your email link.");
    } else if (authState === "email-expired") {
      error = "That sign-in link expired. Send yourself a fresh one.";
    }

    params.delete("auth");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }

  async function submitProductFeedback() {
    const title = feedbackTitle.trim();
    if (submittingFeedback) return;
    if (title.length < 2) {
      if (nativeIos) {
        feedbackError = "Add a short title before sending.";
        window.requestAnimationFrame(() => feedbackTitleInput?.focus());
      }
      return;
    }
    submittingFeedback = true;
    feedbackError = null;
    try {
      const result = await api.interactions.submitFeedback({
        submission_type: feedbackType,
        title,
        details: feedbackDetails.trim(),
      });
      feedbackType = "feature_request";
      feedbackTitle = "";
      feedbackDetails = "";
      backToYou();
      showSuccess(result.duplicate
        ? "That idea is already in your feedback queue."
        : "Feedback sent. Thank you for helping shape pinkslip.");
    } catch (e) {
      feedbackError = errorMessage(e);
    } finally {
      submittingFeedback = false;
    }
  }

  function backToYou() {
    if (!requestBack()) navigate("/you");
  }

  onMount(() => {
    consumeAuthFeedbackFromUrl();
    void loadSettings();

    const unregisterAutosaveFlush = registerAutosaveFlush(flushAutosave);
    return () => {
      unregisterAutosaveFlush();
      savePresentation.destroy();
    };
  });

</script>

{#snippet destinationRow(label: string, detail: string, path: string, Icon: PhosphorIcon)}
  <button class="you-settings-row" type="button" onclick={() => navigate(path)}>
    <span class="you-settings-row-icon"><Icon size={18} /></span>
    <span class="you-settings-row-copy">
      <strong>{label}</strong>
      <small>{detail}</small>
    </span>
    <CaretRight size={16} />
  </button>
{/snippet}

{#if destination}
  <div class="page pushed-screen">
    <ScreenNav
      title={destinationTitles[destination]}
      collapsible={nativeIos}
      backLabel="Back to You"
      onBack={backToYou}
    />

    <div class="page-frame you-destination-page">
      {#if nativeIos}
        <h1 class="screen-large-title" data-screen-title-anchor>{destinationTitles[destination]}</h1>
      {/if}
      {#if loading}
        <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
      {:else}
        {#if error}
          <div class="alert alert-error alert-spaced" role="alert">{error}</div>
        {/if}
        <div class="you-saving-state"><SaveStatus phase={savePresentation.phase} /></div>

        {#if destination === "preferences"}
          <JobsSection bind:searchProfile showHeading={false} />
        {:else if destination === "alerts"}
          <NotifySection
            bind:notificationEnabled
            bind:pushStatus
            showHeading={false}
            onError={showError}
            onSuccess={showSuccess}
          />
        {:else if destination === "tailoring"}
          <TailorSection
            {sessionState}
            {features}
            showHeading={false}
            onError={showError}
            onSuccess={showSuccess}
          />
        {:else if destination === "feedback"}
          <form class="feedback-page-form" onsubmit={(event) => { event.preventDefault(); void submitProductFeedback(); }}>
            <p class="feedback-page-intro">
              Found something rough or have an idea? Send it our way.
            </p>
            <div class="form-stack loose">
              <div>
                <label for="feedback-type" class="field-label">Feedback type</label>
                <div class="select-field-wrap">
                  <select id="feedback-type" class="input-field tall-control" bind:value={feedbackType}>
                    <option value="feature_request">Feature idea</option>
                    <option value="general_feedback">General feedback</option>
                  </select>
                  <span class="select-chevron" aria-hidden="true"><CaretDown size={15} /></span>
                </div>
              </div>
              <div>
                <label for="feedback-title" class="field-label">Title</label>
                <input
                  bind:this={feedbackTitleInput}
                  id="feedback-title"
                  class="input-field tall-control"
                  type="text"
                  maxlength="160"
                  placeholder={feedbackType === "feature_request" ? "What should pinkslip do?" : "What should we know?"}
                  bind:value={feedbackTitle}
                  aria-invalid={nativeIos && feedbackError ? "true" : undefined}
                  aria-describedby={nativeIos && feedbackError ? "feedback-form-error" : undefined}
                  oninput={() => { if (nativeIos) feedbackError = null; }}
                />
              </div>
              <div>
                <label for="feedback-details" class="field-label">Details <span class="label-opt">optional</span></label>
                <textarea
                  id="feedback-details"
                  class="input-field textarea-field feedback-textarea"
                  rows="7"
                  maxlength="2000"
                  placeholder="What problem would this solve, or what happened?"
                  bind:value={feedbackDetails}
                ></textarea>
              </div>
              {#if feedbackError}<div id="feedback-form-error" class="alert alert-error" role="alert">{feedbackError}</div>{/if}
            </div>
            <button
              class="btn-primary btn-accent full-width feedback-submit"
              type="submit"
              disabled={submittingFeedback || (!nativeIos && feedbackTitle.trim().length < 2)}
            >
              {#if submittingFeedback}<Spinner />{/if}
              Send feedback
            </button>
          </form>
        {:else if destination === "account"}
          <div class="you-account-stack">
            <section class="you-focus-card">
              <label for="display-name">
                <span class="field-label">Display name</span>
                <input
                  id="display-name"
                  type="text"
                  class="input-field"
                  placeholder="Your name"
                  bind:value={displayName}
                />
              </label>
            </section>
            <AccountSection
              {sessionState}
              {account}
              showHeading={false}
              onError={showError}
              onSuccess={showSuccess}
              onReload={loadSettings}
            />
          </div>
        {/if}
      {/if}
    </div>
  </div>
{:else}
  <div class="page root-screen">
    <div class="page-frame you-page">

      {#if loading}
        <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
      {:else}
        {#if error}
          <div class="alert alert-error" role="alert">{error}</div>
        {/if}

        {#if isAdmin}
          <section>
            <h2 class="section-eyebrow">Admin</h2>
            <div class="surface-list">
              {@render destinationRow("Admin workspace", "Product health and moderation", "/admin", Wrench)}
            </div>
          </section>
        {/if}

        <section>
          <h2 class="section-eyebrow">Search</h2>
          <div class="surface-list">
            {@render destinationRow("Job preferences", preferenceSummary, "/you/preferences", SlidersHorizontal)}
            {@render destinationRow("Job alerts", alertsSummary, "/you/alerts", Bell)}
            {@render destinationRow("Company preferences", "Hidden companies and requests", "/you/companies", Buildings)}
          </div>
        </section>

        <section>
          <h2 class="section-eyebrow">Materials</h2>
          <div class="surface-list">
            {@render destinationRow("Resume", resumeReady ? (nativeIos ? "Structured resume ready" : "Ready") : "Add your resume", "/you/resume", FileText)}
            {@render destinationRow("Tailoring", tailoringReady ? (nativeIos ? "Provider ready" : "Ready") : "Finish setup", "/you/tailoring", MagicWand)}
            {@render destinationRow("Master story", "Projects, outcomes, and talking points", "/you/story", Notebook)}
          </div>
        </section>

        <section>
          <h2 class="section-eyebrow">App</h2>
          <div class="surface-list">
            <div class="you-settings-row you-settings-row-static">
              <span class="you-settings-row-icon"><PaintBrush size={18} /></span>
              <span class="you-settings-row-copy">
                <strong>Appearance</strong>
                <small>Theme</small>
              </span>
              <div class="select-field-wrap you-inline-select">
                <select
                  class="input-field"
                  value={mode}
                  aria-label="Theme"
                  onchange={(event) => themeMode.set(event.currentTarget.value as ThemeMode)}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
                <span class="select-chevron" aria-hidden="true"><CaretDown size={15} /></span>
              </div>
            </div>
            {@render destinationRow("Help and feedback", "Ideas and support", "/you/feedback", ChatCircleDots)}
          </div>
        </section>

        <section>
          <h2 class="section-eyebrow">Account</h2>
          <div class="surface-list">
            {@render destinationRow("Account", accountSummary, "/you/account", UserCircle)}
          </div>
        </section>

      {/if}
    </div>
  </div>
{/if}
