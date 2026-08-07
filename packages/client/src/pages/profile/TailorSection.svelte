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
  import Key from "phosphor-svelte/lib/Key";
  import Trash from "phosphor-svelte/lib/Trash";
  import UploadSimple from "phosphor-svelte/lib/UploadSimple";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import Modal from "../../components/Modal.svelte";
  import Spinner from "../../components/Spinner.svelte";
  import { feedback } from "../../lib/feedback.svelte";
  import { isIosApp } from "../../lib/platform";
  import { navigate } from "../../router";

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
  let localSetupSaveTimer: number | null = null;
  let localSetupSaveFailed = false;
  let previewResume: LocalResumeAsset | null = $state(null);
  const nativeIos = isIosApp();

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
  let includedUsageCount = $derived.by(() => {
    if (!tailorUsage) return 0;
    return tailorUsage.included_user_today;
  });
  let includedUsageRemaining = $derived.by(() => {
    if (!tailorUsage) return null;
    return tailorUsage.included_user_remaining ?? null;
  });
  let includedUsageLimit = $derived(
    includedUsageRemaining === null ? null : includedUsageCount + includedUsageRemaining,
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

  function persistLocalSetup(): boolean {
    try {
      saveLocalTailorKit({
        provider: "gemini",
        apiKey: localGeminiKey.trim(),
        model: localGeminiModel.trim() || DEFAULT_TAILOR_MODEL,
        resume: localResume,
      });
      localSetupSaveFailed = false;
      return true;
    } catch (caught) {
      if (!localSetupSaveFailed) {
        onError(errorMessage(caught, "Could not save tailoring settings on this device."));
      }
      localSetupSaveFailed = true;
      return false;
    }
  }

  function queueLocalSetupSave() {
    if (!nativeIos) return;
    if (localSetupSaveTimer !== null) window.clearTimeout(localSetupSaveTimer);
    localSetupSaveTimer = window.setTimeout(() => {
      localSetupSaveTimer = null;
      persistLocalSetup();
    }, 350);
  }

  function flushLocalSetupSave() {
    if (localSetupSaveTimer === null) return;
    window.clearTimeout(localSetupSaveTimer);
    localSetupSaveTimer = null;
    persistLocalSetup();
  }

  function updateGeminiKey(value: string) {
    localGeminiKey = value;
    queueLocalSetupSave();
  }

  function updateGeminiModel(value: string) {
    localGeminiModel = value;
    if (nativeIos) persistLocalSetup();
    void loadTailorUsage();
  }

  async function saveLocalSetup() {
    savingLocalSetup = true;
    try {
      if (!persistLocalSetup()) return;
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
    const removedLocal = localResume;
    const removedRemote = remoteResume;
    removingResume = true;
    try {
      if (sessionState === "authenticated" && remoteResume) {
        await api.resumeAssets.deleteActive();
      }
      remoteResume = null;
      localResume = null;
      previewResume = null;
      updateLocalTailorKit({ resume: null });
      if (nativeIos && removedLocal) {
        feedback.show({
          message: "Tailoring resume removed",
          action: {
            label: "Undo",
            run: async () => {
              localResume = removedLocal;
              updateLocalTailorKit({ resume: removedLocal });
              if (sessionState === "authenticated" && removedRemote) {
                const restored = await api.resumeAssets.upload({
                  fileName: removedLocal.fileName,
                  mimeType: removedLocal.mimeType,
                  size: removedLocal.size,
                  dataUrl: removedLocal.dataUrl,
                  extractedText: removedLocal.textContent,
                });
                remoteResume = restored.asset;
              }
            },
          },
        });
      } else {
        onSuccess("Resume removed.");
      }
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      removingResume = false;
    }
  }

  function viewResume(asset: LocalResumeAsset | null) {
    if (!asset) return;
    if (nativeIos) {
      previewResume = asset;
      return;
    }
    openLocalResume(asset);
  }

  onMount(() => {
    hydrateLocalSetup();
    void refreshSavedResumeText().catch(() => undefined);
    void loadTailorUsage();
    void loadRemoteResume();
    return () => flushLocalSetupSave();
  });
</script>

{#snippet apiKeyField()}
  <div>
    <label for="gemini-key" class="field-label">Gemini API key</label>
    <div class="field-action">
      <input
        id="gemini-key"
        type={showGeminiKey ? "text" : "password"}
        class="input-field flex-fill"
        placeholder="AIza..."
        value={localGeminiKey}
        oninput={(event) => updateGeminiKey(event.currentTarget.value)}
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
    {#if hasLocalGeminiKey && !nativeIos}
      <div class="helper-text field-help">Stored on this device.</div>
    {/if}
  </div>
{/snippet}

{#snippet modelField(showUsage: boolean)}
  <div>
    <label for="gemini-model" class="field-label">Model</label>
    <div class="select-field-wrap">
      <select
        id="gemini-model"
        class="input-field"
        value={localGeminiModel}
        onchange={(event) => updateGeminiModel(event.currentTarget.value)}
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
    {#if showUsage && tailorUsage}
      {@render usageProgress(
        hasLocalGeminiKey ? "Your usage today" : "Included uses today",
        activeUsageCount ?? 0,
        tailorUsage.daily_limit,
        activeUsageRemaining,
        false,
      )}
    {/if}
  </div>
{/snippet}

{#snippet usageProgress(label: string, count: number, limit: number | null, remaining: number | null, prominent: boolean)}
  <div class="usage-meter" class:usage-meter-prominent={prominent}>
    <div class="split-row baseline">
      <span>{label}</span>
      <strong>
        {count}{#if limit !== null}/{limit}{/if}
      </strong>
    </div>
    {#if limit !== null}
      <div
        class="usage-meter-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin="0"
        aria-valuemax={limit}
        aria-valuenow={Math.min(count, limit)}
      >
        <div
          class="usage-meter-fill"
          style="width: {Math.min(100, (count / Math.max(1, limit)) * 100)}%;"
        ></div>
      </div>
      <div class="usage-meter-note">{remaining ?? 0} left today</div>
    {:else}
      <div class="usage-meter-note">No app limit</div>
    {/if}
  </div>
{/snippet}

<section>
  {#if showHeading}<h2 class="section-eyebrow">Tailoring</h2>{/if}
  <div class="content-card stack-lg tailor-settings-content">
    {#if nativeIos}
      <section class="tailor-settings-group" aria-labelledby="ai-tailoring-title">
        <h2 id="ai-tailoring-title" class="tailor-settings-title">AI tailoring</h2>
        <p class="helper-text">
          {features?.tailoring_enabled
            ? "Create tailored application drafts without adding a provider key."
            : "Included tailoring is unavailable right now. You can still use your own key."}
        </p>
        {#if tailorUsage && includedUsageLimit !== null && features?.tailoring_enabled}
          {@render usageProgress(
            "Free uses today",
            includedUsageCount,
            includedUsageLimit,
            includedUsageRemaining,
            true,
          )}
        {/if}
      </section>

      <details class="tailor-byok">
        <summary>
          <h2 class="tailor-settings-title tailor-disclosure-heading">
            <span class="tailor-disclosure-copy">
              <span>Need more?</span>
              <small class="helper-text">
                {hasLocalGeminiKey ? "Using your Gemini key for tailoring." : "Add your own Gemini key when included uses run out."}
              </small>
            </span>
            <CaretDown size={17} aria-hidden="true" />
          </h2>
        </summary>
        <div class="stack-md tailor-byok-body">
          {@render apiKeyField()}
          <button
            class="btn-secondary full-width"
            type="button"
            aria-label="Get a Gemini API key"
            onclick={() => window.open("https://aistudio.google.com/app/apikey", "_blank", "noopener,noreferrer")}
          >
            <Key size={16} weight="bold" />
            Get
          </button>
          <details class="tailor-model-advanced">
            <summary>
              <h3>
                <span>Advanced</span>
                <CaretDown size={16} aria-hidden="true" />
              </h3>
            </summary>
            <div class="tailor-model-body">{@render modelField(false)}</div>
          </details>
        </div>
      </details>
    {:else}
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

      <details class="tailor-advanced" open>
        <div class="stack-md">
          {@render apiKeyField()}
          {@render modelField(true)}
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
      </details>
    {/if}

    <div class="divider"></div>

    <section class="tailor-settings-group tailoring-resume" aria-labelledby="tailoring-resume-title">
      <div class="split-row">
        <div class="flex-fill">
          <h2
            id="tailoring-resume-title"
            class="row-title resume-settings-heading"
            class:tailor-settings-title={nativeIos}
          >{nativeIos ? "Tailoring resume" : "Resume"}</h2>
        </div>
        {#if localResume && !nativeIos}
          <span class="tag">{remoteResume ? "synced" : localResume.canTailor ? "ready" : "stored"}</span>
        {/if}
      </div>

      {#if nativeIos}
        <p class="helper-text">An uploaded file is used instead of your structured resume when tailoring.</p>
        <button class="btn-secondary full-width" type="button" onclick={() => navigate("/you/resume")}>Edit structured resume</button>
      {/if}

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
            <button class="btn-secondary" type="button" onclick={() => viewResume(localResume)}>
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
    </section>

  </div>
</section>

{#if previewResume}
  <Modal
    title={previewResume.fileName}
    maxWidth={720}
    initialFocus="dialog"
    onclose={() => (previewResume = null)}
  >
    <div class="resume-preview">
      {#if previewResume.textFormat === "pdf"}
        <iframe
          class="resume-preview-frame"
          src={previewResume.dataUrl}
          title="Preview of {previewResume.fileName}"
        ></iframe>
      {:else if previewResume.textContent}
        <pre class="resume-preview-text">{previewResume.textContent}</pre>
      {:else}
        <p class="body-copy">This file cannot be previewed here. Download it to open it on your device.</p>
      {/if}
      <div class="action-row resume-preview-actions">
        <button class="btn-secondary flex-fill" type="button" onclick={() => downloadLocalResume(previewResume)}>
          <DownloadSimple size={16} />
          Download
        </button>
        <button class="btn-primary flex-fill" type="button" onclick={() => (previewResume = null)}>Done</button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  details.tailor-advanced { display: contents; }

  :global(html.native-ios) .tailor-settings-content {
    padding: 0;
    gap: var(--space-8);
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  :global(html.native-ios) .tailor-settings-content > :global(.divider) {
    display: none;
  }

  :global(html.native-ios) .tailor-settings-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .tailor-settings-title {
    margin: 0;
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.3;
  }

  .resume-settings-heading {
    margin: 0;
  }

  .usage-meter-prominent {
    margin-top: var(--space-3);
    padding: var(--space-4);
    border-color: var(--color-line);
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-ink);
    font-family: var(--font-sans);
    font-size: var(--fs-xs);
  }

  .usage-meter-prominent :global(.usage-meter-note) {
    color: var(--color-accent-soft-ink);
  }

  .tailor-byok > summary,
  .tailor-model-advanced > summary {
    list-style: none;
    cursor: pointer;
  }

  .tailor-byok > summary::-webkit-details-marker,
  .tailor-model-advanced > summary::-webkit-details-marker {
    display: none;
  }

  .tailor-byok > summary {
    min-height: var(--tap-min);
  }

  .tailor-disclosure-heading {
    width: 100%;
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .tailor-disclosure-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .tailor-disclosure-copy :global(.helper-text) {
    display: block;
    margin-top: var(--space-1);
  }

  .tailor-disclosure-heading > :global(svg),
  .tailor-model-advanced h3 > :global(svg) {
    flex: none;
    color: var(--color-ink-4);
  }

  .tailor-byok[open] > summary .tailor-disclosure-heading > :global(svg),
  .tailor-model-advanced[open] > summary h3 > :global(svg) {
    transform: rotate(180deg);
  }

  .tailor-byok-body {
    padding-top: var(--space-4);
  }

  .tailor-model-advanced {
    margin-top: var(--space-2);
  }

  .tailor-model-advanced > summary {
    min-height: var(--tap-min);
  }

  .tailor-model-advanced h3 {
    width: 100%;
    min-height: var(--tap-min);
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    color: var(--color-ink-2);
    font-family: var(--font-display);
    font-size: var(--fs-base);
    font-weight: 600;
    line-height: 1.3;
  }

  .tailor-model-body {
    padding-top: var(--space-2);
  }

  :global(html.native-ios) .tailoring-resume :global(.inset-panel) {
    margin-top: var(--space-4);
    padding: 0;
    gap: var(--space-3);
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .resume-preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .resume-preview-frame {
    width: 100%;
    min-height: 58dvh;
    border: 1px solid var(--color-line-2);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
  }

  .resume-preview-text {
    max-height: 58dvh;
    overflow: auto;
    margin: 0;
    padding: var(--space-4);
    border: 1px solid var(--color-line-2);
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    color: var(--color-ink-2);
    font: 400 var(--fs-sm) / 1.55 var(--font-sans);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .resume-preview-actions {
    margin-top: 0;
  }
</style>
