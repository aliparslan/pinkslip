<script lang="ts">
  import { fly } from "svelte/transition";
  import { onMount } from "svelte";
  import type { Component } from "svelte";
  import { api, type AccountInfo, type AppFeatures } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { getNativePushStatus, initNativePush } from "../lib/native-push";
  import { syncSessionAccess } from "../lib/session-access";
  import { themeMode, type ThemeMode } from "../lib/theme";
  import { loadLocalTailorKit } from "../lib/local-tailor";
  import {
    DEFAULT_SEARCH_PROFILE,
    LOCATION_OPTIONS,
    normalizeSearchProfile,
    type SearchProfileV1,
  } from "../../../shared/search-profile";
  import { currentRoute, navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import Modal from "../components/Modal.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import AccountSection from "./profile/AccountSection.svelte";
  import JobsSection from "./profile/JobsSection.svelte";
  import TailorSection from "./profile/TailorSection.svelte";
  import NotifySection from "./profile/NotifySection.svelte";
  import AdminSection from "./profile/AdminSection.svelte";
  import Bell from "phosphor-svelte/lib/Bell";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import Buildings from "phosphor-svelte/lib/Buildings";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import ChatCircleDots from "phosphor-svelte/lib/ChatCircleDots";
  import CheckCircle from "phosphor-svelte/lib/CheckCircle";
  import FileText from "phosphor-svelte/lib/FileText";
  import MagicWand from "phosphor-svelte/lib/MagicWand";
  import PaintBrush from "phosphor-svelte/lib/PaintBrush";
  import SlidersHorizontal from "phosphor-svelte/lib/SlidersHorizontal";
  import Spinner from "../components/Spinner.svelte";
  import UserCircle from "phosphor-svelte/lib/UserCircle";
  import Wrench from "phosphor-svelte/lib/Wrench";

  type YouDestination = "preferences" | "alerts" | "tailoring" | "account" | "operations";
  type PhosphorIcon = Component<{ size?: number | string }>;

  const destinationTitles: Record<YouDestination, string> = {
    preferences: "Job preferences",
    alerts: "Job alerts",
    tailoring: "Tailoring",
    account: "Account",
    operations: "Operations",
  };
  const destinationIds = new Set<YouDestination>(Object.keys(destinationTitles) as YouDestination[]);

  let route = $derived($currentRoute);
  let destination = $derived.by<YouDestination | null>(() => {
    if (!route.startsWith("/you/")) return null;
    const value = route.slice("/you/".length) as YouDestination;
    return destinationIds.has(value) ? value : null;
  });

  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let successMsg: string | null = $state(null);
  let successTimer: number | null = null;

  let displayName: string = $state("");
  let savedDisplayName: string = $state("");
  let sessionState = $state<"anonymous" | "guest" | "authenticated">("guest");
  let account = $state<AccountInfo | null>(null);
  let isAdmin: boolean = $state(false);
  let features: AppFeatures | null = $state(null);
  let searchProfile: SearchProfileV1 = $state(normalizeSearchProfile(DEFAULT_SEARCH_PROFILE));
  let notificationEnabled: boolean = $state(false);
  let pushStatus: string = $state("disabled");
  let savedJobCount = $state(0);
  let appliedJobCount = $state(0);
  let resumeReady = $state(false);
  let tailoringReady = $state(false);

  let showFeedbackForm: boolean = $state(false);
  let feedbackType: "feature_request" | "general_feedback" = $state("feature_request");
  let feedbackTitle: string = $state("");
  let feedbackDetails: string = $state("");
  let submittingFeedback: boolean = $state(false);
  let feedbackError: string | null = $state(null);

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
    successMsg = message;
    if (successTimer !== null) window.clearTimeout(successTimer);
    successTimer = window.setTimeout(() => {
      successMsg = null;
      successTimer = null;
    }, 3000);
  }

  function showError(message: string) {
    error = message;
  }

  // Name, job preferences, and alerts autosave. Focused settings pages do not
  // need a permanent Save button competing with their actual controls.
  let loaded = false;
  let lastSavedKey = $state("");
  let savingPrefs = $state(false);
  let autosaveTimer: number | null = null;

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
    if (savingPrefs || !loaded) return;
    savingPrefs = true;
    const sentKey = currentKey();
    try {
      const trimmedName = displayName.trim();
      if (trimmedName && trimmedName !== savedDisplayName) {
        await api.me.update({ name: trimmedName });
        savedDisplayName = trimmedName;
      }

      const savedPreferences = await api.preferences.update({
        search_profile: {
          ...searchProfile,
          notifications_enabled: notificationEnabled,
        },
      });
      await api.push.updateSettings({
        enabled: notificationEnabled,
        push_enabled: true,
      });
      const normalized = normalizeSearchProfile(savedPreferences.search_profile);
      if (currentKey() === sentKey) {
        searchProfile = normalized;
        lastSavedKey = currentKey();
      } else {
        lastSavedKey = sentKey;
      }
      void api.interactions.event({
        event_name: "search_profile_adjusted",
        entity_type: "search_profile",
        properties: { source: "settings" },
      }).catch(() => undefined);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      savingPrefs = false;
    }
  }

  async function loadSettings() {
    loading = true;
    error = null;
    try {
      const [prefsResult, meResult, notificationResult, statsResult, resumeResult] = await Promise.allSettled([
        api.preferences.get(),
        api.me.get(),
        api.push.settings(),
        api.stats.get(),
        api.profile.get(),
      ]);

      if (meResult.status !== "fulfilled") throw meResult.reason;
      displayName = meResult.value.user?.name ?? "";
      savedDisplayName = displayName;
      sessionState = meResult.value.session.state;
      account = meResult.value.account ?? null;
      isAdmin = meResult.value.is_admin === true;
      features = meResult.value.features ?? null;
      syncSessionAccess(meResult.value);

      if (prefsResult.status !== "fulfilled") throw prefsResult.reason;
      searchProfile = normalizeSearchProfile(prefsResult.value.search_profile);

      if (notificationResult.status === "fulfilled") {
        notificationEnabled = notificationResult.value.enabled;
      }
      if (statsResult.status === "fulfilled") {
        savedJobCount = statsResult.value.savedJobs;
        appliedJobCount = statsResult.value.appliedJobs;
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
    if (title.length < 2 || submittingFeedback) return;
    submittingFeedback = true;
    feedbackError = null;
    try {
      const result = await api.interactions.submitFeedback({
        submission_type: feedbackType,
        title,
        details: feedbackDetails.trim(),
      });
      showFeedbackForm = false;
      feedbackType = "feature_request";
      feedbackTitle = "";
      feedbackDetails = "";
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

    const onHidden = () => {
      if (document.visibilityState === "hidden") flushAutosave();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flushAutosave);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flushAutosave);
      flushAutosave();
      if (successTimer !== null) window.clearTimeout(successTimer);
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

{#if successMsg}
  <div class="toast-wrap">
    <div class="toast-pill" in:fly={{ y: -14, duration: 160 }} out:fly={{ y: -10, duration: 120 }}>
      {successMsg}
    </div>
  </div>
{/if}

{#if destination}
  <div class="page pushed-screen">
    <ScreenNav
      title={destinationTitles[destination]}
      backLabel="Back to Me"
      onBack={backToYou}
    />

    <div class="page-frame you-destination-page">
      {#if loading}
        <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
      {:else}
        {#if error}
          <div class="alert alert-error alert-spaced">{error}</div>
        {/if}
        {#if savingPrefs}
          <div class="you-saving-state">Saving changes…</div>
        {/if}

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
        {:else if destination === "operations" && isAdmin}
          <AdminSection onError={showError} onSuccess={showSuccess} />
        {:else if destination === "operations"}
          <div class="alert alert-error">Operations are only available to administrators.</div>
        {/if}
      {/if}
    </div>
  </div>
{:else}
  <div class="page root-screen">
    <header class="root-screen-header">
      <h1 class="h-display h-display-lg">Me</h1>
    </header>

    <div class="page-frame you-page">

      {#if loading}
        <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
      {:else}
        {#if error}
          <div class="alert alert-error">{error}</div>
        {/if}

        <section>
          <h2 class="section-eyebrow">My jobs</h2>
          <div class="profile-job-stats">
            <button class="profile-job-stat" onclick={() => navigate("/my-jobs/saved")}>
              <BookmarkSimple size={20} />
              <strong>{savedJobCount}</strong>
              <span>Saved</span>
              <CaretRight size={15} />
            </button>
            <button class="profile-job-stat" onclick={() => navigate("/my-jobs/applied")}>
              <CheckCircle size={20} />
              <strong>{appliedJobCount}</strong>
              <span>Applied</span>
              <CaretRight size={15} />
            </button>
          </div>
        </section>

        <section>
          <h2 class="section-eyebrow">Search</h2>
          <div class="surface-list">
            {@render destinationRow("Job preferences", preferenceSummary, "/you/preferences", SlidersHorizontal)}
            {@render destinationRow("Job alerts", alertsSummary, "/you/alerts", Bell)}
          </div>
        </section>

        <section>
          <h2 class="section-eyebrow">Materials</h2>
          <div class="surface-list">
            {@render destinationRow("Resume", resumeReady ? "Ready" : "Add your resume", "/resume", FileText)}
            {@render destinationRow("Tailoring", tailoringReady ? "Ready" : "Finish setup", "/you/tailoring", MagicWand)}
          </div>
        </section>

        <section>
          <h2 class="section-eyebrow">App</h2>
          <div class="surface-list">
            {@render destinationRow("Companies", "Browse and manage employers", "/companies", Buildings)}
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
            <div class="you-settings-row you-settings-row-static">
              <span class="you-settings-row-icon"><ChatCircleDots size={18} /></span>
              <span class="you-settings-row-copy">
                <strong>Help and feedback</strong>
                <small>Ideas, problems, and support</small>
              </span>
              <button
                class="btn-secondary you-inline-action"
                type="button"
                onclick={() => {
                  feedbackError = null;
                  showFeedbackForm = true;
                }}
              >
                Send feedback
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 class="section-eyebrow">Account</h2>
          <div class="surface-list">
            {@render destinationRow("Account", accountSummary, "/you/account", UserCircle)}
          </div>
        </section>

        {#if isAdmin}
          <section>
            <h2 class="section-eyebrow">Admin</h2>
            <div class="surface-list">
              {@render destinationRow("Operations", "Product health and moderation", "/you/operations", Wrench)}
            </div>
          </section>
        {/if}
      {/if}
    </div>
  </div>
{/if}

{#if showFeedbackForm}
  <Modal
    title="Send feedback"
    subtitle="Small frustrations and ambitious ideas are both useful. Tell us what would make your job search faster."
    busy={submittingFeedback}
    onclose={() => (showFeedbackForm = false)}
  >
    <div class="form-stack loose">
      <div>
        <label for="feedback-type" class="field-label">Feedback type</label>
        <select id="feedback-type" class="input-field" bind:value={feedbackType}>
          <option value="feature_request">Feature idea</option>
          <option value="general_feedback">General feedback</option>
        </select>
      </div>
      <div>
        <label for="feedback-title" class="field-label">Title</label>
        <input
          id="feedback-title"
          class="input-field"
          type="text"
          maxlength="160"
          placeholder={feedbackType === "feature_request" ? "What should pinkslip do?" : "What should we know?"}
          bind:value={feedbackTitle}
        />
      </div>
      <div>
        <label for="feedback-details" class="field-label">Details <span class="label-opt">optional</span></label>
        <textarea
          id="feedback-details"
          class="input-field textarea-field"
          rows="6"
          maxlength="2000"
          placeholder="What problem would this solve, or what happened?"
          bind:value={feedbackDetails}
        ></textarea>
      </div>
      {#if feedbackError}
        <div class="alert alert-error">{feedbackError}</div>
      {/if}
    </div>
    <div class="action-row modal-actions">
      <button class="btn-secondary" onclick={() => { showFeedbackForm = false; }} disabled={submittingFeedback}>Cancel</button>
      <button
        class="btn-primary btn-accent flex-fill"
        onclick={submitProductFeedback}
        disabled={submittingFeedback || feedbackTitle.trim().length < 2}
      >
        {#if submittingFeedback}<Spinner />{/if}
        Send feedback
      </button>
    </div>
  </Modal>
{/if}
