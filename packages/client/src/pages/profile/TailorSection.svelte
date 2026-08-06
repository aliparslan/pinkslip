<script lang="ts">
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
    showHeading = true,
  }: {
    sessionState: "anonymous" | "guest" | "authenticated";
    features: AppFeatures | null;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
    showHeading?: boolean;
  } = $props();

  let localGeminiKey: string = $state("");
  let localGeminiModel: string = $state(DEFAULT_TAILOR_MODEL);
  let localResume = $state<LocalResumeAsset | null>(null);
  let remoteResume: ResumeAssetRecord | null = $state(null);
  let tailorUsage: TailorUsage | null = $state(null);
  let showGeminiKey: boolean = $state(false);
  let savingLocalSetup: boolean = $state(false);
  let syncingResume: boolean = $state(false);
  let removingResume: boolean = $state(false);
  let resumeUploadInput: HTMLInputElement | null = $state(null);

  let hasLocalGeminiKey = $derived(Boolean(localGeminiKey.trim()));
  let tailoringSetupReady = $derived.by(() =>
    Boolean(hasLocalGeminiKey || (features !== null && features.tailoring_enabled))
  );
  let localSetupLabel = $derived.by(() => {
    if (tailoringSetupReady) return hasLocalGeminiKey ? "Your key" : "Included";
    return "Needs setup";
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
      onSuccess("Tailoring settings saved on this device.");
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

  async function removeResume() {
    removingResume = true;
    try {
      if (sessionState === "authenticated" && remoteResume) {
        await api.resumeAssets.deleteActive();
      }
      remoteResume = null;
      localResume = null;
      updateLocalTailorKit({ resume: null });
      onSuccess("Resume removed.");
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      removingResume = false;
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
  {#if showHeading}<h2 class="section-eyebrow">Tailoring</h2>{/if}
  <div class="content-card stack-lg">
    <div class="split-row start">
      <div class="flex-fill">
        <div class="row-title">AI tailoring</div>
        <div class="helper-text">
          {#if hasLocalGeminiKey}
            Using your Gemini key on this device.
          {:else if features?.tailoring_enabled}
            Included tailoring is ready.
          {:else}
            Add a Gemini key to enable tailoring.
          {/if}
        </div>
      </div>
      <span class="tag">{localSetupLabel}</span>
    </div>

    <div class="stack-md">
      <div>
        <label for="gemini-key" class="field-label">Gemini API key</label>
        <div class="field-action">
          <input
            id="gemini-key"
            type={showGeminiKey ? "text" : "password"}
            class="input-field flex-fill"
            placeholder="AIza..."
            bind:value={localGeminiKey}
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            class="icon-btn icon-btn-surface field-action-control"
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
        {#if hasLocalGeminiKey}
          <div class="helper-text field-help">Stored on this device.</div>
        {/if}
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
        {#if tailorUsage}
          <div class="usage-meter" aria-label="Tailoring API usage">
            <div class="split-row baseline">
              <span>{hasLocalGeminiKey ? "Your usage today" : "Included uses today"}</span>
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
              <div class="usage-meter-note">
                {activeUsageRemaining ?? 0} left today
              </div>
            {:else}
              <div class="usage-meter-note">No app limit</div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="action-grid">
        <button
          class="btn-primary"
          type="button"
          onclick={saveLocalSetup}
          disabled={savingLocalSetup}
        >
          {#if savingLocalSetup}<Spinner />{/if}
          Save settings
        </button>
        <button
          class="btn-secondary"
          type="button"
          onclick={() => window.open("https://aistudio.google.com/app/apikey", "_blank", "noopener,noreferrer")}
        >
          <ArrowSquareOut size={16} />
          Get API key
        </button>
      </div>
    </div>

    <div class="divider"></div>

    <div>
      <div class="split-row">
        <div class="flex-fill">
          <div class="row-title">Resume</div>
        </div>
        {#if localResume}
          <span class="tag">{remoteResume ? "synced" : localResume.canTailor ? "ready" : "stored"}</span>
        {/if}
      </div>

      <input
        bind:this={resumeUploadInput}
        type="file"
        accept=".txt,.md,.markdown,.pdf,.rtf"
        class="visually-hidden-input"
        onchange={handleResumeUpload}
      />

      {#if localResume}
        <div class="inset-panel">
          <div class="inset-panel-title">{localResume.fileName}</div>
          <div class="inset-panel-meta">
            {formatFileSize(localResume.size)} · added {new Date(localResume.uploadedAt).toLocaleDateString()}
          </div>
          {#if !localResume.canTailor}
            <div class="inset-panel-meta">
              {localResume.textFormat === "pdf"
                ? "No selectable text found. Try an exported PDF, markdown, or text file."
                : "Upload a PDF, markdown, or text file to tailor from it."}
            </div>
          {/if}
          <div class="action-grid compact inset-panel-actions">
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
            {#if sessionState === "authenticated" && !remoteResume}
              <button class="btn-secondary" type="button" onclick={() => void syncResumeToAccount(localResume)} disabled={syncingResume}>
                {syncingResume ? "Syncing…" : "Sync"}
              </button>
            {/if}
            <button class="btn-secondary btn-danger" type="button" onclick={() => void removeResume()} disabled={removingResume}>
              <Trash size={16} />
              {removingResume ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      {:else}
        <div class="inset-panel empty">
          <div class="surface-empty-copy">
            No resume uploaded.
          </div>
          <div>
            <button class="btn-secondary full-width" type="button" onclick={() => resumeUploadInput?.click()}>
              <UploadSimple size={16} />
              Upload resume
            </button>
          </div>
        </div>
      {/if}
    </div>

  </div>
</section>
