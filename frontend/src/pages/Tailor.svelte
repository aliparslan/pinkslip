<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import { api, type Job, type Tailoring } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { hapticSuccess } from "../lib/haptics";
  import { parseQaSections, renderMarkdownHtml } from "../lib/formatting";
  import { setPendingSettingsSection } from "../lib/settings-section";
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
  import ArrowLeft from "phosphor-svelte/lib/ArrowLeft";
  import ArrowSquareOut from "phosphor-svelte/lib/ArrowSquareOut";
  import Copy from "phosphor-svelte/lib/Copy";
  import MagicWand from "phosphor-svelte/lib/MagicWand";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import ArrowsClockwise from "phosphor-svelte/lib/ArrowsClockwise";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
  import Spinner from "../components/Spinner.svelte";

  let { jobId = null }: { jobId?: string | null } = $props();

  type TabId = "resume" | "cover" | "qa";

  let loading = $state(true);
  let streaming = $state(false);
  let saving = $state(false);
  let error: string | null = $state(null);
  // Tailoring has no usable API key (neither personal nor app-wide). Rendered
  // as a setup card with a path forward, not a raw error string.
  let setupNeeded = $state(false);
  let job: Job | null = $state(null);
  let tailoring: Tailoring | null = $state(null);
  let localKit: LocalTailorKit | null = $state(null);
  let localDraft: LocalTailorDraft | null = $state(null);
  let rawStream = $state("");
  let resumeText = $state("");
  let coverText = $state("");
  let qaText = $state("");
  let activeTab: TabId = $state("resume");
  let copied = $state(false);
  let downloadingPdf = $state(false);
  let showRegenerateConfirm = $state(false);
  let editing = $state<Record<TabId, boolean>>({
    resume: false,
    cover: false,
    qa: false,
  });
  let copyTimer: number | null = null;
  let saveTimer: number | null = null;
  let tokenSummary = $state<{ input: number; output: number } | null>(null);
  let localResumeText = $derived.by(() => getLocalResumeTailorText(localKit));
  let usingLocalRequest = $derived.by(() => {
    return Boolean(localKit?.apiKey.trim() || localResumeText);
  });
  let activeModel = $derived.by(() => {
    return localKit?.model?.trim() || tailoring?.model || DEFAULT_TAILOR_MODEL;
  });
  let hasAnyOutput = $derived(
    Boolean(resumeText || coverText || qaText || tailoring || localDraft)
  );
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
      } else {
        const tailorRes = await api.tailor.get(jobId);
        hydrateFromTailoring(tailorRes.tailoring);
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
        return true;
      }

      if (!tailoring) return false;

      const saved = await api.tailor.save(tailoring.id, {
        user_edited_resume_md: resumeText,
        user_edited_cover_md: coverText,
        user_edited_qa_json: qaText,
      });
      hydrateFromTailoring(saved.tailoring);
      return true;
    } catch (e) {
      error = errorMessage(e);
      return false;
    } finally {
      saving = false;
    }
  }

  function queueSave() {
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
      return "Regenerating creates a new version. Your current edits are saved first so you can come back to them.";
    }
    return localResumeText
      ? "Generate a fresh version from your browser-local resume and this job?"
      : "Generate a fresh version from your profile and this job?";
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
    setPendingSettingsSection("tailoring");
    navigate("/profile");
  }

  async function copyCurrent() {
    await navigator.clipboard.writeText(currentText);
    copied = true;
    if (copyTimer !== null) {
      window.clearTimeout(copyTimer);
    }
    copyTimer = window.setTimeout(() => {
      copied = false;
      copyTimer = null;
    }, 1400);
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
      if (copyTimer !== null) {
        window.clearTimeout(copyTimer);
      }
    };
  });
</script>

