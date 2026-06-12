<script lang="ts">
  // Tailoring setup: Gemini key + model, the device-local resume file, and the
  // account-synced resume copy. Owns all of that state and its persistence.
  import { onMount } from "svelte";
  import { api, type AppFeatures, type ResumeAssetRecord, type TailorUsage } from "../../lib/api";
  import { errorMessage } from "../../lib/utils";
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
  } from "../../lib/local-tailor";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
  import Eye from "phosphor-svelte/lib/Eye";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import Trash from "phosphor-svelte/lib/Trash";
  import UploadSimple from "phosphor-svelte/lib/UploadSimple";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Spinner from "../../components/Spinner.svelte";

  let {
    sessionState,
    features,
    onError,
    onSuccess,
  }: {
    sessionState: "guest" | "authenticated";
    features: AppFeatures | null;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
  } = $props();

  let localGeminiKey: string = $state("");
  let localGeminiModel: string = $state(DEFAULT_TAILOR_MODEL);
  let localResume = $state<LocalResumeAsset | null>(null);
  let remoteResume: ResumeAssetRecord | null = $state(null);
  let tailorUsage: TailorUsage | null = $state(null);
  let showGeminiKey: boolean = $state(false);
  let savingLocalSetup: boolean = $state(false);
  let syncingResume: boolean = $state(false);
  let removingSyncedResume: boolean = $state(false);
  let resumeUploadInput: HTMLInputElement | null = $state(null);

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

  async function loadRemoteResume() {
    if (sessionState !== "authenticated") {
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
      onSuccess("Extracted text from saved PDF. Resume is ready for tailoring.");
    }
  }

  async function loadTailorUsage() {
    tailorUsage = await api.tailor.usage(localGeminiModel).then((res) => res.usage).catch(() => null);
  }

  async function saveLocalSetup() {
    savingLocalSetup = true;
    try {
      saveLocalTailorKit({
        provider: "gemini",
        apiKey: localGeminiKey.trim(),
        model: localGeminiModel.trim() || DEFAULT_TAILOR_MODEL,
        resume: localResume,
      });
      hydrateLocalSetup();
      await loadTailorUsage();
      onSuccess("Private tailoring setup saved on this device.");
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      savingLocalSetup = false;
    }
  }

  async function handleResumeUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      const asset = await createLocalResumeAsset(file);
      localResume = asset;
      updateLocalTailorKit({ resume: asset });
      onSuccess(`${asset.fileName} saved on this device.`);
      if (sessionState === "authenticated") {
        await syncResumeToAccount(asset).catch(() => undefined);
      }
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      if (input) input.value = "";
    }
  }

  function removeLocalResume() {
    localResume = null;
    updateLocalTailorKit({ resume: null });
    onSuccess("Local resume removed.");
  }

  async function syncResumeToAccount(asset = localResume) {
    if (sessionState !== "authenticated" || !asset) return;
    syncingResume = true;
    try {
      const result = await api.resumeAssets.upload({
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        size: asset.size,
        dataUrl: asset.dataUrl,
        extractedText: asset.textContent,
      });
      remoteResume = result.asset;
      onSuccess("Resume synced to your account.");
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      syncingResume = false;
    }
  }

  async function useSyncedResumeOnThisDevice() {
    const next = remoteResume ? localResumeFromRemote(remoteResume) : null;
    if (!next) return;
    localResume = next;
    updateLocalTailorKit({ resume: next });
    onSuccess("Using your synced resume on this device.");
  }

  async function removeSyncedResume() {
    removingSyncedResume = true;
    try {
      await api.resumeAssets.deleteActive();
      remoteResume = null;
      onSuccess("Removed the synced resume from your account.");
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      removingSyncedResume = false;
    }
  }

  onMount(() => {
    hydrateLocalSetup();
    void refreshSavedResumeText().catch(() => undefined);
    void loadTailorUsage();
    void loadRemoteResume();
  });
</script>

