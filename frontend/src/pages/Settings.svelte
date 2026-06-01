<script lang="ts">
  import { fly } from "svelte/transition";
  import { onMount } from "svelte";
  import { api, type AppFeatures, type FetchRun, type TailorUsage } from "../lib/api";
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
  import { registerPush, syncExistingPushSubscription } from "../lib/push";
  import { navigate } from "../router";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
  import Eye from "phosphor-svelte/lib/Eye";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import Trash from "phosphor-svelte/lib/Trash";
  import UploadSimple from "phosphor-svelte/lib/UploadSimple";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import CaretDown from "phosphor-svelte/lib/CaretDown";

  const DEFAULTS = {
    locations: "Remote, New York, San Francisco, Bay Area, Chicago, Boston, Washington DC, Seattle, Austin",
    roleKeywords: "software engineer, fullstack, backend, frontend, forward deployed engineer",
    negativeKeywords: "senior, sr, lead, staff, principal, director, vice president, vp, head of, manager, intern",
    minYoe: 0,
    maxYoe: 2,
    notificationThreshold: 50,
  } as const;

  let enablingPush: boolean = $state(false);
  let loading: boolean = $state(true);
  let saving: boolean = $state(false);
  let error: string | null = $state(null);
  let successMsg: string | null = $state(null);

  let displayName: string = $state("");
  let savedDisplayName: string = $state("");
  let locations: string = $state("");
  let roleKeywords: string = $state("");
  let negativeKeywords: string = $state("");
  let minYoe: number = $state(0);
  let maxYoe: number = $state(10);
  let notificationThreshold: number = $state(50);
  let pushStatus: string = $state("disabled");
  let testingNotif: string | null = $state(null);
  let features: AppFeatures | null = $state(null);
  let runs: FetchRun[] = $state([]);
  let refreshingAll: boolean = $state(false);
  let refreshLog: string[] = $state([]);
  let localGeminiKey: string = $state("");
  let localGeminiModel: string = $state(DEFAULT_TAILOR_MODEL);
  let localResume = $state<LocalResumeAsset | null>(null);
  let tailorUsage: TailorUsage | null = $state(null);
  let showGeminiKey: boolean = $state(false);
  let savingLocalSetup: boolean = $state(false);
  let resumeUploadInput: HTMLInputElement | null = $state(null);
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
    { label: "Companies", sub: "Manage the shared watchlist", path: "/companies" },
    { label: "Resume Profile", sub: "Structured resume data for tailoring", path: "/resume" },
  ] as const;

  const settingsSections: { id: SettingsSection; label: string; sub: string }[] = [
    { id: "profile", label: "Profile", sub: "Identity" },
    { id: "jobs", label: "Jobs", sub: "Search rules" },
    { id: "tailoring", label: "Tailor", sub: "Resume setup" },
    { id: "notifications", label: "Notify", sub: "Alerts" },
    { id: "operations", label: "Ops", sub: "Fetch runs" },
  ];

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
      const [prefsResult, meResult, runsResult] = await Promise.allSettled([
        api.preferences.get(),
        api.me.get(),
        api.runs.list(50),
      ]);

      if (meResult.status === "fulfilled") {
        displayName = meResult.value.user?.name ?? "";
        savedDisplayName = meResult.value.user?.name ?? "";
        features = meResult.value.features ?? null;
      } else {
        throw meResult.reason;
      }

      if (prefsResult.status === "fulfilled") {
        const prefs = prefsResult.value;
        locations = ((prefs.locations as string[] | undefined) ?? []).join(", ");
        roleKeywords = ((prefs.role_keywords as string[] | undefined) ?? []).join(", ");
        negativeKeywords = ((prefs.negative_keywords as string[] | undefined) ?? []).join(", ");
        minYoe = (prefs.min_yoe as number | undefined) ?? 0;
        maxYoe = (prefs.max_yoe as number | undefined) ?? 10;
        notificationThreshold = (prefs.notify_threshold as number | undefined)
          ?? (prefs.notification_threshold as number | undefined)
          ?? 50;
      } else {
        throw prefsResult.reason;
      }

      if (runsResult.status === "fulfilled") {
        runs = runsResult.value.runs ?? [];
      } else {
        runs = [];
      }

      if ("serviceWorker" in navigator && "PushManager" in window) {
        navigator.serviceWorker.ready.then(async (reg) => {
          const sub = await reg.pushManager.getSubscription();
          pushStatus = sub ? "enabled" : "disabled";
          if (sub) {
            await syncExistingPushSubscription().catch(() => false);
          }
        });
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

  onMount(() => {
    hydrateLocalSetup();
    void refreshSavedResumeText().catch(() => undefined);
    void loadTailorUsage();
    loadSettings();
  });

  function parseList(str: string): string[] {
    return str.split(",").map((s) => s.trim()).filter(Boolean);
  }

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

      await api.preferences.update({
        locations: parseList(locations),
        role_keywords: parseList(roleKeywords),
        negative_keywords: parseList(negativeKeywords),
        min_yoe: minYoe,
        max_yoe: maxYoe,
        notify_threshold: notificationThreshold,
      });
      successMsg = "Preferences saved.";
      setTimeout(() => (successMsg = null), 3000);
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  function resetToDefaults() {
    locations = DEFAULTS.locations;
    roleKeywords = DEFAULTS.roleKeywords;
    negativeKeywords = DEFAULTS.negativeKeywords;
    minYoe = DEFAULTS.minYoe;
    maxYoe = DEFAULTS.maxYoe;
    notificationThreshold = DEFAULTS.notificationThreshold;
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

        <div class="settings-section-tabs" role="tablist" aria-label="Profile settings sections">
          {#each settingsSections as section}
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
        {/if}

        <!-- Job Preferences -->
        {#if activeSettingsSection === "jobs"}
        <section>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">Job preferences</div>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line-2); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 16px;">
            <div>
              <label for="locations" style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block;">Locations</label>
              <input id="locations" type="text" class="input-field" placeholder="Remote, NYC, SF" bind:value={locations} />
              <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); margin-top: 4px; display: block;">Comma-separated</span>
            </div>
            <div>
              <label for="role-keywords" style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block;">Role keywords</label>
              <input id="role-keywords" type="text" class="input-field" placeholder="Software Engineer, SWE, Fullstack" bind:value={roleKeywords} />
              <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); margin-top: 4px; display: block;">Comma-separated</span>
            </div>
            <div>
              <label for="neg-keywords" style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block;">Negative keywords</label>
              <input id="neg-keywords" type="text" class="input-field" placeholder="Intern, Sales, Senior Staff" bind:value={negativeKeywords} />
              <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); margin-top: 4px; display: block;">Jobs with these words score lower</span>
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <button class="btn-secondary" style="height: 36px; padding: 0 14px;" onclick={resetToDefaults}>
                Reset defaults
              </button>
            </div>
          </div>
        </section>

        <!-- Experience -->
        <section>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">Experience range</div>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line-2); border-radius: 14px; padding: 18px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label for="min-yoe" style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block;">Min YOE</label>
                <input id="min-yoe" type="number" class="input-field" min="0" max="20" bind:value={minYoe} />
              </div>
              <div>
                <label for="max-yoe" style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block;">Max YOE</label>
                <input id="max-yoe" type="number" class="input-field" min="0" max="20" bind:value={maxYoe} />
              </div>
            </div>
          </div>
        </section>
        {/if}

        <!-- Notifications -->
        {#if activeSettingsSection === "notifications"}
        <section>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-3); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 10px;">Notifications</div>
          <div style="background: var(--color-bg-elev); border: 1px solid var(--color-line-2); border-radius: 14px; overflow: hidden;">
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
                        const ok = await registerPush();
                        pushStatus = ok ? "enabled" : "disabled";
                        if (!ok) error = "Push permission denied or not supported";
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
                <div style="font-size: 14px; font-weight: 500;">Score threshold</div>
                <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--color-accent);">
                  {notificationThreshold}
                </span>
              </div>
              <input type="range" min="0" max="100" step="5" style="width: 100%;" bind:value={notificationThreshold} />
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

        {#if activeSettingsSection === "operations"}
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
