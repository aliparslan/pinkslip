<script lang="ts">
  import { fly } from "svelte/transition";
  import { onMount } from "svelte";
  import {
    api,
    type AccountInfo,
    type AppFeatures,
    type ContentReport,
    type FeedbackSubmission,
    type FetchRun,
    type ProductMetrics,
    type ResumeAssetRecord,
    type ScorerRollout,
    type TailorUsage,
  } from "../lib/api";
  import { focusTrap } from "../lib/focus-trap";
  import {
    DEFAULT_TAILOR_MODEL,
    TAILOR_MODEL_OPTIONS,
    createLocalResumeAsset,
    downloadLocalResume,
    formatFileSize,
    loadLocalTailorKit,
    openLocalResume,
    refreshLocalTailorKitResume,
    saveLocalTailorKit,
    updateLocalTailorKit,
    type LocalResumeAsset,
  } from "../lib/local-tailor";
  import { isNativeIosAuthAvailable, signInWithAppleNative } from "../lib/native-auth";
  import { enableNativePush, getNativePushStatus, initNativePush, isNativeIos } from "../lib/native-push";
  import { syncSessionAccess } from "../lib/session-access";
  import {
    DEFAULT_SEARCH_PROFILE,
    LOCATION_OPTIONS,
    ROLE_OPTIONS,
    normalizeSearchProfile,
    type SearchProfileV1,
  } from "../../../shared/search-profile";
  import { navigate } from "../router";
  import Slider from "../components/Slider.svelte";
  import SearchProfileFields from "../components/SearchProfileFields.svelte";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
  import Eye from "phosphor-svelte/lib/Eye";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import Trash from "phosphor-svelte/lib/Trash";
  import UploadSimple from "phosphor-svelte/lib/UploadSimple";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import CaretDown from "phosphor-svelte/lib/CaretDown";

  let enablingPush: boolean = $state(false);
  let loading: boolean = $state(true);
  let saving: boolean = $state(false);
  let error: string | null = $state(null);
  let successMsg: string | null = $state(null);

  let displayName: string = $state("");
  let savedDisplayName: string = $state("");
  let sessionState: "guest" | "authenticated" = $state("guest");
  let account: AccountInfo | null = $state(null);
  let isAdmin: boolean = $state(false);
  let emailLogin: string = $state("");
  let sendingEmailLogin: boolean = $state(false);
  let signingInWithApple: boolean = $state(false);
  let signingOut: boolean = $state(false);
  let deletingAccount: boolean = $state(false);
  let remoteResume: ResumeAssetRecord | null = $state(null);
  let syncingResume: boolean = $state(false);
  let removingSyncedResume: boolean = $state(false);
  let searchProfile: SearchProfileV1 = $state(normalizeSearchProfile(DEFAULT_SEARCH_PROFILE));
  let notificationThreshold: number = $state(50);
  let notificationEnabled: boolean = $state(false);
  let profileEditing: boolean = $state(false);
  let pushStatus: string = $state("disabled");
  let testingNotif: string | null = $state(null);
  let features: AppFeatures | null = $state(null);
  let runs: FetchRun[] = $state([]);
  let refreshingAll: boolean = $state(false);
  let refreshLog: string[] = $state([]);
  let productMetrics: ProductMetrics | null = $state(null);
  let reports: ContentReport[] = $state([]);
  let feedbackInbox: FeedbackSubmission[] = $state([]);
  let scorerRollouts: ScorerRollout[] = $state([]);
  let updatingRollout: string | null = $state(null);
  let localGeminiKey: string = $state("");
  let localGeminiModel: string = $state(DEFAULT_TAILOR_MODEL);
  let localResume = $state<LocalResumeAsset | null>(null);
  let tailorUsage: TailorUsage | null = $state(null);
  let showGeminiKey: boolean = $state(false);
  let savingLocalSetup: boolean = $state(false);
  let resumeUploadInput: HTMLInputElement | null = $state(null);
  let showFeedbackForm: boolean = $state(false);
  let feedbackType: "feature_request" | "general_feedback" = $state("feature_request");
  let feedbackTitle: string = $state("");
  let feedbackDetails: string = $state("");
  let submittingFeedback: boolean = $state(false);
  let feedbackError: string | null = $state(null);
  type SettingsSection = "profile" | "jobs" | "tailoring" | "notifications" | "operations";
  let activeSettingsSection: SettingsSection = $state("profile");

  let hasLocalGeminiKey = $derived(Boolean(localGeminiKey.trim()));
  let tailoringSetupReady = $derived.by(() =>
    Boolean(hasLocalGeminiKey || (features !== null && features.tailoring_enabled))
  );
  let localSetupLabel = $derived.by(() => {
    if (tailoringSetupReady) return hasLocalGeminiKey ? "your key ready" : "app key ready";
    if (localGeminiKey.trim() || localResume) return "partial";
    return "off";
  });
  let activeUsageCount = $derived.by(() => {
    if (!tailorUsage) return null;
    return hasLocalGeminiKey ? tailorUsage.user_today : tailorUsage.app_today;
  });
  let activeUsageRemaining = $derived.by(() => {
    if (!tailorUsage) return null;
    return hasLocalGeminiKey ? tailorUsage.user_remaining : tailorUsage.app_remaining;
  });

  const shortcuts = [
    { label: "Company Catalog", sub: "Browse companies monitored by pinkslip", path: "/companies" },
    { label: "Resume Profile", sub: "Structured resume data for tailoring", path: "/resume" },
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
  let primaryRoleLabel = $derived(
    ROLE_OPTIONS.find((role) => role.id === searchProfile.primary_role)?.label ?? "Not set"
  );
  let specialtyLabels = $derived(
    ROLE_OPTIONS
      .filter((role) => role.id !== searchProfile.primary_role && searchProfile.roles.includes(role.id))
      .map((role) => role.shortLabel)
      .join(", ") || "No secondary roles"
  );
  let metroLabels = $derived(
    LOCATION_OPTIONS
      .filter((location) => searchProfile.location_ids.includes(location.id))
      .map((location) => location.label)
      .join(", ") || "Any US metro"
  );

  function inferTextFormat(fileName: string, mimeType: string): LocalResumeAsset["textFormat"] {
    const lower = fileName.toLowerCase();
    if (mimeType === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
    if (mimeType.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".rtf")) return "plain";
    return "binary";
  }

  function localResumeFromRemote(asset: ResumeAssetRecord): LocalResumeAsset | null {
    if (!asset.dataUrl) return null;
    const textFormat = inferTextFormat(asset.fileName, asset.mimeType);
    return {
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.size,
      uploadedAt: asset.uploadedAt,
      dataUrl: asset.dataUrl,
      textContent: asset.extractedText,
      textFormat,
      canTailor: Boolean(asset.extractedText?.trim()),
    };
  }

  async function loadRemoteResume(userSessionState: "guest" | "authenticated") {
    if (userSessionState !== "authenticated") {
      remoteResume = null;
      return;
    }

    remoteResume = await api.resumeAssets.get().then((res) => res.asset).catch(() => null);
    const remoteLocal = remoteResume ? localResumeFromRemote(remoteResume) : null;
    if (remoteLocal && !localResume) {
      localResume = remoteLocal;
      updateLocalTailorKit({ resume: remoteLocal });
    }
  }

  function hydrateLocalSetup() {
    const localKit = loadLocalTailorKit();
    localGeminiKey = localKit.apiKey;
    localGeminiModel = localKit.model || DEFAULT_TAILOR_MODEL;
    localResume = localKit.resume;
  }

  async function refreshSavedResumeText() {
    const before = loadLocalTailorKit().resume;
    const refreshed = await refreshLocalTailorKitResume();
    localGeminiKey = refreshed.apiKey;
    localGeminiModel = refreshed.model || DEFAULT_TAILOR_MODEL;
    localResume = refreshed.resume;

    if (!before?.canTailor && refreshed.resume?.canTailor && refreshed.resume.textFormat === "pdf") {
      successMsg = "Extracted text from saved PDF. Resume is ready for tailoring.";
      setTimeout(() => (successMsg = null), 3000);
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

      runs = isAdmin
        ? await api.runs.list(50).then((result) => result.runs ?? []).catch(() => [])
        : [];
      if (isAdmin) {
        [productMetrics, reports, feedbackInbox, scorerRollouts] = await Promise.all([
          api.metrics.get().catch(() => null),
          api.interactions.reports("open").then((result) => result.reports).catch(() => []),
          api.interactions.feedback("active").then((result) => result.feedback).catch(() => []),
          api.metrics.rollouts().then((result) => result.rollouts).catch(() => []),
        ]);
      } else {
        productMetrics = null;
        reports = [];
        feedbackInbox = [];
        scorerRollouts = [];
      }

      await loadRemoteResume(sessionState);

      pushStatus = await getNativePushStatus();
      // If already authorized, make sure the current device token is registered.
      if (pushStatus === "enabled") {
        await initNativePush().catch(() => {});
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function loadTailorUsage() {
    tailorUsage = await api.tailor.usage(localGeminiModel).then((res) => res.usage).catch(() => null);
  }

  function consumeAuthFeedbackFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const authState = params.get("auth");
    if (!authState) return;

    if (authState === "email-success") {
      successMsg = "Signed in from your email link.";
      setTimeout(() => (successMsg = null), 3000);
    } else if (authState === "email-expired") {
      error = "That sign-in link expired. Send yourself a fresh one.";
    }

    params.delete("auth");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }

  onMount(() => {
    hydrateLocalSetup();
    consumeAuthFeedbackFromUrl();
    void refreshSavedResumeText().catch(() => undefined);
    void loadTailorUsage();
    loadSettings();
  });

  async function handleSave() {
    saving = true;
    error = null;
    successMsg = null;
    try {
      const trimmedName = displayName.trim();
      if (trimmedName && trimmedName !== savedDisplayName) {
        await api.me.update({ name: trimmedName });
        savedDisplayName = trimmedName;
        displayName = trimmedName;
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
      searchProfile = normalizeSearchProfile(savedPreferences.search_profile);
      await api.interactions.event({
        event_name: "search_profile_adjusted",
        entity_type: "search_profile",
        properties: { source: "settings", threshold: searchProfile.match_threshold },
      }).catch(() => undefined);
      profileEditing = false;
      successMsg = "Preferences saved.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  function resetToDefaults() {
    searchProfile = normalizeSearchProfile(DEFAULT_SEARCH_PROFILE);
  }

  function formatLatency(seconds: number) {
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${Math.round((seconds / 3600) * 10) / 10} hr`;
  }

  async function moderateReport(id: string, status: "resolved" | "dismissed") {
    try {
      await api.interactions.updateReport(id, { status });
      reports = reports.filter((report) => report.id !== id);
      if (productMetrics) {
        productMetrics = {
          ...productMetrics,
          open_reports: Math.max(0, productMetrics.open_reports - 1),
        };
      }
    } catch (e: any) {
      error = e.message;
    }
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
      successMsg = result.duplicate
        ? "That idea is already in your feedback queue."
        : "Feedback sent. Thank you for helping shape pinkslip.";
      setTimeout(() => (successMsg = null), 3200);
    } catch (e: any) {
      feedbackError = e.message;
    } finally {
      submittingFeedback = false;
    }
  }

  async function moderateFeedback(
    id: string,
    status: "planned" | "resolved" | "declined"
  ) {
    try {
      await api.interactions.updateFeedback(id, { status });
      if (status === "planned") {
        feedbackInbox = feedbackInbox.map((item) =>
          item.id === id ? { ...item, status: "planned", updated_at: new Date().toISOString() } : item
        );
      } else {
        feedbackInbox = feedbackInbox.filter((item) => item.id !== id);
        if (productMetrics) {
          productMetrics = {
            ...productMetrics,
            open_feedback: Math.max(0, productMetrics.open_feedback - 1),
          };
        }
      }
    } catch (e: any) {
      error = e.message;
    }
  }

  async function saveRollout(rollout: ScorerRollout) {
    if (updatingRollout) return;
    updatingRollout = rollout.scorer_version;
    try {
      const result = await api.metrics.updateRollout(rollout.scorer_version, {
        mode: rollout.mode,
        cohort_percent: rollout.cohort_percent,
      });
      scorerRollouts = scorerRollouts.map((item) =>
        item.scorer_version === result.rollout.scorer_version ? result.rollout : item
      );
      successMsg = "Scorer rollout updated. Matches will rebuild as users return.";
      setTimeout(() => (successMsg = null), 3500);
    } catch (e: any) {
      error = e.message;
    } finally {
      updatingRollout = null;
    }
  }

  async function saveLocalSetup() {
    savingLocalSetup = true;
    error = null;
    successMsg = null;
    try {
      saveLocalTailorKit({
        provider: "gemini",
        apiKey: localGeminiKey.trim(),
        model: localGeminiModel.trim() || DEFAULT_TAILOR_MODEL,
        resume: localResume,
      });
      hydrateLocalSetup();
      await loadTailorUsage();
      successMsg = "Private tailoring setup saved on this device.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      savingLocalSetup = false;
    }
  }

  async function handleResumeUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    error = null;
    try {
      const asset = await createLocalResumeAsset(file);
      localResume = asset;
      updateLocalTailorKit({ resume: asset });
      successMsg = `${asset.fileName} saved on this device.`;
      if (sessionState === "authenticated") {
        await syncResumeToAccount(asset).catch(() => undefined);
      }
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      if (input) input.value = "";
    }
  }

  function removeLocalResume() {
    localResume = null;
    updateLocalTailorKit({ resume: null });
    successMsg = "Local resume removed.";
    setTimeout(() => (successMsg = null), 3000);
  }

  async function syncResumeToAccount(asset = localResume) {
    if (sessionState !== "authenticated" || !asset) return;
    syncingResume = true;
    error = null;
    try {
      const result = await api.resumeAssets.upload({
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        size: asset.size,
        dataUrl: asset.dataUrl,
        extractedText: asset.textContent,
      });
      remoteResume = result.asset;
      successMsg = "Resume synced to your account.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      syncingResume = false;
    }
  }

  async function useSyncedResumeOnThisDevice() {
    const next = remoteResume ? localResumeFromRemote(remoteResume) : null;
    if (!next) return;
    localResume = next;
    updateLocalTailorKit({ resume: next });
    successMsg = "Using your synced resume on this device.";
    setTimeout(() => (successMsg = null), 3000);
  }

  async function removeSyncedResume() {
    removingSyncedResume = true;
    error = null;
    try {
      await api.resumeAssets.deleteActive();
      remoteResume = null;
      successMsg = "Removed the synced resume from your account.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      removingSyncedResume = false;
    }
  }

  async function handleAppleLogin() {
    signingInWithApple = true;
    error = null;
    try {
      const credential = await signInWithAppleNative();
      await api.auth.signInWithApple(credential);
      await loadSettings();
      successMsg = "Signed in. Your pinkslip data now syncs across devices.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      if (e?.code === "CANCELED") return; // user dismissed the sheet — not an error
      error = e.message ?? "Could not complete Sign in with Apple.";
    } finally {
      signingInWithApple = false;
    }
  }

  async function handleEmailLoginStart() {
    if (!emailLogin.trim() || sendingEmailLogin) return;
    sendingEmailLogin = true;
    error = null;
    try {
      await api.auth.startEmailLogin(emailLogin.trim());
      successMsg = "Check your email for a sign-in link.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      sendingEmailLogin = false;
    }
  }

  async function handleLogout() {
    signingOut = true;
    error = null;
    try {
      await api.auth.logout();
      account = null;
      sessionState = "guest";
      remoteResume = null;
      await loadSettings();
      successMsg = "Signed out. You’re back in guest mode on this device.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      signingOut = false;
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm("Delete your account and synced data? This cannot be undone.")) return;
    deletingAccount = true;
    error = null;
    try {
      await api.auth.deleteAccount();
      account = null;
      sessionState = "guest";
      remoteResume = null;
      await loadSettings();
      successMsg = "Account deleted. You can keep using pinkslip as a guest.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      deletingAccount = false;
    }
  }

</script>

<div class="page" style="padding-top: 0;">
  <div style="padding: 16px 16px 28px;">
    <div class="h-display" style="font-size: 28px; letter-spacing: -0.02em; margin-bottom: 12px;">
      Profile
    </div>

    {#if loading}
      <div style="text-align: center; padding: 48px 0; color: var(--color-ink-3); font-family: var(--font-mono); font-size: 12px;">
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
          <div style="padding: 16px 18px; border-radius: var(--radius-md); background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 14px;">
            {error}
          </div>
        {/if}

        <!-- Avatar + name -->
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 48px; height: 48px; border-radius: 24px; background: var(--color-accent); color: var(--color-accent-ink); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 700; font-size: 20px; flex-shrink: 0;">
            {(displayName || "?").charAt(0).toUpperCase()}
          </div>
          <div style="flex: 1; min-width: 0;">
            <input
              id="display-name"
              type="text"
              class="input-field"
              placeholder="Your name"
              bind:value={displayName}
              style="font-size: 16px; font-weight: 600; background: var(--color-bg-elev); border-color: var(--color-line-2);"
            />
          </div>
        </div>

        <section>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">
            Account
          </div>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line-2); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 14px;">
            {#if sessionState === "authenticated"}
              <div style="display: flex; justify-content: space-between; gap: 12px; align-items: start;">
                <div>
                  <div style="font-size: 15px; font-weight: 600;">Signed in</div>
                  <div style="font-size: 13px; color: var(--color-ink-3); margin-top: 4px;">
                    {account?.email ?? "Your account is active"}{#if account?.provider} · via {account.provider === "apple" ? "Apple" : "email"}{/if}
                  </div>
                  <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 8px;">
                    Jobs, profile, preferences, and your synced resume can follow you across devices.
                  </div>
                </div>
                <span class="tag">sync on</span>
              </div>

              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                <button class="btn-secondary" type="button" onclick={handleLogout} disabled={signingOut}>
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
                <button class="btn-secondary" type="button" onclick={handleDeleteAccount} disabled={deletingAccount}>
                  {deletingAccount ? "Deleting..." : "Delete account"}
                </button>
              </div>
            {:else}
              <div style="display: flex; justify-content: space-between; gap: 12px; align-items: start;">
                <div>
                  <div style="font-size: 15px; font-weight: 600;">Using pinkslip as guest on this device</div>
                  <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 8px;">
                    Create an account to sync your jobs, profile, and resume across devices.
                  </div>
                </div>
                <span class="tag">guest</span>
              </div>

              {#if isNativeIosAuthAvailable()}
                <button
                  class="btn-primary btn-accent"
                  type="button"
                  onclick={handleAppleLogin}
                  disabled={signingInWithApple}
                >
                  {signingInWithApple ? "Connecting..." : "Continue with Apple"}
                </button>
              {/if}

              <div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end;">
                <div>
                  <label for="email-login" style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block;">Continue with email</label>
                  <input
                    id="email-login"
                    type="email"
                    class="input-field"
                    placeholder="you@example.com"
                    bind:value={emailLogin}
                    autocapitalize="off"
                    autocomplete="email"
                    spellcheck="false"
                    onkeydown={(event) => event.key === "Enter" && void handleEmailLoginStart()}
                  />
                </div>
                <button class="btn-secondary" type="button" onclick={handleEmailLoginStart} disabled={sendingEmailLogin || !emailLogin.trim()}>
                  {sendingEmailLogin ? "Sending..." : "Send link"}
                </button>
              </div>
            {/if}
          </div>
        </section>

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
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">
            Shortcuts
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            {#each shortcuts as shortcut, i}
              <button
                class="shortcut-row"
                onclick={() => navigate(shortcut.path)}
              >
                <div style="min-width: 0; text-align: left;">
                  <div style="font-size: 14px; font-weight: 600;">{shortcut.label}</div>
                  <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{shortcut.sub}</div>
                </div>
                <CaretRight size={16} color="var(--color-ink-4)" />
              </button>
            {/each}
          </div>
        </section>

        <section>
          <div class="section-label" style="margin-bottom: 10px;">Help shape pinkslip</div>
          <button
            class="shortcut-row"
            type="button"
            onclick={() => {
              feedbackError = null;
              showFeedbackForm = true;
            }}
          >
            <div style="min-width: 0; text-align: left;">
              <div style="font-size: 14px; font-weight: 600;">Send feedback</div>
              <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">
                Suggest a feature or tell us what is getting in your way
              </div>
            </div>
            <CaretRight size={16} color="var(--color-ink-4)" />
          </button>
        </section>
        {/if}

        <!-- Job Preferences -->
        {#if activeSettingsSection === "jobs"}
        <section>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">Search profile</div>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line-2); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 24px;">
            {#if profileEditing}
              <SearchProfileFields bind:profile={searchProfile} />
              <div style="display: flex; justify-content: space-between; gap: 8px;">
                <button class="btn-secondary" style="height: 36px; padding: 0 14px;" onclick={resetToDefaults}>
                  Reset defaults
                </button>
                <button class="btn-secondary" style="height: 36px; padding: 0 14px;" onclick={() => { profileEditing = false; }}>
                  Close editor
                </button>
              </div>
            {:else}
              <div class="profile-summary-grid">
                <div class="profile-summary-item">
                  <span>Primary role</span>
                  <strong>{primaryRoleLabel}</strong>
                </div>
                <div class="profile-summary-item">
                  <span>Also targeting</span>
                  <strong>{specialtyLabels}</strong>
                </div>
                <div class="profile-summary-item">
                  <span>Experience</span>
                  <strong>{searchProfile.years_experience} years · {searchProfile.target_levels.map((level) => level.replaceAll("_", " ")).join(", ")}</strong>
                </div>
                <div class="profile-summary-item">
                  <span>Work modes</span>
                  <strong>{searchProfile.work_modes.join(", ")}</strong>
                </div>
                <div class="profile-summary-item">
                  <span>Preferred metros</span>
                  <strong>{metroLabels}</strong>
                </div>
                <div class="profile-summary-item">
                  <span>Authorization</span>
                  <strong>{searchProfile.work_authorization.replaceAll("_", " ")} · {searchProfile.relocation_willing ? "open to relocation" : "no relocation"}</strong>
                </div>
                <div class="profile-summary-item">
                  <span>Feed threshold</span>
                  <strong>{searchProfile.match_threshold}+</strong>
                </div>
              </div>
              <button class="btn-secondary" onclick={() => { profileEditing = true; }}>
                Edit search profile
              </button>
            {/if}
          </div>
        </section>

        {/if}

        <!-- Notifications -->
        {#if activeSettingsSection === "notifications"}
        <section>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">Notifications</div>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line-2); border-radius: 14px; overflow: hidden;">
            <div style="padding: 16px 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px;">
              <div>
                <div style="font-size: 14px; font-weight: 600;">Job alerts</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">Master switch for personalized alerts</div>
              </div>
              <button
                class="btn-secondary"
                class:active={notificationEnabled}
                style="height: 34px; padding: 0 14px;"
                onclick={() => { notificationEnabled = !notificationEnabled; }}
              >
                {notificationEnabled ? "On" : "Off"}
              </button>
            </div>

            <div style="height: 0.5px; background: var(--color-line);"></div>

            <!-- Push toggle -->
            <div style="padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 14px; font-weight: 500;">Push notifications</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">Get notified for high-scoring jobs</div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-family: var(--font-mono); font-size: 11px; color: {pushStatus === 'enabled' ? 'var(--color-good)' : 'var(--color-ink-4)'};">
                  {pushStatus}
                </span>
                {#if pushStatus !== "enabled"}
                  <button
                    class="btn-secondary"
                    style="height: 32px; padding: 0 14px; font-size: 12px;"
                    disabled={enablingPush}
                    onclick={async () => {
                      enablingPush = true;
                      try {
                        const ok = (await enableNativePush()) === "enabled";
                        pushStatus = ok ? "enabled" : "disabled";
                        if (ok) notificationEnabled = true;
                        if (!ok) {
                          error = `Turn on notifications for pinkslip in ${isNativeIos() ? "iOS Settings" : "your browser settings"}.`;
                        }
                      } catch (e: any) {
                        error = e.message;
                      } finally {
                        enablingPush = false;
                      }
                    }}
                  >
                    {enablingPush ? "..." : "Enable"}
                  </button>
                {/if}
              </div>
            </div>

            <div style="height: 0.5px; background: var(--color-line);"></div>

            <!-- Threshold -->
            <div style="padding: 16px 18px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <div>
                  <div style="font-size: 14px; font-weight: 500;">Alert threshold</div>
                  <div style="font-size: 11px; color: var(--color-ink-3); margin-top: 2px;">Does not change what appears in your feed</div>
                </div>
                <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--color-accent);">
                  {notificationThreshold}
                </span>
              </div>
              <Slider min={0} max={100} step={5} bind:value={notificationThreshold} />
              <div style="display: flex; justify-content: space-between; margin-top: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4);">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>

            <div style="height: 0.5px; background: var(--color-line);"></div>

            <!-- Poll interval -->
            <div style="padding: 16px 18px; display: flex; align-items: center; justify-content: space-between;">
              <div style="font-size: 14px; font-weight: 500;">Poll interval</div>
              <span style="font-family: var(--font-mono); font-size: 12px; color: var(--color-ink-3);">Every 15 min</span>
            </div>

            <div style="height: 0.5px; background: var(--color-line);"></div>

            <!-- Test notifications -->
            <div style="padding: 16px 18px;">
              <div style="font-size: 14px; font-weight: 500; margin-bottom: 10px;">Test notifications</div>
              {#if testingNotif}
                <div style="padding: 12px 14px; border-radius: 10px; background: color-mix(in oklch, var(--color-accent) 14%, transparent); color: var(--color-accent-soft-ink); font-family: var(--font-mono); font-size: 12px; margin-bottom: 14px;">
                  {testingNotif}
                </div>
              {/if}
              <div style="display: flex; gap: 8px;">
                <button
                  class="btn-secondary"
                  style="flex: 1;"
                  disabled={!!testingNotif}
                  onclick={async () => {
                    testingNotif = "Sending...";
                    try {
                      const res = await api.push.test(0);
                      testingNotif = null;
                      successMsg = `Sent to ${res.sent} device(s)`;
                      setTimeout(() => (successMsg = null), 3000);
                    } catch (e: any) {
                      testingNotif = null;
                      error = e.message;
                    }
                  }}
                >
                  Send now
                </button>
                <button
                  class="btn-secondary"
                  style="flex: 1;"
                  disabled={!!testingNotif}
                  onclick={async () => {
                    testingNotif = "Sending in 5s...";
                    try {
                      const res = await api.push.test(5);
                      testingNotif = null;
                      successMsg = `Sent to ${res.sent} device(s)`;
                      setTimeout(() => (successMsg = null), 3000);
                    } catch (e: any) {
                      testingNotif = null;
                      error = e.message;
                    }
                  }}
                >
                  Send in 5s
                </button>
              </div>
            </div>
          </div>
        </section>
        {/if}

        {#if activeSettingsSection === "tailoring"}
        <section>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">Tailoring</div>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line-2); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 16px;">
            <div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px;">
              <div style="min-width: 0;">
                <div style="font-size: 14px; font-weight: 500;">Gemini setup</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">
                  Your Gemini key is optional and overrides the app key when present. Resume files stay on this device until you run Tailor.
                </div>
              </div>
              <span class="tag" style="flex-shrink: 0;">{localSetupLabel}</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div>
                <label for="gemini-key" style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block;">Gemini API key override</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <input
                    id="gemini-key"
                    type={showGeminiKey ? "text" : "password"}
                    class="input-field"
                    placeholder="AIza..."
                    bind:value={localGeminiKey}
                    style="flex: 1;"
                    autocapitalize="off"
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button
                    class="icon-btn icon-btn-surface"
                    type="button"
                    aria-label={showGeminiKey ? "Hide API key" : "Show API key"}
                    onclick={() => (showGeminiKey = !showGeminiKey)}
                  >
                    {#if showGeminiKey}
                      <EyeSlash size={18} />
                    {:else}
                      <Eye size={18} />
                    {/if}
                  </button>
                </div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 6px;">
                  {#if hasLocalGeminiKey}
                    Saved on this device and used for Tailor instead of the app key.
                  {:else}
                    Leave blank to use the app key when available.
                  {/if}
                </div>
              </div>

              <div>
                <label for="gemini-model" style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block;">Model</label>
                <div class="select-field-wrap">
                  <select
                    id="gemini-model"
                    class="input-field"
                    bind:value={localGeminiModel}
                    onchange={() => void loadTailorUsage()}
                  >
                    {#each TAILOR_MODEL_OPTIONS as option}
                      <option value={option.value}>
                        {option.label} · {option.note}
                      </option>
                    {/each}
                  </select>
                  <span class="select-chevron" aria-hidden="true">
                    <CaretDown size={16} />
                  </span>
                </div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 6px;">
                  The list only includes models we want this app to use. Pro/paid-only models are intentionally omitted.
                </div>
                {#if tailorUsage}
                  <div class="usage-meter" aria-label="Tailoring API usage">
                    <div style="display: flex; justify-content: space-between; gap: 12px; align-items: baseline;">
                      <span>{hasLocalGeminiKey ? "Your key in Pinkslip today" : "App key today"}</span>
                      <strong>
                        {activeUsageCount ?? 0}{#if tailorUsage.daily_limit !== null}/{tailorUsage.daily_limit}{/if}
                      </strong>
                    </div>
                    {#if tailorUsage.daily_limit !== null}
                      <div class="usage-meter-track">
                        <div
                          class="usage-meter-fill"
                          style="width: {Math.min(100, ((activeUsageCount ?? 0) / tailorUsage.daily_limit) * 100)}%;"
                        ></div>
                      </div>
                      <div style="color: var(--color-ink-4);">
                        {activeUsageRemaining ?? 0} left before the daily reset. Google may apply other project-wide limits outside Pinkslip.
                      </div>
                    {:else}
                      <div style="color: var(--color-ink-4);">Live remaining quota is not exposed by this provider.</div>
                    {/if}
                  </div>
                {/if}
              </div>

              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                <button
                  class="btn-secondary"
                  type="button"
                  style="display: inline-flex; align-items: center; gap: 7px;"
                  onclick={saveLocalSetup}
                  disabled={savingLocalSetup}
                >
                  {savingLocalSetup ? "Saving..." : "Save local setup"}
                </button>
                <button
                  class="btn-secondary"
                  type="button"
                  style="display: inline-flex; align-items: center; gap: 7px;"
                  onclick={() => window.open("https://aistudio.google.com/app/apikey", "_blank", "noopener,noreferrer")}
                >
                  <ArrowSquareOut size={16} />
                  Get Gemini key
                </button>
              </div>
            </div>

            <div style="height: 0.5px; background: var(--color-line);"></div>

            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <div>
                  <div style="font-size: 14px; font-weight: 500;">Resume source</div>
                  <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">
                    Upload a PDF, markdown, or plain-text resume. PDFs work when their text is selectable.
                  </div>
                </div>
                {#if localResume}
                  <span class="tag">{localResume.canTailor ? "ready" : "stored"}</span>
                {/if}
              </div>

              <input
                bind:this={resumeUploadInput}
                type="file"
                accept=".txt,.md,.markdown,.pdf,.rtf"
                style="display: none;"
                onchange={handleResumeUpload}
              />

              {#if localResume}
                <div style="margin-top: 12px; padding: 14px; border-radius: 12px; border: 1px solid var(--color-line-2); background: var(--color-bg-sunken); display: flex; flex-direction: column; gap: 8px;">
                  <div style="font-size: 14px; font-weight: 600;">{localResume.fileName}</div>
                  <div style="font-size: 12px; color: var(--color-ink-3);">
                    {formatFileSize(localResume.size)} · added {new Date(localResume.uploadedAt).toLocaleDateString()}
                  </div>
                  <div style="font-size: 12px; color: var(--color-ink-3);">
                    {#if localResume.canTailor}
                      This file is ready for tailoring.
                    {:else if localResume.textFormat === "pdf"}
                      This PDF is saved, but we couldn’t extract selectable text from it. Try an exported text PDF, markdown, or plain text.
                    {:else}
                      This file is saved for viewing and download. Upload a PDF, markdown, or plain text to use it directly for tailoring.
                    {/if}
                  </div>
                  <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
                    <button
                      class="btn-secondary"
                      type="button"
                      style="display: inline-flex; align-items: center; gap: 7px;"
                      onclick={() => resumeUploadInput?.click()}
                    >
                      <UploadSimple size={16} />
                      Replace
                    </button>
                    <button
                      class="btn-secondary"
                      type="button"
                      style="display: inline-flex; align-items: center; gap: 7px;"
                      onclick={() => openLocalResume(localResume)}
                    >
                      <Eye size={16} />
                      View
                    </button>
                    <button
                      class="btn-secondary"
                      type="button"
                      style="display: inline-flex; align-items: center; gap: 7px;"
                      onclick={() => downloadLocalResume(localResume)}
                    >
                      <DownloadSimple size={16} />
                      Download
                    </button>
                    <button
                      class="btn-secondary"
                      type="button"
                      style="display: inline-flex; align-items: center; gap: 7px;"
                      onclick={removeLocalResume}
                    >
                      <Trash size={16} />
                      Remove
                    </button>
                  </div>
                </div>
              {:else}
                <div style="margin-top: 12px; padding: 14px; border-radius: 12px; border: 1px dashed var(--color-line-2); background: var(--color-bg-sunken); display: flex; flex-direction: column; gap: 10px;">
                  <div style="font-size: 13px; color: var(--color-ink-3);">
                    No local resume saved yet.
                  </div>
                  <div>
                    <button
                      class="btn-secondary"
                      type="button"
                      style="display: inline-flex; align-items: center; gap: 7px;"
                      onclick={() => resumeUploadInput?.click()}
                    >
                      <UploadSimple size={16} />
                      Upload resume
                    </button>
                  </div>
                </div>
              {/if}
            </div>

            {#if sessionState === "authenticated"}
              <div style="height: 0.5px; background: var(--color-line);"></div>

              <div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                  <div>
                    <div style="font-size: 14px; font-weight: 500;">Synced resume</div>
                    <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">
                      Keep one active resume on your account so it’s ready on your other devices.
                    </div>
                  </div>
                  <span class="tag">{remoteResume ? "account ready" : "not synced"}</span>
                </div>

                {#if remoteResume}
                  <div style="margin-top: 12px; padding: 14px; border-radius: 12px; border: 1px solid var(--color-line-2); background: var(--color-bg-sunken); display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-size: 14px; font-weight: 600;">{remoteResume.fileName}</div>
                    <div style="font-size: 12px; color: var(--color-ink-3);">
                      {formatFileSize(remoteResume.size)} · synced {new Date(remoteResume.uploadedAt).toLocaleDateString()}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                      <button class="btn-secondary" type="button" onclick={useSyncedResumeOnThisDevice}>
                        Use on this device
                      </button>
                      {#if localResume}
                        <button class="btn-secondary" type="button" onclick={() => void syncResumeToAccount(localResume)} disabled={syncingResume}>
                          {syncingResume ? "Syncing..." : "Replace with local copy"}
                        </button>
                      {/if}
                      <button class="btn-secondary" type="button" onclick={removeSyncedResume} disabled={removingSyncedResume}>
                        {removingSyncedResume ? "Removing..." : "Remove from account"}
                      </button>
                    </div>
                  </div>
                {:else}
                  <div style="margin-top: 12px; padding: 14px; border-radius: 12px; border: 1px dashed var(--color-line-2); background: var(--color-bg-sunken); display: flex; flex-direction: column; gap: 10px;">
                    <div style="font-size: 13px; color: var(--color-ink-3);">
                      Nothing is synced to your account yet.
                    </div>
                    {#if localResume}
                      <div>
                        <button class="btn-secondary" type="button" onclick={() => void syncResumeToAccount(localResume)} disabled={syncingResume}>
                          {syncingResume ? "Syncing..." : "Sync this resume"}
                        </button>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}

            <div style="height: 0.5px; background: var(--color-line);"></div>

            <div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px;">
              <div style="min-width: 0;">
                <div style="font-size: 14px; font-weight: 500;">Key source</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">
                  {#if hasLocalGeminiKey}
                    Tailor will use your saved Gemini key instead of the hidden app key.
                  {:else if features?.tailoring_enabled}
                    The hidden app key is available with {features.tailoring_model}.
                  {:else}
                    The hidden app key is not configured yet. Add your own Gemini key above to tailor.
                  {/if}
                </div>
              </div>
              <span class="tag" style="flex-shrink: 0;">{hasLocalGeminiKey ? "using yours" : features?.tailoring_enabled ? "app ready" : "app off"}</span>
            </div>
          </div>
        </section>
        {/if}

        {#if isAdmin && activeSettingsSection === "operations"}
        {#if productMetrics}
        <section>
          <div class="section-label" style="margin-bottom: 10px;">Product health · last 30 days</div>
          <div class="ops-metric-grid">
            <div class="ops-metric"><span>Job to alert</span><strong>{formatLatency(productMetrics.notification_latency_seconds)}</strong></div>
            <div class="ops-metric"><span>Alert open rate</span><strong>{productMetrics.notification_open_rate}%</strong></div>
            <div class="ops-metric"><span>Viable profiles</span><strong>{productMetrics.users_with_enough_matches}/{productMetrics.total_profiles}</strong></div>
            <div class="ops-metric"><span>Onboarding complete</span><strong>{productMetrics.onboarding_completion_rate}%</strong></div>
            <div class="ops-metric"><span>Fast apply clicks</span><strong>{productMetrics.apply_clicks_within_one_hour}</strong></div>
            <div class="ops-metric"><span>High-score dismiss</span><strong>{productMetrics.high_score_dismissal_rate}%</strong></div>
            <div class="ops-metric"><span>Tailor to apply</span><strong>{productMetrics.tailoring_to_application_rate}%</strong></div>
            <div class="ops-metric"><span>Profile adjustments</span><strong>{productMetrics.profile_adjustments}</strong></div>
            <div class="ops-metric"><span>Active feedback</span><strong>{productMetrics.open_feedback}</strong></div>
            <div class="ops-metric"><span>Open reports</span><strong>{productMetrics.open_reports}</strong></div>
          </div>
        </section>
        {/if}

        <section>
          <div class="section-label" style="margin-bottom: 10px;">Scorer rollout</div>
          <div class="surface-card-padded" style="display: flex; flex-direction: column; gap: 14px;">
            {#if scorerRollouts.length === 0}
              <div style="font-size: 13px; color: var(--color-ink-3);">No candidate scorer is configured.</div>
            {:else}
              {#each scorerRollouts as rollout}
                <div style="display: flex; flex-direction: column; gap: 10px;">
                  <div style="display: flex; justify-content: space-between; gap: 12px;">
                    <div>
                      <div style="font-size: 14px; font-weight: 600;">{rollout.scorer_version}</div>
                      <div style="font-size: 11px; color: var(--color-ink-3); margin-top: 3px;">
                        Shadow records comparisons. Active changes feed scores only for the selected cohort.
                      </div>
                    </div>
                    <span class="tag">{rollout.mode}</span>
                  </div>
                  <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px;">
                    <div>
                      <label class="field-label" for="rollout-mode-{rollout.scorer_version}">Mode</label>
                      <select id="rollout-mode-{rollout.scorer_version}" class="input-field" bind:value={rollout.mode}>
                        <option value="off">Off</option>
                        <option value="shadow">Shadow</option>
                        <option value="active">Active</option>
                      </select>
                    </div>
                    <div>
                      <label class="field-label" for="rollout-cohort-{rollout.scorer_version}">Cohort %</label>
                      <input
                        id="rollout-cohort-{rollout.scorer_version}"
                        class="input-field"
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        bind:value={rollout.cohort_percent}
                      />
                    </div>
                  </div>
                  <button
                    class="btn-secondary"
                    onclick={() => saveRollout(rollout)}
                    disabled={updatingRollout !== null}
                  >
                    {updatingRollout === rollout.scorer_version ? "Updating..." : "Apply rollout"}
                  </button>
                  {#each productMetrics?.scorer_audits.filter((audit) => audit.candidate_version === rollout.scorer_version) ?? [] as audit}
                    <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3);">
                      {audit.comparisons} comparisons · avg {audit.average_delta >= 0 ? "+" : ""}{audit.average_delta} · {audit.major_disagreements} major disagreements
                    </div>
                  {/each}
                </div>
              {/each}
            {/if}
          </div>
        </section>

        <section>
          <div class="section-label" style="margin-bottom: 10px;">Feedback inbox</div>
          <div class="surface-list">
            {#if feedbackInbox.length === 0}
              <div style="padding: 18px; font-size: 13px; color: var(--color-ink-3);">No active suggestions.</div>
            {:else}
              {#each feedbackInbox as item, index}
                <div style="padding: 14px 16px; {index > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''}">
                  <div style="display: flex; justify-content: space-between; gap: 10px; align-items: flex-start;">
                    <div style="min-width: 0;">
                      <div style="font-size: 13.5px; font-weight: 600;">{item.title}</div>
                      <div style="font-size: 11.5px; color: var(--color-ink-3); margin-top: 3px;">
                        {item.user_name || "User"} · {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                      <span class="tag">{item.submission_type.replaceAll("_", " ")}</span>
                      {#if item.status === "planned"}
                        <span class="tag">planned</span>
                      {/if}
                    </div>
                  </div>
                  {#if item.details}
                    <div style="font-size: 12.5px; color: var(--color-ink-2); margin-top: 8px; line-height: 1.45; white-space: pre-wrap;">{item.details}</div>
                  {/if}
                  {#if item.careers_url}
                    <a
                      href={item.careers_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style="display: inline-block; font-size: 12px; color: var(--color-accent); margin-top: 8px; overflow-wrap: anywhere;"
                    >
                      Open careers page
                    </a>
                  {/if}
                  <div class="action-row compact" style="margin-top: 10px;">
                    <button class="btn-secondary" onclick={() => moderateFeedback(item.id, "declined")}>Decline</button>
                    {#if item.status !== "planned"}
                      <button class="btn-secondary" onclick={() => moderateFeedback(item.id, "planned")}>Plan</button>
                    {/if}
                    <button class="btn-primary btn-accent" onclick={() => moderateFeedback(item.id, "resolved")}>Resolve</button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </section>

        <section>
          <div class="section-label" style="margin-bottom: 10px;">Open reports</div>
          <div class="surface-list">
            {#if reports.length === 0}
              <div style="padding: 18px; font-size: 13px; color: var(--color-ink-3);">Nothing needs review.</div>
            {:else}
              {#each reports as report, index}
                <div style="padding: 14px 16px; {index > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''}">
                  <div style="display: flex; justify-content: space-between; gap: 10px;">
                    <div style="font-size: 13.5px; font-weight: 600;">
                      {report.job_title ?? report.company_name ?? "Unknown listing"}
                    </div>
                    <span class="tag">{report.report_type.replaceAll("_", " ")}</span>
                  </div>
                  {#if report.job_title && report.company_name}
                    <div style="font-size: 11.5px; color: var(--color-ink-3); margin-top: 3px;">{report.company_name}</div>
                  {/if}
                  {#if report.notes}
                    <div style="font-size: 12.5px; color: var(--color-ink-2); margin-top: 8px; line-height: 1.45;">{report.notes}</div>
                  {/if}
                  <div class="action-row compact" style="margin-top: 10px;">
                    <button class="btn-secondary" onclick={() => moderateReport(report.id, "dismissed")}>Dismiss</button>
                    <button class="btn-primary btn-accent" onclick={() => moderateReport(report.id, "resolved")}>Resolve</button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </section>

        <section>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">Operations</div>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line-2); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; flex-direction: column; align-items: stretch; gap: 12px;">
              <div>
                <div style="font-size: 14px; font-weight: 500;">Force refresh all companies</div>
                <div style="font-size: 12px; color: var(--color-ink-3); margin-top: 2px;">Runs the full poll loop right now for every active company.</div>
              </div>
              <button
                class="btn-secondary"
                style="width: 100%; height: 44px; padding: 0 14px;"
                disabled={refreshingAll}
                onclick={async () => {
                  refreshingAll = true;
                  error = null;
                  try {
                    const result = await api.ops.refreshAll();
                    refreshLog = result.log ?? [];
                    successMsg = `Polled ${result.companiesPolled} companies · ${result.newJobsFound} new jobs`;
                    await loadSettings();
                    setTimeout(() => (successMsg = null), 3000);
                  } catch (e: any) {
                    error = e.message;
                  } finally {
                    refreshingAll = false;
                  }
                }}
              >
                {refreshingAll ? "Running..." : "Run now"}
              </button>
            </div>
            {#if refreshLog.length > 0}
              <div style="padding: 12px 14px; border-radius: 12px; background: var(--color-bg-sunken); border: 1px solid var(--color-line-2); font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); display: flex; flex-direction: column; gap: 4px;">
                {#each refreshLog.slice(0, 8) as line}
                  <div>{line}</div>
                {/each}
              </div>
            {/if}
          </div>
        </section>

        <section>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">Recent fetch runs</div>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line-2); border-radius: 14px; overflow: hidden;">
            {#if runs.length === 0}
              <div style="padding: 18px; font-size: 13px; color: var(--color-ink-3);">
                No fetch runs yet.
              </div>
            {:else}
              {#each runs.slice(0, 12) as run, index}
                <div style="padding: 14px 16px; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; min-width: 0; {index > 0 ? 'border-top: 0.5px solid var(--color-line);' : ''}">
                  <div style="min-width: 0; flex: 1;">
                    <div style="font-size: 13.5px; font-weight: 600; text-transform: capitalize;">
                      {run.status} · {run.new_jobs_found} new · {run.companies_succeeded}/{run.companies_attempted}
                    </div>
                    <div style="font-size: 11.5px; color: var(--color-ink-3); margin-top: 4px; font-family: var(--font-mono);">
                      {new Date(run.started_at).toLocaleString()} · {run.duration_ms ?? 0}ms
                    </div>
                    {#if run.errors_json}
                      <div style="font-size: 11.5px; color: var(--color-bad); margin-top: 6px; overflow-wrap: anywhere;">
                        {run.errors_json}
                      </div>
                    {/if}
                  </div>
                  <span class="tag" style="align-self: flex-start;">{run.notifications_sent} pushes</span>
                </div>
              {/each}
            {/if}
          </div>
        </section>
        {/if}

        <!-- Save -->
        {#if activeSettingsSection === "profile" || activeSettingsSection === "jobs" || activeSettingsSection === "notifications"}
        <button
          class="btn-primary btn-accent"
          style="width: 100%;"
          onclick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save preferences"}
        </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if showFeedbackForm}
  <div class="modal-backdrop" role="presentation" onclick={() => { if (!submittingFeedback) showFeedbackForm = false; }}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      use:focusTrap
      aria-labelledby="feedback-form-title"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => { if (event.key === "Escape" && !submittingFeedback) showFeedbackForm = false; }}
    >
      <div id="feedback-form-title" class="h-display" style="font-size: 22px; margin-bottom: 6px;">
        Send feedback
      </div>
      <p style="font-size: 12px; color: var(--color-ink-3); line-height: 1.5; margin-bottom: 16px;">
        Small frustrations and ambitious ideas are both useful. Tell us what would make your job search faster.
      </p>
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
          <div style="padding: 10px 12px; border-radius: 12px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); font-size: 12px;">
            {feedbackError}
          </div>
        {/if}
      </div>
      <div class="action-row" style="margin-top: 16px;">
        <button class="btn-secondary" onclick={() => { showFeedbackForm = false; }} disabled={submittingFeedback}>Cancel</button>
        <button
          class="btn-primary btn-accent"
          onclick={submitProductFeedback}
          disabled={submittingFeedback || feedbackTitle.trim().length < 2}
        >
          {submittingFeedback ? "Sending..." : "Send feedback"}
        </button>
      </div>
    </div>
  </div>
{/if}
