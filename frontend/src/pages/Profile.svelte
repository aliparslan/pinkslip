<script lang="ts">
  // The Profile tab: account, identity, and the settings sections. Each
  // section lives in pages/profile/* — this page only owns shared state
  // (session, search profile, notification prefs) and persistence.
  import { fly } from "svelte/transition";
  import { onMount } from "svelte";
  import { api, type AccountInfo, type AppFeatures } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { getNativePushStatus, initNativePush } from "../lib/native-push";
  import { syncSessionAccess } from "../lib/session-access";
  import { consumePendingSettingsSection, type SettingsSection } from "../lib/settings-section";
  import {
    DEFAULT_SEARCH_PROFILE,
    normalizeSearchProfile,
    type SearchProfileV1,
  } from "../../../shared/search-profile";
  import { navigate } from "../router";
  import Modal from "../components/Modal.svelte";
  import AccountSection from "./profile/AccountSection.svelte";
  import JobsSection from "./profile/JobsSection.svelte";
  import TailorSection from "./profile/TailorSection.svelte";
  import NotifySection from "./profile/NotifySection.svelte";
  import AdminSection from "./profile/AdminSection.svelte";
  import CaretRight from "phosphor-svelte/lib/CaretRight";

  let loading: boolean = $state(true);
  let error: string | null = $state(null);
  let successMsg: string | null = $state(null);
  let successTimer: number | null = null;

  let displayName: string = $state("");
  let savedDisplayName: string = $state("");
  let sessionState: "guest" | "authenticated" = $state("guest");
  let account: AccountInfo | null = $state(null);
  let isAdmin: boolean = $state(false);
  let features: AppFeatures | null = $state(null);
  let searchProfile: SearchProfileV1 = $state(normalizeSearchProfile(DEFAULT_SEARCH_PROFILE));
  let notificationThreshold: number = $state(50);
  let notificationEnabled: boolean = $state(false);
  let pushStatus: string = $state("disabled");

  let showFeedbackForm: boolean = $state(false);
  let feedbackType: "feature_request" | "general_feedback" = $state("feature_request");
  let feedbackTitle: string = $state("");
  let feedbackDetails: string = $state("");
  let submittingFeedback: boolean = $state(false);
  let feedbackError: string | null = $state(null);

  let activeSettingsSection: SettingsSection = $state("profile");

  const shortcuts = [
    { label: "Company Catalog", sub: "Browse companies monitored by pinkslip", path: "/companies" },
    { label: "Resume Profile", sub: "Structured resume data for tailoring", path: "/resume" },
    { label: "Master Story", sub: "Versioned freeform notes the tailor pulls from", path: "/corpus" },
  ] as const;

  const settingsSections: { id: SettingsSection; label: string; sub: string }[] = [
    { id: "profile", label: "Profile", sub: "Identity" },
    { id: "jobs", label: "Jobs", sub: "Search rules" },
    { id: "tailoring", label: "Tailor", sub: "Resume setup" },
    { id: "notifications", label: "Notify", sub: "Alerts" },
    { id: "operations", label: "Ops", sub: "Fetch runs" },
  ];
  let visibleSettingsSections = $derived(
    settingsSections.filter((section) => section.id !== "operations" || isAdmin)
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

  // ── Autosave ───────────────────────────────────────────────────────────────
  // Name, search profile, and notification prefs save automatically (debounced)
  // so edits aren't lost when switching tabs. The manual button stays as an
  // explicit flush with visible confirmation.
  let loaded = false;
  let lastSavedKey = $state("");
  let savingPrefs = $state(false);
  let autosaveTimer: number | null = null;

  function currentKey(): string {
    return JSON.stringify({
      name: displayName.trim(),
      profile: searchProfile,
      enabled: notificationEnabled,
      threshold: notificationThreshold,
    });
  }

  $effect(() => {
    const key = currentKey(); // tracks every saved field
    if (!loaded || key === lastSavedKey) return;
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void performSave(true);
    }, 1200);
  });

  function flushAutosave() {
    if (autosaveTimer === null) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    void performSave(true);
  }

  async function performSave(silent = false) {
    if (savingPrefs || !loaded) return;
    savingPrefs = true;
    if (!silent) {
      error = null;
      successMsg = null;
    }
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
        threshold: notificationThreshold,
      });
      const normalized = normalizeSearchProfile(savedPreferences.search_profile);
      if (currentKey() === sentKey) {
        // Only adopt the server-normalized profile if nothing changed while
        // the request was in flight (don't clobber in-progress edits).
        searchProfile = normalized;
        lastSavedKey = currentKey();
      } else {
        lastSavedKey = sentKey; // current edits differ → autosave re-runs
      }
      void api.interactions.event({
        event_name: "search_profile_adjusted",
        entity_type: "search_profile",
        properties: { source: "settings", threshold: searchProfile.match_threshold },
      }).catch(() => undefined);
      if (!silent) showSuccess("Preferences saved.");
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
      const [prefsResult, meResult, notificationResult] = await Promise.allSettled([
        api.preferences.get(),
        api.me.get(),
        api.push.settings(),
      ]);

      if (meResult.status === "fulfilled") {
        displayName = meResult.value.user?.name ?? "";
        savedDisplayName = meResult.value.user?.name ?? "";
        sessionState = meResult.value.session.state;
        account = meResult.value.account ?? null;
        isAdmin = meResult.value.is_admin === true;
        syncSessionAccess(meResult.value);
        features = meResult.value.features ?? null;
      } else {
        throw meResult.reason;
      }

      if (prefsResult.status === "fulfilled") {
        const prefs = prefsResult.value;
        searchProfile = normalizeSearchProfile(prefs.search_profile);
        notificationThreshold = prefs.notify_threshold ?? 50;
      } else {
        throw prefsResult.reason;
      }
      if (notificationResult.status === "fulfilled") {
        notificationEnabled = notificationResult.value.enabled;
        notificationThreshold = notificationResult.value.threshold;
      }

      pushStatus = await getNativePushStatus();
      // If already authorized, make sure the current device token is registered.
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

  onMount(() => {
    const pendingSection = consumePendingSettingsSection();
    if (pendingSection && pendingSection !== "operations") {
      activeSettingsSection = pendingSection;
    }
    consumeAuthFeedbackFromUrl();
    loadSettings();

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

<div class="page" style="padding-top: 0;">
  <div class="page-frame">
    <h1 class="h-display" style="font-size: 28px; letter-spacing: -0.02em; margin-bottom: 12px;">
      Profile
    </h1>

    {#if loading}
      <div style="text-align: center; padding: 48px 0; color: var(--color-ink-3); font-family: var(--font-mono); font-size: var(--fs-xs);">
        Loading...
      </div>
    {:else}
      {#if successMsg}
        <div class="toast-wrap">
          <div class="toast-pill" in:fly={{ y: -14, duration: 160 }} out:fly={{ y: -10, duration: 120 }}>
            {successMsg}
          </div>
        </div>
      {/if}
      <div style="display: flex; flex-direction: column; gap: 24px;">
        {#if error}
          <div class="alert alert-error">
            {error}
          </div>
        {/if}

        <!-- Avatar + name -->
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 48px; height: 48px; border-radius: var(--radius-full); background: var(--color-accent); color: var(--color-accent-ink); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 700; font-size: 20px; flex-shrink: 0;">
            {(displayName || "?").charAt(0).toUpperCase()}
          </div>
          <div style="flex: 1; min-width: 0;">
            <input
              id="display-name"
              type="text"
              class="input-field"
              placeholder="Your name"
              aria-label="Your name"
              bind:value={displayName}
              style="font-size: 16px; font-weight: 600; background: var(--color-bg-elev);"
            />
          </div>
        </div>

        <AccountSection
          {sessionState}
          {account}
          onError={showError}
          onSuccess={showSuccess}
          onReload={loadSettings}
        />

        <div
          class="settings-section-tabs"
          style={`--settings-section-count: ${visibleSettingsSections.length}`}
          role="tablist"
          aria-label="Profile settings sections"
        >
          {#each visibleSettingsSections as section}
            <button
              type="button"
              class:active={activeSettingsSection === section.id}
              class="settings-section-tab"
              role="tab"
              aria-selected={activeSettingsSection === section.id}
              onclick={() => (activeSettingsSection = section.id)}
            >
              <span>{section.label}</span>
              <small>{section.sub}</small>
            </button>
          {/each}
        </div>

        {#if activeSettingsSection === "profile"}
          <section>
            <h2 class="section-eyebrow">Shortcuts</h2>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              {#each shortcuts as shortcut}
                <button
                  class="shortcut-row"
                  onclick={() => navigate(shortcut.path)}
                >
                  <div style="min-width: 0; text-align: left;">
                    <div style="font-size: var(--fs-md); font-weight: 600;">{shortcut.label}</div>
                    <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{shortcut.sub}</div>
                  </div>
                  <CaretRight size={16} color="var(--color-ink-4)" />
                </button>
              {/each}
            </div>
          </section>

          <section>
            <h2 class="section-label" style="display: block; margin-bottom: 10px;">Help shape pinkslip</h2>
            <button
              class="shortcut-row"
              type="button"
              onclick={() => {
                feedbackError = null;
                showFeedbackForm = true;
              }}
            >
              <div style="min-width: 0; text-align: left;">
                <div style="font-size: var(--fs-md); font-weight: 600;">Send feedback</div>
                <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 2px;">
                  Suggest a feature or tell us what is getting in your way
                </div>
              </div>
              <CaretRight size={16} color="var(--color-ink-4)" />
            </button>
          </section>
        {/if}

        {#if activeSettingsSection === "jobs"}
          <JobsSection bind:searchProfile />
        {/if}

        {#if activeSettingsSection === "tailoring"}
          <TailorSection
            {sessionState}
            {features}
            onError={showError}
            onSuccess={showSuccess}
          />
        {/if}

        {#if activeSettingsSection === "notifications"}
          <NotifySection
            bind:notificationEnabled
            bind:notificationThreshold
            bind:pushStatus
            onError={showError}
            onSuccess={showSuccess}
          />
        {/if}

        {#if isAdmin && activeSettingsSection === "operations"}
          <AdminSection onError={showError} onSuccess={showSuccess} />
        {/if}

        <!-- Changes autosave; this is an explicit flush with confirmation. -->
        {#if activeSettingsSection === "profile" || activeSettingsSection === "jobs" || activeSettingsSection === "notifications"}
          <button
            class="btn-primary btn-accent"
            style="width: 100%;"
            onclick={() => performSave(false)}
            disabled={savingPrefs}
          >
            {savingPrefs ? "Saving..." : "Save preferences"}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if showFeedbackForm}
  <Modal
    title="Send feedback"
    subtitle="Small frustrations and ambitious ideas are both useful. Tell us what would make your job search faster."
    busy={submittingFeedback}
    onclose={() => (showFeedbackForm = false)}
  >
    <div style="display: flex; flex-direction: column; gap: 12px;">
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
        <label for="feedback-details" class="field-label">Details <span style="font-weight: 400; color: var(--color-ink-4);">optional</span></label>
        <textarea
          id="feedback-details"
          class="input-field"
          rows="6"
          maxlength="2000"
          placeholder="What problem would this solve, or what happened?"
          bind:value={feedbackDetails}
          style="height: auto; resize: vertical;"
        ></textarea>
      </div>
      {#if feedbackError}
        <div class="alert alert-error">
          {feedbackError}
        </div>
      {/if}
    </div>
    <div class="action-row" style="margin-top: 16px;">
      <button class="btn-secondary" onclick={() => { showFeedbackForm = false; }} disabled={submittingFeedback}>Cancel</button>
      <button
        class="btn-primary btn-accent"
        style="flex: 1;"
        onclick={submitProductFeedback}
        disabled={submittingFeedback || feedbackTitle.trim().length < 2}
      >
        {submittingFeedback ? "Sending..." : "Send feedback"}
      </button>
    </div>
  </Modal>
{/if}
