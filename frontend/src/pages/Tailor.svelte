<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import { api, type Job, type Tailoring } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { hapticSuccess } from "../lib/haptics";
  import { parseQaSections, renderMarkdownHtml } from "../lib/formatting";
  import {
    DEFAULT_TAILOR_MODEL,
    getLocalResumeTailorText,
    loadLocalTailorDraft,
    loadLocalTailorKit,
    refreshLocalTailorKitResume,
    saveLocalTailorDraft,
    type LocalTailorDraft,
    type LocalTailorKit,
  } from "../lib/local-tailor";
  import {
    buildTailoredResumePdf,
    downloadPdfBytes,
    openPdfInNewTab,
    tailoredResumePdfFileName,
  } from "../lib/pdf-resume";
  import Modal from "../components/Modal.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import Copy from "phosphor-svelte/lib/Copy";
  import MagicWand from "phosphor-svelte/lib/MagicWand";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import ArrowsClockwise from "phosphor-svelte/lib/ArrowsClockwise";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
  import Spinner from "../components/Spinner.svelte";
  import SaveStatus from "../components/SaveStatus.svelte";
  import { SavePresentation } from "../lib/task-presentation.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import { DropdownMenu } from "bits-ui";
  import DotsThree from "phosphor-svelte/lib/DotsThree";

  let { jobId = null }: { jobId?: string | null } = $props();

  type TabId = "resume" | "cover" | "qa";
  const outputTabs: { id: TabId; label: string }[] = [
    { id: "resume", label: "Resume" },
    { id: "cover", label: "Cover letter" },
    { id: "qa", label: "Interview" },
  ];

  let loading = $state(true);
  let streaming = $state(false);
  let saving = $state(false);
  let error: string | null = $state(null);
  // Tailoring has no usable API key (neither personal nor app-wide). Rendered
  // as a setup card with a path forward, not a raw error string.
  let setupNeeded = $state(false);
  let signInNeeded = $state(false);
  let job: Job | null = $state(null);
  let tailoring: Tailoring | null = $state(null);
  let localKit: LocalTailorKit | null = $state(null);
  let localDraft: LocalTailorDraft | null = $state(null);
  let rawStream = $state("");
  let resumeText = $state("");
  let coverText = $state("");
  let qaText = $state("");
  let activeTab: TabId = $state("resume");
  let downloadingPdf = $state(false);
  let showRegenerateConfirm = $state(false);
  let editing = $state<Record<TabId, boolean>>({
    resume: false,
    cover: false,
    qa: false,
  });
  let saveTimer: number | null = null;
  const savePresentation = new SavePresentation();
  let tokenSummary = $state<{ input: number; output: number } | null>(null);
  let localResumeText = $derived.by(() => getLocalResumeTailorText(localKit));
  let usingLocalRequest = $derived.by(() => {
    return Boolean(localKit?.apiKey.trim() || localResumeText);
  });
  let hasAnyOutput = $derived(
    Boolean(resumeText || coverText || qaText || tailoring || localDraft)
  );

  function selectOutputTab(tab: TabId, moveFocus = false) {
    activeTab = tab;
    if (moveFocus) {
      window.requestAnimationFrame(() => {
        document.getElementById(`tailor-tab-${tab}`)?.focus();
      });
    }
  }

  function handleOutputTabKeydown(event: KeyboardEvent) {
    const current = outputTabs.findIndex((tab) => tab.id === activeTab);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % outputTabs.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + outputTabs.length) % outputTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = outputTabs.length - 1;
    else return;
    event.preventDefault();
    selectOutputTab(outputTabs[next].id, true);
  }
  let outputBaseline = $derived.by(() => {
    if (usingLocalRequest) {
      return {
        resume: localDraft?.resumeText ?? "",
        cover: localDraft?.coverText ?? "",
        qa: localDraft?.qaText ?? "",
      };
    }
    return {
      resume: tailoring?.resume_md_final ?? "",
      cover: tailoring?.cover_letter_md_final ?? "",
      qa: tailoring?.qa_json_final ?? "",
    };
  });

  function parseSections(text: string) {
    const normalized = text.includes("=== RESUME ===") ? text : `=== RESUME ===\n${text}`;
    const [, afterResume = ""] = normalized.split("=== RESUME ===");
    const [resume = "", afterCover = ""] = afterResume.split("=== COVER ===");
    const [cover = "", qa = ""] = afterCover.split("=== QA ===");
    return {
      resume: resume.trim(),
      cover: cover.trim(),
      qa: qa.trim(),
    };
  }

  function hydrateFromTailoring(next: Tailoring | null) {
    tailoring = next;
    localDraft = null;
    resumeText = next?.resume_md_final ?? "";
    coverText = next?.cover_letter_md_final ?? "";
    qaText = next?.qa_json_final ?? "";
    tokenSummary =
      next?.input_tokens || next?.output_tokens
        ? {
            input: next?.input_tokens ?? 0,
            output: next?.output_tokens ?? 0,
          }
        : null;
  }

  function hydrateFromLocalDraft(next: LocalTailorDraft | null) {
    tailoring = null;
    localDraft = next;
    resumeText = next?.resumeText ?? "";
    coverText = next?.coverText ?? "";
    qaText = next?.qaText ?? "";
    tokenSummary = next?.tokenSummary ?? null;
  }

  async function loadExisting() {
    if (!jobId) return;
    loading = true;
    error = null;
    try {
      job = await api.jobs.get(jobId);
      if (usingLocalRequest) {
        hydrateFromLocalDraft(loadLocalTailorDraft(jobId));
        savePresentation.hydrate(localDraft?.updatedAt ?? null);
      } else {
        const tailorRes = await api.tailor.get(jobId);
        hydrateFromTailoring(tailorRes.tailoring);
        savePresentation.hydrate(tailorRes.tailoring?.created_at ?? null);
      }
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }

  async function streamTailoring() {
    if (!jobId || streaming) return;
    streaming = true;
    error = null;
    setupNeeded = false;
    signInNeeded = false;
    rawStream = "";
    tokenSummary = null;
    editing = { resume: false, cover: false, qa: false };

    try {
      const requestInit: RequestInit = {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: localKit?.provider ?? "gemini",
          api_key: localKit?.apiKey.trim() || undefined,
          model: localKit?.model?.trim() || DEFAULT_TAILOR_MODEL,
          resume_md: localResumeText || undefined,
        }),
      };

      const res = await fetch(`/api/tailor/${jobId}`, {
        ...requestInit,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string; code?: string } | null;
        if (data?.code === "tailor_not_configured") {
          setupNeeded = true;
          return;
        }
        if (data?.code === "authentication_required") {
          signInNeeded = true;
          return;
        }
        throw new Error(data?.error ?? `Tailoring failed (${res.status})`);
      }
      if (!res.body) {
        throw new Error("Streaming response was empty");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");

        while (buffer.includes("\n\n")) {
          const boundary = buffer.indexOf("\n\n");
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const line = rawEvent
            .split("\n")
            .find((entry) => entry.startsWith("data:"));
          if (!line) continue;
          const payload = JSON.parse(line.slice(5).trim());

          if (payload.type === "chunk") {
            rawStream += payload.text ?? "";
            const parsed = parseSections(rawStream);
            resumeText = parsed.resume;
            coverText = parsed.cover;
            qaText = parsed.qa;
          } else if (payload.type === "done") {
            hapticSuccess();
            tokenSummary = {
              input: payload.tokens?.in ?? 0,
              output: payload.tokens?.out ?? 0,
            };
            if (usingLocalRequest) {
              const draft: LocalTailorDraft = {
                jobId,
                resumeText,
                coverText,
                qaText,
                model: localKit?.model?.trim() || DEFAULT_TAILOR_MODEL,
                updatedAt: new Date().toISOString(),
                tokenSummary,
              };
              saveLocalTailorDraft(draft);
              hydrateFromLocalDraft(draft);
            } else {
              const latest = await api.tailor.get(jobId);
              hydrateFromTailoring(latest.tailoring);
            }
          } else if (payload.type === "error") {
            throw new Error(payload.message ?? "Tailoring failed");
          }
        }
      }
    } catch (e) {
      error = errorMessage(e);
    } finally {
      streaming = false;
    }
  }

  async function saveEdits(): Promise<boolean> {
    if (saving) return false;
    saving = true;
    const presentationGeneration = savePresentation.begin();
    try {
      if (usingLocalRequest && jobId) {
        const draft: LocalTailorDraft = {
          jobId,
          resumeText,
          coverText,
          qaText,
          model: localKit?.model?.trim() || DEFAULT_TAILOR_MODEL,
          updatedAt: new Date().toISOString(),
          tokenSummary,
        };
        saveLocalTailorDraft(draft);
        hydrateFromLocalDraft(draft);
        savePresentation.succeed(presentationGeneration, draft.updatedAt);
        return true;
      }

      if (!tailoring) return false;

      const saved = await api.tailor.save(tailoring.id, {
        user_edited_resume_md: resumeText,
        user_edited_cover_md: coverText,
        user_edited_qa_json: qaText,
      });
      hydrateFromTailoring(saved.tailoring);
      savePresentation.succeed(presentationGeneration);
      return true;
    } catch (e) {
      const message = errorMessage(e);
      error = message;
      savePresentation.fail(presentationGeneration, message);
      return false;
    } finally {
      saving = false;
    }
  }

  function queueSave() {
    savePresentation.markDirty();
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void saveEdits();
    }, 900);
  }

  function clearQueuedSave() {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  let hasPendingEdits = $derived.by(() => {
    return (
      resumeText !== outputBaseline.resume
      || coverText !== outputBaseline.cover
      || qaText !== outputBaseline.qa
    );
  });

  let currentText = $derived.by(() => {
    if (activeTab === "resume") return resumeText;
    if (activeTab === "cover") return coverText;
    return qaText;
  });
  let currentPreviewHtml = $derived.by(() => {
    if (activeTab === "qa") return "";
    return renderMarkdownHtml(activeTab === "resume" ? resumeText : coverText);
  });
  let qaSections = $derived.by(() => parseQaSections(qaText));
  let resumeDownloadReady = $derived.by(() => {
    return Boolean(resumeText.trim() && !loading && !streaming && (tailoring || localDraft || tokenSummary));
  });
  let regenerateMessage = $derived.by(() => {
    if (hasPendingEdits) {
      return "Your edits will be saved before the new version is created.";
    }
    return localResumeText
      ? "Create a new version from your uploaded resume?"
      : "Create a new version from your resume profile?";
  });

  function handleRegenerate() {
    if (streaming) return;
    if (hasAnyOutput) {
      showRegenerateConfirm = true;
      return;
    }
    void startGeneration();
  }

  async function startGeneration() {
    showRegenerateConfirm = false;
    clearQueuedSave();
    if (hasPendingEdits && (tailoring || usingLocalRequest)) {
      const savedOkay = await saveEdits();
      if (!savedOkay) return;
    }
    await streamTailoring();
  }

  function openTailorSettings() {
    navigate("/you/tailoring");
  }

  async function copyCurrent() {
    await navigator.clipboard.writeText(currentText);
    feedback.success("Copied to clipboard");
  }

  async function viewResumePdf() {
    if (!resumeDownloadReady || downloadingPdf || !resumeText.trim()) {
      error = "Generate or paste a resume draft before viewing PDF.";
      return;
    }

    downloadingPdf = true;
    const preview = window.open("", "_blank");
    try {
      // Use the bundled renderer so resume content never executes remote compiler
      // code or depends on a CDN being available at download time.
      const bytes = await buildTailoredResumePdf(resumeText, { density: "compact" });
      if (!openPdfInNewTab(bytes, preview)) {
        downloadPdfBytes(
          tailoredResumePdfFileName(job?.company_name, job?.title),
          bytes
        );
      }
    } catch (e) {
      preview?.close();
      error = errorMessage(e, "Could not build the resume PDF");
    } finally {
      downloadingPdf = false;
    }
  }

  onMount(() => {
    let cancelled = false;

    (async () => {
      const kit = await refreshLocalTailorKitResume().catch(() => loadLocalTailorKit());
      localKit = kit;
      if (cancelled) return;
      await loadExisting();
      // No auto-generation: the first run costs quota, so it waits for an
      // explicit "Generate" tap (see the empty-state card below).
    })();

    return () => {
      cancelled = true;
      clearQueuedSave();
      savePresentation.destroy();
    };
  });
</script>

<div class="page pushed-screen">
  <ScreenNav
    title="Tailor"
    onBack={() => { if (!requestBack()) navigate(jobId ? `/jobs/${jobId}` : "/"); }}
  />

  <div class="tailor-page-body">
    {#if error}
      <div class="alert alert-error alert-spaced" role="alert">
        {error}
      </div>
    {/if}

    {#if job && !loading}
      <div class="tailor-job-context">
        <strong>{job.title}</strong>
        <span>{job.company_name}</span>
      </div>
    {/if}

    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else if signInNeeded}
      <div class="content-card stack-md tailor-setup-card">
        <h2>Sign in to tailor</h2>
        <p>Use included tailoring, or add a Gemini key.</p>
        <div class="action-grid card-actions">
          <button class="btn-primary btn-accent" onclick={() => navigate("/you/account")}>
            Sign in
          </button>
          <button class="btn-secondary" onclick={openTailorSettings}>Add Gemini key</button>
        </div>
      </div>
    {:else if setupNeeded}
      <div class="content-card stack-md tailor-setup-card">
        <h2>Add a Gemini key</h2>
        <p>Use a free Gemini API key for guest tailoring.</p>
        <div class="action-grid card-actions">
          <button class="btn-primary btn-accent" onclick={openTailorSettings}>
            Open Tailoring settings
          </button>
          <a
            class="btn-secondary button-link"
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowSquareOut size={16} />
            Get a key
          </a>
        </div>
      </div>
    {:else if !hasAnyOutput && !streaming}
      <div class="content-card stack-md tailor-setup-card">
        <h2>Create application drafts</h2>
        <p>Resume, cover letter, and interview prep.</p>
        <div class="tailor-source">Using {localResumeText ? "uploaded resume" : "resume profile"}</div>
        <div>
          <button class="btn-primary btn-accent full-width" onclick={() => void startGeneration()}>
            <MagicWand size={17} />
            Generate drafts
          </button>
        </div>
      </div>
    {:else}
      <div class="feed-control-row tailor-tabs">
        <div class="segmented-control" role="tablist" aria-label="Tailor output tabs">
          {#each outputTabs as tab}
            <button
              id={`tailor-tab-${tab.id}`}
              type="button"
              class:active={activeTab === tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="tailor-document-panel"
              tabindex={activeTab === tab.id ? 0 : -1}
              onclick={() => selectOutputTab(tab.id)}
              onkeydown={handleOutputTabKeydown}
            >
              {tab.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="tailor-workspace-bar">
        <div class="tailor-status">
          <span>{localResumeText ? "Uploaded resume" : "Resume profile"}</span>
          {#if streaming}<span>Writing…</span>{/if}
          <SaveStatus phase={savePresentation.phase} />
        </div>
        <div class="tailor-actions">
          <button class="btn-secondary" onclick={copyCurrent}>
          <Copy size={15} />
          Copy
          </button>
          <button
            class="btn-secondary"
            onclick={() => editing = { ...editing, [activeTab]: !editing[activeTab] }}
          >
            <PencilSimple size={15} />
            {editing[activeTab] ? "Done" : "Edit"}
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger class="btn-secondary tailor-more-trigger" aria-label="More tailoring actions">
              <DotsThree size={18} weight="bold" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                class="job-more-menu tailor-more-menu"
                side="bottom"
                align="end"
                sideOffset={6}
                collisionPadding={12}
                strategy="fixed"
              >
                {#if activeTab === "resume"}
                  <DropdownMenu.Item
                    class="job-more-menu-item"
                    disabled={!resumeDownloadReady || downloadingPdf}
                    onSelect={() => void viewResumePdf()}
                  >
                    {#if downloadingPdf}<Spinner />{:else}<DownloadSimple size={16} />{/if}
                    <span>View PDF</span>
                  </DropdownMenu.Item>
                {/if}
                <DropdownMenu.Item class="job-more-menu-item" disabled={streaming} onSelect={handleRegenerate}>
                  {#if streaming}<Spinner />{:else}<ArrowsClockwise size={16} />{/if}
                  <span>Regenerate</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div
        id="tailor-document-panel"
        class="tailor-document"
        role="tabpanel"
        aria-labelledby={`tailor-tab-${activeTab}`}
      >
        {#if editing.resume && activeTab === "resume"}
          <textarea aria-label="Tailored resume" class="input-field tailor-textarea" bind:value={resumeText} oninput={queueSave}></textarea>
        {:else if editing.cover && activeTab === "cover"}
          <textarea aria-label="Cover letter" class="input-field tailor-textarea" bind:value={coverText} oninput={queueSave}></textarea>
        {:else if editing.qa && activeTab === "qa"}
          <textarea aria-label="Interview preparation" class="input-field tailor-textarea" bind:value={qaText} oninput={queueSave}></textarea>
        {:else}
          {#if activeTab === "qa"}
            <div class="tailor-output prose-output">
              {#if qaSections.length === 0}
                <p>No interview prep has been generated yet.</p>
              {:else}
                {#each qaSections as section}
                  <section class="qa-block">
                    <h3>{section.label}</h3>
                    <div class="qa-block-body">{@html renderMarkdownHtml(section.body)}</div>
                  </section>
                {/each}
              {/if}
            </div>
          {:else}
            <div class="tailor-output prose-output">{@html currentPreviewHtml}</div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if showRegenerateConfirm}
  <Modal
    title="Regenerate?"
    subtitle={regenerateMessage}
    onclose={() => (showRegenerateConfirm = false)}
  >
    <div class="action-row">
      <button class="btn-secondary flex-fill" onclick={() => (showRegenerateConfirm = false)}>Cancel</button>
      <button class="btn-primary btn-accent flex-fill" onclick={() => void startGeneration()}>
        Regenerate
      </button>
    </div>
  </Modal>
{/if}

<style>
  .tailor-job-context {
    margin-bottom: 18px;
    display: grid;
    gap: 3px;
  }

  .tailor-job-context strong {
    color: var(--color-ink);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.3;
    text-wrap: balance;
  }

  .tailor-job-context span {
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
  }

  .tailor-setup-card h2 {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.3;
  }

  .tailor-setup-card p {
    margin: 0;
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    line-height: 1.5;
  }

  .tailor-source {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
  }

  .tailor-workspace-bar {
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .tailor-status {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
  }

  .tailor-actions {
    flex: none;
    display: flex;
    gap: 8px;
  }

  .tailor-actions > :global(button) {
    min-height: 40px;
    padding-inline: 12px;
    font-size: var(--fs-sm);
  }

  .tailor-actions :global(.tailor-more-trigger) {
    width: 40px;
    padding: 0;
    justify-content: center;
  }

  @media (max-width: 520px) {
    .tailor-workspace-bar {
      align-items: flex-end;
    }

    .tailor-status {
      display: grid;
      gap: 2px;
    }

    .tailor-actions > :global(button) {
      min-width: 40px;
      padding-inline: 10px;
    }
  }
</style>
