<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "../router";
  import { api, type Job, type Tailoring } from "../lib/api";
  import { parseQaSections, renderMarkdownHtml } from "../lib/formatting";
  import {
    DEFAULT_TAILOR_MODEL,
    getLocalResumeTailorText,
    getLocalResumeSourceTex,
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
    tailoredResumePdfFileName,
  } from "../lib/pdf-resume";
  import { buildTailoredResumeTex } from "../lib/latex-resume";
  import { buildTailoredResumeTypst } from "../lib/typst-resume";
  import ArrowLeft from "phosphor-svelte/lib/ArrowLeft";
  import Copy from "phosphor-svelte/lib/Copy";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import ArrowsClockwise from "phosphor-svelte/lib/ArrowsClockwise";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";

  let { jobId }: { jobId: string | null } = $props();

  type TabId = "resume" | "cover" | "qa";

  let loading = $state(true);
  let streaming = $state(false);
  let saving = $state(false);
  let error: string | null = $state(null);
  let job: Job | null = $state(null);
  let tailoring: Tailoring | null = $state(null);
  let localKit: LocalTailorKit | null = $state(null);
  let localDraft: LocalTailorDraft | null = $state(null);
  let rawStream = $state("");
  let resumeText = $state("");
  let coverText = $state("");
  let qaText = $state("");
  let activeTab: TabId = $state("resume");
  let editing = $state<Record<TabId, boolean>>({
    resume: false,
    cover: false,
    qa: false,
  });
  let saveTimer: number | null = $state(null);
  let tokenSummary = $state<{ input: number; output: number } | null>(null);
  let localResumeText = $derived.by(() => getLocalResumeTailorText(localKit));
  let sourceTex = $derived.by(() => getLocalResumeSourceTex(localKit));
  let usingLocalRequest = $derived.by(() => {
    return Boolean(localKit?.apiKey.trim() || localResumeText);
  });
  let activeModel = $derived.by(() => {
    if (usingLocalRequest) {
      return localKit?.model?.trim() || DEFAULT_TAILOR_MODEL;
    }
    return tailoring?.model ?? null;
  });
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
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function streamTailoring() {
    if (!jobId || streaming) return;
    streaming = true;
    error = null;
    rawStream = "";
    tokenSummary = null;
    editing = { resume: false, cover: false, qa: false };

    try {
      const requestInit: RequestInit = {
        method: "POST",
        credentials: "include",
      };

      if (usingLocalRequest) {
        requestInit.headers = { "Content-Type": "application/json" };
        requestInit.body = JSON.stringify({
          provider: localKit?.provider ?? "gemini",
          api_key: localKit?.apiKey.trim() || undefined,
          model: localKit?.model.trim() || DEFAULT_TAILOR_MODEL,
          resume_md: localResumeText || undefined,
        });
      }

      const res = await fetch(`/api/tailor/${jobId}`, {
        ...requestInit,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
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
    } catch (e: any) {
      error = e.message;
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
    } catch (e: any) {
      error = e.message;
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

  async function handleRegenerate() {
    if (streaming) return;

    if (resumeText || coverText || qaText || tailoring) {
      const confirmed = window.confirm(
        hasPendingEdits
          ? "Regenerating will create a new version. Your current edits will be saved first so you can come back to them. Continue?"
          : localResumeText
            ? "Generate a fresh version from your browser-local resume and this job?"
            : "Generate a fresh version from the current corpus and this job?"
      );
      if (!confirmed) return;
    }

    clearQueuedSave();
    if (hasPendingEdits && (tailoring || usingLocalRequest)) {
      const savedOkay = await saveEdits();
      if (!savedOkay) return;
    }

    await streamTailoring();
  }

  async function copyCurrent() {
    await navigator.clipboard.writeText(currentText);
  }

  async function downloadResumePdf() {
    if (!resumeText.trim()) {
      error = "Generate or paste a resume draft before downloading PDF.";
      return;
    }

    try {
      const fileName = tailoredResumePdfFileName(job?.company_name, job?.title);
      const bytes = sourceTex
        ? await api.tailor.renderPdf(
            buildTailoredResumeTex(resumeText, {
              companyName: job?.company_name,
              jobTitle: job?.title,
              sourceTex,
            }),
            fileName,
            "latex"
          )
        : await api.tailor.renderPdf(
            buildTailoredResumeTypst(resumeText, {
              companyName: job?.company_name,
              jobTitle: job?.title,
            }),
            fileName,
            "typst"
          ).catch(async (renderError) => {
            if (renderError?.message?.includes("not configured")) {
              return buildTailoredResumePdf(resumeText);
            }
            throw renderError;
          });

      downloadPdfBytes(fileName, bytes);
    } catch (e: any) {
      error = e.message ?? "Could not build the resume PDF";
    }
  }

  onMount(() => {
    let cancelled = false;

    (async () => {
      localKit = await refreshLocalTailorKitResume().catch(() => loadLocalTailorKit());
      if (cancelled) return;
      await loadExisting();
      if (cancelled) return;
      if (!tailoring && !localDraft) {
        void streamTailoring();
      }
    })();

    return () => {
      cancelled = true;
      clearQueuedSave();
    };
  });
</script>

<div class="page" style="padding-top: 0;">
  <header class="page-replacement-header" style="justify-content: flex-start; padding-left: 18px; padding-right: 18px;">
    <button class="icon-btn" aria-label="Back" onclick={() => navigate(jobId ? `/jobs/${jobId}` : "/")}>
      <ArrowLeft size={18} />
    </button>
    <div style="min-width: 0; flex: 1;">
      <div style="font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        {job?.company_name ?? "Preparing"}{#if job?.title} · {job.title}{/if}
      </div>
    </div>
  </header>

  <div style="padding: 0 22px 28px;">
    {#if error}
      <div style="padding: 14px 16px; border-radius: 14px; margin-bottom: 14px; background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad);">
        {error}
      </div>
    {/if}

    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
      {#each [
        { id: "resume", label: "Resume" },
        { id: "cover", label: "Cover" },
        { id: "qa", label: "QA" },
      ] as tab}
        <button
          class={activeTab === tab.id ? "chip chip-active" : "chip"}
          onclick={() => activeTab = tab.id as TabId}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <div class="stat-row" style="margin-bottom: 14px;">
      <span>{localResumeText ? "browser-local resume" : localKit?.apiKey.trim() ? "shared corpus + your key" : "shared corpus"}</span>
      {#if streaming}
        <span>streaming live</span>
      {/if}
      {#if saving}
        <span>saving edits</span>
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
        Copy
      </button>
      {#if activeTab === "resume"}
        <button
          class="btn-secondary"
          style="height: 40px; padding: 0 14px;"
          onclick={downloadResumePdf}
          disabled={!resumeDownloadReady}
        >
          <DownloadSimple size={15} />
          Download PDF
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
        <span class:spin={streaming} style="display: inline-flex;">
          <ArrowsClockwise size={15} />
        </span>
        {streaming ? "Working..." : "Regenerate"}
      </button>
    </div>

    {#if loading}
      <div style="padding: 48px 0; text-align: center; color: var(--color-ink-3);">
        Loading...
      </div>
    {:else}
      <div style="border-radius: 18px; border: 1px solid var(--color-line); background: var(--color-bg-elev); overflow: hidden;">
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
