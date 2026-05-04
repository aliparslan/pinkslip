<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "../router";
  import { api, type Job, type Tailoring } from "../lib/api";
  import ArrowLeft from "phosphor-svelte/lib/ArrowLeft";
  import Copy from "phosphor-svelte/lib/Copy";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import ArrowsClockwise from "phosphor-svelte/lib/ArrowsClockwise";

  let { jobId }: { jobId: string | null } = $props();

  type TabId = "resume" | "cover" | "qa";

  let loading = $state(true);
  let streaming = $state(false);
  let saving = $state(false);
  let error: string | null = $state(null);
  let job: Job | null = $state(null);
  let tailoring: Tailoring | null = $state(null);
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

  async function loadExisting() {
    if (!jobId) return;
    loading = true;
    error = null;
    try {
      const [jobRes, tailorRes] = await Promise.all([
        api.jobs.get(jobId),
        api.tailor.get(jobId),
      ]);
      job = jobRes;
      hydrateFromTailoring(tailorRes.tailoring);
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
      const res = await fetch(`/api/tailor/${jobId}`, {
        method: "POST",
        credentials: "include",
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
            const latest = await api.tailor.get(jobId);
            hydrateFromTailoring(latest.tailoring);
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

  async function saveEdits() {
    if (!tailoring || saving) return;
    saving = true;
    try {
      const saved = await api.tailor.save(tailoring.id, {
        user_edited_resume_md: resumeText,
        user_edited_cover_md: coverText,
        user_edited_qa_json: qaText,
      });
      hydrateFromTailoring(saved.tailoring);
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  function queueSave() {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(() => {
      saveEdits();
    }, 900);
  }

  async function copyCurrent() {
    const text = activeTab === "resume" ? resumeText : activeTab === "cover" ? coverText : qaText;
    await navigator.clipboard.writeText(text);
  }

  onMount(() => {
    loadExisting().then(() => {
      if (!tailoring) {
        streamTailoring();
      }
    });
    return () => {
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
      }
    };
  });
</script>

<div class="page">
  <header style="padding: 8px 22px 14px; display: flex; align-items: center; gap: 10px;">
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
      {#if streaming}
        <span>streaming live</span>
      {/if}
      {#if saving}
        <span>saving edits</span>
      {/if}
      {#if tokenSummary}
        <span>{tokenSummary.input} in / {tokenSummary.output} out</span>
      {/if}
      {#if tailoring?.model}
        <span>{tailoring.model}</span>
      {/if}
    </div>

    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
      <button class="btn-secondary" style="height: 40px; padding: 0 14px;" onclick={copyCurrent}>
        <Copy size={15} />
        Copy
      </button>
      <button
        class="btn-secondary"
        style="height: 40px; padding: 0 14px;"
        onclick={() => editing = { ...editing, [activeTab]: !editing[activeTab] }}
      >
        <PencilSimple size={15} />
        {editing[activeTab] ? "Stop editing" : "Edit"}
      </button>
      <button class="btn-secondary" style="height: 40px; padding: 0 14px;" onclick={streamTailoring} disabled={streaming}>
        <span class:spin={streaming} style="display: inline-flex;">
          <ArrowsClockwise size={15} />
        </span>
        {streaming ? "Working..." : "Regenerate"}
      </button>
    </div>

    {#if loading}
      <div style="padding: 48px 0; text-align: center; color: var(--color-ink-3); font-family: var(--font-mono);">
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
          <pre class="tailor-output">{activeTab === "resume" ? resumeText : activeTab === "cover" ? coverText : qaText}</pre>
        {/if}
      </div>
    {/if}
  </div>
</div>