<div class="page" style="padding-top: 0;">
  <header class="page-replacement-header" style="justify-content: flex-start; padding-left: 18px; padding-right: 18px;">
    <button class="icon-btn" aria-label="Back" onclick={() => { if (!requestBack()) navigate(jobId ? `/jobs/${jobId}` : "/"); }}>
      <ArrowLeft size={18} />
    </button>
    <div style="min-width: 0; flex: 1;">
      <div style="font-size: var(--fs-md); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        <!-- Single expression: Svelte trims the leading space at an {#if}
             boundary, which used to render "Company· Title". -->
        {job?.title ? `${job?.company_name ?? "Preparing"} · ${job.title}` : job?.company_name ?? "Preparing"}
      </div>
    </div>
  </header>

  <div class="tailor-page-body">
    {#if error}
      <div class="alert alert-error" style="margin-bottom: 14px;">
        {error}
      </div>
    {/if}

    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else if setupNeeded}
      <!-- Tailoring isn't configured: a setup path, not a dead end. -->
      <div class="surface-card-padded" style="display: flex; flex-direction: column; gap: 12px;">
        <h2 class="h-display h-display-sm">Set up tailoring</h2>
        <p style="margin: 0; font-size: var(--fs-md); line-height: 1.55; color: var(--color-ink-2);">
          Tailoring writes a resume, cover letter, and interview prep for this exact job.
          It needs a free Gemini API key — adding yours takes about two minutes:
        </p>
        <ol style="margin: 0; padding-left: 20px; font-size: var(--fs-sm); line-height: 1.7; color: var(--color-ink-2);">
          <li>Grab a free key from Google AI Studio.</li>
          <li>Paste it in Profile → Tailor and save.</li>
          <li>Come back here and generate.</li>
        </ol>
        <div class="action-row compact" style="flex-wrap: wrap; margin-top: 4px;">
          <button class="btn-primary btn-accent" style="padding: 0 16px;" onclick={openTailorSettings}>
            Open Tailor settings
          </button>
          <a
            class="btn-secondary"
            style="text-decoration: none;"
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowSquareOut size={16} />
            Get a free key
          </a>
        </div>
      </div>
    {:else if !hasAnyOutput && !streaming}
      <!-- First visit for this job: explicit generate (it spends quota). -->
      <div class="surface-card-padded" style="display: flex; flex-direction: column; gap: 12px;">
        <h2 class="h-display h-display-sm">Tailor for this job</h2>
        <p style="margin: 0; font-size: var(--fs-md); line-height: 1.55; color: var(--color-ink-2);">
          One tap writes a tailored resume, cover letter, and interview prep from
          {localResumeText ? "your uploaded resume" : "your resume profile"} and this job's description.
          You can edit everything afterwards.
        </p>
        <div>
          <button class="btn-primary btn-accent" style="padding: 0 18px;" onclick={() => void startGeneration()}>
            <MagicWand size={17} />
            Generate
          </button>
        </div>
      </div>
    {:else}
      <!-- Document tabs are view switching, not value selection, so they wear
           the segmented-control language (ink), same as the feed sort. -->
      <div class="feed-control-row" style="margin-bottom: 12px;">
        <div class="sort-segmented" role="tablist" aria-label="Tailor output tabs">
          {#each [
            { id: "resume", label: "Resume" },
            { id: "cover", label: "Cover" },
            { id: "qa", label: "QA" },
          ] as tab}
            <button
              class:active={activeTab === tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onclick={() => activeTab = tab.id as TabId}
            >
              {tab.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="stat-row" style="margin-bottom: 14px;">
        <span>{localResumeText ? "browser-local resume" : localKit?.apiKey.trim() ? "your profile + your key" : "your profile"}</span>
        {#if streaming}
          <span>streaming live</span>
        {/if}
        {#if saving}
          <span class="loading-label"><Spinner size={12} /> saving edits</span>
        {/if}
        {#if tokenSummary}
          <span>{tokenSummary.input} in / {tokenSummary.output} out</span>
        {/if}
        {#if activeModel}
          <span>{activeModel}</span>
        {/if}
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
        <button class="btn-secondary" style="height: 40px; padding: 0 14px;" onclick={copyCurrent}>
          <Copy size={15} />
          {copied ? "Copied" : "Copy"}
        </button>
        {#if activeTab === "resume"}
          <button
            class="btn-secondary"
            style="height: 40px; padding: 0 14px;"
            onclick={viewResumePdf}
            disabled={!resumeDownloadReady || downloadingPdf}
          >
            {#if downloadingPdf}<Spinner />{:else}<DownloadSimple size={15} />{/if}
            View PDF
          </button>
        {/if}
        <button
          class="btn-secondary"
          style="height: 40px; padding: 0 14px;"
          onclick={() => editing = { ...editing, [activeTab]: !editing[activeTab] }}
        >
          <PencilSimple size={15} />
          {editing[activeTab] ? "Stop editing" : "Edit"}
        </button>
        <button class="btn-secondary" style="height: 40px; padding: 0 14px;" onclick={handleRegenerate} disabled={streaming}>
          {#if streaming}<Spinner />{:else}<ArrowsClockwise size={15} />{/if}
          Regenerate
        </button>
      </div>

      <div style="border-radius: var(--radius-lg); border: 1px solid var(--color-line); background: var(--color-bg-elev); overflow: hidden;">
        {#if editing.resume && activeTab === "resume"}
          <textarea class="input-field tailor-textarea" bind:value={resumeText} oninput={queueSave}></textarea>
        {:else if editing.cover && activeTab === "cover"}
          <textarea class="input-field tailor-textarea" bind:value={coverText} oninput={queueSave}></textarea>
        {:else if editing.qa && activeTab === "qa"}
          <textarea class="input-field tailor-textarea" bind:value={qaText} oninput={queueSave}></textarea>
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
      <button class="btn-secondary" onclick={() => (showRegenerateConfirm = false)}>Cancel</button>
      <button class="btn-primary btn-accent" style="flex: 1;" onclick={() => void startGeneration()}>
        Regenerate
      </button>
    </div>
  </Modal>
{/if}