<section>
  <h2 class="section-eyebrow">Tailoring</h2>
  <div class="surface-card" style="padding: 18px; display: flex; flex-direction: column; gap: 16px;">
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px;">
      <div style="min-width: 0;">
        <div style="font-size: var(--fs-md); font-weight: 500;">Gemini setup</div>
        <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 2px;">
          Your Gemini key is optional and overrides the app key when present. Resume files stay on this device until you run Tailor.
        </div>
      </div>
      <span class="tag" style="flex-shrink: 0;">{localSetupLabel}</span>
    </div>

    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div>
        <label for="gemini-key" class="field-label">Gemini API key override</label>
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
        <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 6px;">
          {#if hasLocalGeminiKey}
            Saved on this device and used for Tailor instead of the app key.
          {:else}
            Leave blank to use the app key when available.
          {/if}
        </div>
      </div>

      <div>
        <label for="gemini-model" class="field-label">Model</label>
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
        <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 6px;">
          The list only includes models we want this app to use. Pro/paid-only models are intentionally omitted.
        </div>
        {#if tailorUsage}
          <div class="usage-meter" aria-label="Tailoring API usage">
            <div style="display: flex; justify-content: space-between; gap: 12px; align-items: baseline;">
              <span>{hasLocalGeminiKey ? "Your key in pinkslip today" : "App key today"}</span>
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
                {activeUsageRemaining ?? 0} left before the daily reset. Google may apply other project-wide limits outside pinkslip.
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
          onclick={saveLocalSetup}
          disabled={savingLocalSetup}
        >
          {#if savingLocalSetup}<Spinner />{/if}
          Save local setup
        </button>
        <button
          class="btn-secondary"
          type="button"
          onclick={() => window.open("https://aistudio.google.com/app/apikey", "_blank", "noopener,noreferrer")}
        >
          <ArrowSquareOut size={16} />
          Get Gemini key
        </button>
      </div>
    </div>

    <div class="divider"></div>

    <div>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div>
          <div style="font-size: var(--fs-md); font-weight: 500;">Resume source</div>
          <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 2px;">
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
        <div style="margin-top: 12px; padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--color-line-2); background: var(--color-bg-sunken); display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: var(--fs-md); font-weight: 600;">{localResume.fileName}</div>
          <div style="font-size: var(--fs-xs); color: var(--color-ink-3);">
            {formatFileSize(localResume.size)} · added {new Date(localResume.uploadedAt).toLocaleDateString()}
          </div>
          <div style="font-size: var(--fs-xs); color: var(--color-ink-3);">
            {#if localResume.canTailor}
              This file is ready for tailoring.
            {:else if localResume.textFormat === "pdf"}
              This PDF is saved, but we couldn’t extract selectable text from it. Try an exported text PDF, markdown, or plain text.
            {:else}
              This file is saved for viewing and download. Upload a PDF, markdown, or plain text to use it directly for tailoring.
            {/if}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
            <button class="btn-secondary" type="button" onclick={() => resumeUploadInput?.click()}>
              <UploadSimple size={16} />
              Replace
            </button>
            <button class="btn-secondary" type="button" onclick={() => openLocalResume(localResume)}>
              <Eye size={16} />
              View
            </button>
            <button class="btn-secondary" type="button" onclick={() => downloadLocalResume(localResume)}>
              <DownloadSimple size={16} />
              Download
            </button>
            <button class="btn-secondary" type="button" onclick={removeLocalResume}>
              <Trash size={16} />
              Remove
            </button>
          </div>
        </div>
      {:else}
        <div style="margin-top: 12px; padding: 14px; border-radius: var(--radius-md); border: 1px dashed var(--color-line-2); background: var(--color-bg-sunken); display: flex; flex-direction: column; gap: 10px;">
          <div style="font-size: var(--fs-sm); color: var(--color-ink-3);">
            No local resume saved yet.
          </div>
          <div>
            <button class="btn-secondary" type="button" onclick={() => resumeUploadInput?.click()}>
              <UploadSimple size={16} />
              Upload resume
            </button>
          </div>
        </div>
      {/if}
    </div>

    {#if sessionState === "authenticated"}
      <div class="divider"></div>

      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div>
            <div style="font-size: var(--fs-md); font-weight: 500;">Synced resume</div>
            <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 2px;">
              Keep one active resume on your account so it’s ready on your other devices.
            </div>
          </div>
          <span class="tag">{remoteResume ? "account ready" : "not synced"}</span>
        </div>

        {#if remoteResume}
          <div style="margin-top: 12px; padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--color-line-2); background: var(--color-bg-sunken); display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: var(--fs-md); font-weight: 600;">{remoteResume.fileName}</div>
            <div style="font-size: var(--fs-xs); color: var(--color-ink-3);">
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
          <div style="margin-top: 12px; padding: 14px; border-radius: var(--radius-md); border: 1px dashed var(--color-line-2); background: var(--color-bg-sunken); display: flex; flex-direction: column; gap: 10px;">
            <div style="font-size: var(--fs-sm); color: var(--color-ink-3);">
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

    <div class="divider"></div>

    <div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px;">
      <div style="min-width: 0;">
        <div style="font-size: var(--fs-md); font-weight: 500;">Key source</div>
        <div style="font-size: var(--fs-xs); color: var(--color-ink-3); margin-top: 2px;">
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
