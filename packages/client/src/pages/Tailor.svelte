<script lang="ts">
  import { onMount } from "svelte";
  import ArrowDown from "phosphor-svelte/lib/ArrowDown";
  import ArrowUp from "phosphor-svelte/lib/ArrowUp";
  import Check from "phosphor-svelte/lib/Check";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
  import Eye from "phosphor-svelte/lib/Eye";
  import MagicWand from "phosphor-svelte/lib/MagicWand";
  import Plus from "phosphor-svelte/lib/Plus";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import X from "phosphor-svelte/lib/X";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import {
    api,
    type Job,
    type StructuredTailoring,
    type TailoredResume,
    type Tailoring,
  } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import {
    compileResumeDocument,
    type CompiledResumeDocument,
  } from "../lib/resume-document-client";
  import {
    RESUME_COMPILER_VERSION,
    RESUME_TEMPLATE_VERSION,
  } from "../lib/resume-document";
  import { downloadPdfBytes, tailoredResumePdfFileName } from "../lib/pdf-resume";
  import { registerAutosaveFlush } from "../lib/autosave-lifecycle";
  import { SavePresentation } from "../lib/task-presentation.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import Spinner from "../components/Spinner.svelte";
  import SaveStatus from "../components/SaveStatus.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import InlineFailure from "../components/InlineFailure.svelte";

  let { jobId = null }: { jobId?: string | null } = $props();

  type ViewId = "resume" | "preview";
  type DraftSection = "experience" | "projects";

  let loading = $state(true);
  let loaded = $state(false);
  let working = $state(false);
  let saving = $state(false);
  let exporting = $state(false);
  let compiling = $state(false);
  let error: string | null = $state(null);
  let job: Job | null = $state(null);
  let tailoring: Tailoring | null = $state(null);
  let selectedEvidenceIds: string[] = $state([]);
  let activeView: ViewId = $state("resume");
  let progressMessage = $state("Reading the role");
  let compiled: CompiledResumeDocument | null = $state(null);
  let previewUrl: string | null = $state(null);
  let saveTimer: number | null = null;
  let compileTimer: number | null = null;
  let progressTimer: number | null = null;
  let editRevision = 0;
  let compileRevision = 0;
  let saveInFlight: Promise<boolean> | null = null;
  const savePresentation = new SavePresentation();

  function structuredTailoring(value: Tailoring | null): StructuredTailoring | null {
    return value?.kind === "structured" ? value : null;
  }

  let structured = $derived(
    structuredTailoring(tailoring)
  );
  let draft = $derived(structured?.resumeDraft ?? null);
  let isPlanReview = $derived(Boolean(structured && !structured.resumeDraft));
  let evidenceById = $derived(new Map(structured?.evidence.map((item) => [item.id, item]) ?? []));
  let selectedEvidence = $derived(
    structured?.evidence.filter((item) => selectedEvidenceIds.includes(item.id)) ?? []
  );
  let excludedEvidence = $derived(
    structured?.evidence.filter((item) => !selectedEvidenceIds.includes(item.id)) ?? []
  );
  let selectableExcludedEvidence = $derived(
    excludedEvidence.filter((item) => item.sourceType === "experience" || item.sourceType === "project")
  );
  let priorityEvidenceIds = $derived.by(() => {
    if (!structured) return [];
    const selected = new Set(selectedEvidenceIds);
    const ordered = ["required", "preferred"].flatMap((priority) =>
      structured.plan.requirements
        .filter((requirement) => requirement.priority === priority)
        .flatMap((requirement) =>
          structured.plan.matches.find((match) => match.requirementId === requirement.id)?.evidenceIds ?? []
        )
    );
    return [...new Set([...ordered, ...selectedEvidenceIds])].filter((id) => selected.has(id));
  });

  function setTailoring(next: Tailoring | null) {
    tailoring = next;
    if (next?.kind === "structured") {
      selectedEvidenceIds = [...next.plan.selectedEvidenceIds];
      savePresentation.hydrate(next.updated_at);
    } else {
      selectedEvidenceIds = [];
      savePresentation.hydrate(next?.created_at ?? null);
    }
    clearPreview();
  }

  async function loadExisting() {
    if (!jobId) return;
    loading = true;
    error = null;
    try {
      const [nextJob, response] = await Promise.all([
        api.jobs.get(jobId),
        api.tailor.get(jobId),
      ]);
      job = nextJob;
      setTailoring(response.tailoring);
      loaded = true;
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      loading = false;
    }
  }

  function startProgress(kind: "plan" | "generate") {
    clearProgressTimer();
    progressMessage = kind === "plan" ? "Reading the role" : "Building your resume";
    if (kind === "plan") {
      progressTimer = window.setTimeout(() => {
        progressMessage = "Matching your experience";
      }, 900);
    }
  }

  function clearProgressTimer() {
    if (progressTimer !== null) window.clearTimeout(progressTimer);
    progressTimer = null;
  }

  async function createPlan() {
    if (!jobId || working) return;
    working = true;
    error = null;
    startProgress("plan");
    try {
      const response = await api.tailor.plan(jobId);
      setTailoring(response.tailoring);
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      clearProgressTimer();
      working = false;
    }
  }

  function toggleEvidence(id: string) {
    const evidence = evidenceById.get(id);
    if (!evidence || (evidence.sourceType !== "experience" && evidence.sourceType !== "project")) return;
    selectedEvidenceIds = selectedEvidenceIds.includes(id)
      ? selectedEvidenceIds.filter((value) => value !== id)
      : [...selectedEvidenceIds, id];
  }

  async function generateResume() {
    if (!structured || working || selectedEvidenceIds.length === 0) return;
    working = true;
    error = null;
    startProgress("generate");
    try {
      const response = await api.tailor.generate(structured.id, {
        selectedEvidenceIds,
        excludedEvidenceIds: structured.evidence
          .map((item) => item.id)
          .filter((id) => !selectedEvidenceIds.includes(id)),
      });
      setTailoring(response.tailoring);
      activeView = "resume";
    } catch (cause) {
      error = errorMessage(cause);
      await loadLatestWithoutSpinner();
    } finally {
      clearProgressTimer();
      working = false;
    }
  }

  async function loadLatestWithoutSpinner() {
    if (!jobId) return;
    const response = await api.tailor.get(jobId).catch(() => null);
    if (response?.tailoring) setTailoring(response.tailoring);
  }

  function replaceDraft(nextDraft: TailoredResume) {
    if (!structured) return;
    tailoring = { ...structured, resumeDraft: nextDraft };
    editRevision += 1;
    savePresentation.markDirty();
    clearPreview();
    queueSave();
    queueCompile();
  }

  function updateBullet(
    section: DraftSection,
    entryIndex: number,
    bulletIndex: number,
    text: string,
  ) {
    if (!draft) return;
    const next = structuredClone(draft);
    next[section][entryIndex].bullets[bulletIndex].text = text;
    replaceDraft(next);
  }

  function moveBullet(
    section: DraftSection,
    entryIndex: number,
    bulletIndex: number,
    direction: -1 | 1,
  ) {
    if (!draft) return;
    const next = structuredClone(draft);
    const bullets = next[section][entryIndex].bullets;
    const target = bulletIndex + direction;
    if (target < 0 || target >= bullets.length) return;
    [bullets[bulletIndex], bullets[target]] = [bullets[target], bullets[bulletIndex]];
    replaceDraft(next);
  }

  function moveEntry(section: DraftSection, entryIndex: number, direction: -1 | 1) {
    if (!draft) return;
    const next = structuredClone(draft);
    const entries = next[section];
    const target = entryIndex + direction;
    if (target < 0 || target >= entries.length) return;
    [entries[entryIndex], entries[target]] = [entries[target], entries[entryIndex]];
    replaceDraft(next);
  }

  function excludeBullet(section: DraftSection, entryIndex: number, bulletIndex: number) {
    if (!draft) return;
    const next = structuredClone(draft);
    const [removed] = next[section][entryIndex].bullets.splice(bulletIndex, 1);
    if (!removed) return;
    if (next[section][entryIndex].bullets.length === 0) next[section].splice(entryIndex, 1);
    selectedEvidenceIds = selectedEvidenceIds.filter((id) => !removed.evidenceIds.includes(id));
    next.removedForSpace.push({
      evidenceId: removed.evidenceIds[0] ?? removed.id,
      label: removed.text,
    });
    replaceDraft(next);
  }

  function includeEvidence(id: string) {
    if (!draft || !structured) return;
    const evidence = evidenceById.get(id);
    if (!evidence || (evidence.sourceType !== "experience" && evidence.sourceType !== "project")) return;
    const next = structuredClone(draft);
    const profileEntry = evidence.sourceType === "experience"
      ? structured.evidence.find((item) => item.sourceEntryId === evidence.sourceEntryId)
      : structured.evidence.find((item) => item.sourceEntryId === evidence.sourceEntryId);
    if (!profileEntry) return;
    // Re-inclusion is safest through a fresh generation because metadata is
    // copied server-side and the model must re-run evidence validation.
    selectedEvidenceIds = [...new Set([...selectedEvidenceIds, id])];
    tailoring = { ...structured, resumeDraft: next };
  }

  async function performSave(): Promise<boolean> {
    if (!structured?.resumeDraft) return true;
    saving = true;
    const revision = editRevision;
    const snapshot = structuredClone(structured.resumeDraft);
    const presentationGeneration = savePresentation.begin();
    try {
      const response = await api.tailor.saveStructured(structured.id, snapshot, selectedEvidenceIds);
      if (revision === editRevision) setTailoring(response.tailoring);
      savePresentation.succeed(presentationGeneration, response.tailoring.updated_at);
      if (revision !== editRevision) savePresentation.markDirty();
      return true;
    } catch (cause) {
      const message = errorMessage(cause);
      error = message;
      savePresentation.fail(presentationGeneration, message);
      return false;
    } finally {
      saving = false;
    }
  }

  async function saveEdits(): Promise<boolean> {
    while (true) {
      while (saveInFlight) {
        if (!(await saveInFlight)) return false;
      }
      if (savePresentation.phase !== "dirty") return true;
      const current = performSave();
      saveInFlight = current;
      try {
        if (!(await current)) return false;
      } finally {
        if (saveInFlight === current) saveInFlight = null;
      }
    }
  }

  function queueSave() {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void saveEdits();
    }, 900);
  }

  function clearSaveTimer() {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = null;
  }

  function clearPreview() {
    compileRevision += 1;
    compiled = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  function queueCompile() {
    if (activeView !== "preview") return;
    if (compileTimer !== null) window.clearTimeout(compileTimer);
    compileTimer = window.setTimeout(() => {
      compileTimer = null;
      void compilePreview();
    }, 500);
  }

  async function compilePreview(): Promise<CompiledResumeDocument | null> {
    if (!draft || !structured) return null;
    const revision = ++compileRevision;
    compiling = true;
    error = null;
    try {
      const result = await compileResumeDocument(draft, priorityEvidenceIds);
      if (revision !== compileRevision) return null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml" }));
      compiled = result;
      return result;
    } catch (cause) {
      if (revision === compileRevision) error = errorMessage(cause, "Could not build the resume preview");
      return null;
    } finally {
      if (revision === compileRevision) compiling = false;
    }
  }

  async function selectView(view: ViewId) {
    activeView = view;
    if (view === "preview" && !compiled) await compilePreview();
  }

  async function exportResume() {
    if (!structured?.resumeDraft || exporting) return;
    clearSaveTimer();
    if (!(await saveEdits())) return;
    exporting = true;
    error = null;
    try {
      const result = compiled ?? await compilePreview();
      if (!result) return;
      const validation = structured.validation;
      if (!validation?.valid) {
        error = "Resolve the evidence warnings before downloading this resume.";
        return;
      }
      const pdfBlob = new Blob([Uint8Array.from(result.pdf)], { type: "application/pdf" });
      await api.tailor.createArtifact(structured.id, {
        pdf: pdfBlob,
        resume: result.resume,
        validation,
        typstSource: result.source,
        templateVersion: RESUME_TEMPLATE_VERSION,
        compilerVersion: RESUME_COMPILER_VERSION,
      });
      downloadPdfBytes(
        tailoredResumePdfFileName(job?.company_name, job?.title),
        result.pdf,
      );
      feedback.success("Resume downloaded");
    } catch (cause) {
      error = errorMessage(cause, "Could not download the resume");
    } finally {
      exporting = false;
    }
  }

  async function handleBack() {
    clearSaveTimer();
    if (!(await saveEdits())) return;
    if (!requestBack()) navigate(jobId ? `/jobs/${jobId}` : "/");
  }

  onMount(() => {
    void loadExisting();
    const unregister = registerAutosaveFlush(() => {
      clearSaveTimer();
      void saveEdits();
    });
    return () => {
      unregister();
      clearSaveTimer();
      if (compileTimer !== null) window.clearTimeout(compileTimer);
      clearProgressTimer();
      clearPreview();
      savePresentation.destroy();
    };
  });
</script>

<div class="page pushed-screen">
  <ScreenNav title="Tailor" onBack={() => void handleBack()} />

  <main class="tailor-page-body">
    {#if job && !loading}
      <header class="job-context">
        <h1>{job.title}</h1>
        <p>{job.company_name}</p>
      </header>
    {/if}

    {#if error && loaded}
      <InlineFailure
        title="Tailoring needs attention"
        message={error}
        onRetry={tailoring ? undefined : () => void loadExisting()}
      />
    {/if}

    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else if error && !loaded}
      <PageFailure
        title="Tailoring didn’t load"
        message="Check your connection and try again."
        onRetry={() => void loadExisting()}
      />
    {:else if working}
      <section class="progress-state" aria-live="polite" aria-busy="true">
        <Spinner size={24} label={progressMessage} />
        <div>
          <h2>{progressMessage}</h2>
          <p>Your saved resume stays unchanged while we build this version.</p>
        </div>
      </section>
    {:else if !structured}
      <section class="empty-tailoring">
        <MagicWand size={26} weight="duotone" aria-hidden="true" />
        <div>
          <h2>Tailor your resume to this role</h2>
          <p>First, review how the job requirements match evidence from your saved resume. Nothing is generated until you confirm the plan.</p>
        </div>
        <button class="btn-primary btn-accent full-width" type="button" onclick={() => void createPlan()}>
          Read the role
        </button>
      </section>
    {:else if isPlanReview}
      <section class="plan-review">
        <header class="section-heading">
          <p class="eyebrow">Review before generation</p>
          <h2>Requirement matches</h2>
          <p>Choose the evidence that can be used. Gaps stay visible; the model is not allowed to fill them in.</p>
        </header>

        <div class="requirements">
          {#each structured.plan.requirements as requirement}
            {@const match = structured.plan.matches.find((item) => item.requirementId === requirement.id)}
            {@const gap = structured.plan.gaps.find((item) => item.requirementId === requirement.id)}
            <section class="requirement" class:gap={Boolean(gap)}>
              <div class="requirement-title">
                {#if gap}<WarningCircle size={18} weight="fill" />{:else}<Check size={18} weight="bold" />{/if}
                <div>
                  <span class="priority">{requirement.priority}</span>
                  <h3>{requirement.text}</h3>
                </div>
              </div>
              {#if match}
                <p>{match.reason}</p>
                <div class="evidence-options">
                  {#each match.evidenceIds as evidenceId}
                    {@const evidence = evidenceById.get(evidenceId)}
                    {#if evidence}
                      {#if evidence.sourceType === "experience" || evidence.sourceType === "project"}
                        <label class="evidence-option">
                          <input
                            type="checkbox"
                            checked={selectedEvidenceIds.includes(evidenceId)}
                            onchange={() => toggleEvidence(evidenceId)}
                          />
                          <span>
                            <strong>{evidence.label}</strong>
                            <small>{evidence.text}</small>
                          </span>
                        </label>
                      {:else}
                        <div class="evidence-option static-evidence">
                          <Check size={18} weight="bold" aria-hidden="true" />
                          <span>
                            <strong>{evidence.label}</strong>
                            <small>{evidence.text} · Copied from your saved profile</small>
                          </span>
                        </div>
                      {/if}
                    {/if}
                  {/each}
                </div>
              {:else if gap}
                <p>{gap.reason}</p>
              {/if}
            </section>
          {/each}
        </div>

        {#if selectableExcludedEvidence.length}
          <details class="excluded-content plan-exclusions">
            <summary>Other resume evidence ({selectableExcludedEvidence.length})</summary>
            {#each selectableExcludedEvidence as evidence}
              <label class="evidence-option">
                <input type="checkbox" checked={false} onchange={() => toggleEvidence(evidence.id)} />
                <span><strong>{evidence.label}</strong><small>{evidence.text}</small></span>
              </label>
            {/each}
          </details>
        {/if}

        <div class="sticky-action">
          <span>{selectedEvidence.length} evidence item{selectedEvidence.length === 1 ? "" : "s"} selected</span>
          <button
            class="btn-primary btn-accent"
            type="button"
            disabled={selectedEvidenceIds.length === 0}
            onclick={() => void generateResume()}
          >
            Build resume
          </button>
        </div>
      </section>
    {:else if draft}
      <section class="structured-workspace">
        <div class="workspace-toolbar">
          <div class="segmented-control" role="tablist" aria-label="Resume views">
            <button
              type="button"
              class:active={activeView === "resume"}
              role="tab"
              aria-selected={activeView === "resume"}
              onclick={() => void selectView("resume")}
            >Resume</button>
            <button
              type="button"
              class:active={activeView === "preview"}
              role="tab"
              aria-selected={activeView === "preview"}
              onclick={() => void selectView("preview")}
            >Preview</button>
          </div>
          <SaveStatus phase={savePresentation.phase} />
        </div>

        {#if structured.validation && !structured.validation.valid}
          <InlineFailure
            title="This version is not ready to export"
            message={structured.validation.issues[0]?.message ?? "Review the evidence warnings below."}
          />
        {/if}

        {#if activeView === "resume"}
          <div class="structured-editor" role="tabpanel">
            <section class="resume-section">
              <h2>Contact</h2>
              <div class="contact-summary">
                <strong>{draft.contact.name}</strong>
                <span>{[draft.contact.email, draft.contact.phone, draft.contact.location].filter(Boolean).join(" · ")}</span>
              </div>
            </section>

            {#if draft.experience.length}
              <section class="resume-section">
                <h2>Experience</h2>
                {#each draft.experience as entry, entryIndex}
                  <article class="resume-entry">
                    <div class="entry-heading">
                      <div><h3>{entry.title}</h3><p>{entry.company}</p></div>
                      <div class="entry-heading-meta">
                        <span>{[entry.startDate, entry.endDate].filter(Boolean).join(" – ")}</span>
                        <div class="icon-actions">
                          <button type="button" aria-label={`Move ${entry.title} up`} disabled={entryIndex === 0} onclick={() => moveEntry("experience", entryIndex, -1)}><ArrowUp size={17} weight="bold" /></button>
                          <button type="button" aria-label={`Move ${entry.title} down`} disabled={entryIndex === draft.experience.length - 1} onclick={() => moveEntry("experience", entryIndex, 1)}><ArrowDown size={17} weight="bold" /></button>
                        </div>
                      </div>
                    </div>
                    {#each entry.bullets as bullet, bulletIndex}
                      <div class="bullet-editor">
                        <textarea
                          class="input-field"
                          aria-label={`Bullet for ${entry.title}`}
                          value={bullet.text}
                          rows="3"
                          oninput={(event) => updateBullet("experience", entryIndex, bulletIndex, event.currentTarget.value)}
                        ></textarea>
                        <div class="bullet-actions">
                          <div class="evidence-chips" aria-label="Supporting evidence">
                            {#each bullet.evidenceIds as evidenceId}
                              {@const evidence = evidenceById.get(evidenceId)}
                              {#if evidence}<span class="evidence-chip">{evidence.label}</span>{/if}
                            {/each}
                          </div>
                          <div class="icon-actions">
                            <button type="button" aria-label="Move bullet up" disabled={bulletIndex === 0} onclick={() => moveBullet("experience", entryIndex, bulletIndex, -1)}><ArrowUp size={17} weight="bold" /></button>
                            <button type="button" aria-label="Move bullet down" disabled={bulletIndex === entry.bullets.length - 1} onclick={() => moveBullet("experience", entryIndex, bulletIndex, 1)}><ArrowDown size={17} weight="bold" /></button>
                            <button type="button" aria-label="Exclude bullet" onclick={() => excludeBullet("experience", entryIndex, bulletIndex)}><X size={17} weight="bold" /></button>
                          </div>
                        </div>
                        <details class="source-comparison">
                          <summary>Compare with original</summary>
                          {#each bullet.evidenceIds as evidenceId}
                            <p>{evidenceById.get(evidenceId)?.text}</p>
                          {/each}
                        </details>
                      </div>
                    {/each}
                  </article>
                {/each}
              </section>
            {/if}

            {#if draft.projects.length}
              <section class="resume-section">
                <h2>Projects</h2>
                {#each draft.projects as entry, entryIndex}
                  <article class="resume-entry">
                    <div class="entry-heading">
                      <div><h3>{entry.name}</h3><p>{entry.role ?? ""}</p></div>
                      <div class="entry-heading-meta">
                        <span>{entry.date ?? ""}</span>
                        <div class="icon-actions">
                          <button type="button" aria-label={`Move ${entry.name} up`} disabled={entryIndex === 0} onclick={() => moveEntry("projects", entryIndex, -1)}><ArrowUp size={17} weight="bold" /></button>
                          <button type="button" aria-label={`Move ${entry.name} down`} disabled={entryIndex === draft.projects.length - 1} onclick={() => moveEntry("projects", entryIndex, 1)}><ArrowDown size={17} weight="bold" /></button>
                        </div>
                      </div>
                    </div>
                    {#each entry.bullets as bullet, bulletIndex}
                      <div class="bullet-editor">
                        <textarea
                          class="input-field"
                          aria-label={`Bullet for ${entry.name}`}
                          value={bullet.text}
                          rows="3"
                          oninput={(event) => updateBullet("projects", entryIndex, bulletIndex, event.currentTarget.value)}
                        ></textarea>
                        <div class="bullet-actions">
                          <div class="evidence-chips">
                            {#each bullet.evidenceIds as evidenceId}
                              {@const evidence = evidenceById.get(evidenceId)}
                              {#if evidence}<span class="evidence-chip">{evidence.label}</span>{/if}
                            {/each}
                          </div>
                          <div class="icon-actions">
                            <button type="button" aria-label="Move bullet up" disabled={bulletIndex === 0} onclick={() => moveBullet("projects", entryIndex, bulletIndex, -1)}><ArrowUp size={17} weight="bold" /></button>
                            <button type="button" aria-label="Move bullet down" disabled={bulletIndex === entry.bullets.length - 1} onclick={() => moveBullet("projects", entryIndex, bulletIndex, 1)}><ArrowDown size={17} weight="bold" /></button>
                            <button type="button" aria-label="Exclude bullet" onclick={() => excludeBullet("projects", entryIndex, bulletIndex)}><X size={17} weight="bold" /></button>
                          </div>
                        </div>
                        <details class="source-comparison"><summary>Compare with original</summary><p>{evidenceById.get(bullet.evidenceIds[0])?.text}</p></details>
                      </div>
                    {/each}
                  </article>
                {/each}
              </section>
            {/if}

            <section class="resume-section compact-section">
              <h2>Education</h2>
              {#each draft.education as entry}
                <div class="static-row"><strong>{entry.institution}</strong><span>{[entry.startDate, entry.endDate].filter(Boolean).join(" – ")}</span></div>
              {/each}
            </section>

            <section class="resume-section compact-section">
              <h2>Skills</h2>
              {#each draft.skills as row}
                <div class="skill-row"><strong>{row.category}</strong><span>{row.items}</span></div>
              {/each}
            </section>

            {#if excludedEvidence.some((item) => item.sourceType === "experience" || item.sourceType === "project")}
              <details class="excluded-content">
                <summary>Excluded evidence ({excludedEvidence.length})</summary>
                {#each excludedEvidence.filter((item) => item.sourceType === "experience" || item.sourceType === "project") as evidence}
                  <div class="excluded-row">
                    <span><strong>{evidence.label}</strong><small>{evidence.text}</small></span>
                    <button class="btn-secondary" type="button" onclick={() => includeEvidence(evidence.id)}>
                      <Plus size={16} weight="bold" /> Include
                    </button>
                  </div>
                {/each}
                <p class="rebuild-note">Rebuild the resume to validate newly included evidence.</p>
                <button class="btn-primary" type="button" onclick={() => void generateResume()}>Rebuild with selections</button>
              </details>
            {/if}

            {#if structured.plan.gaps.length}
              <section class="gaps-summary">
                <h2>Gaps ({structured.plan.gaps.length})</h2>
                {#each structured.plan.gaps as gap}
                  {@const requirement = structured.plan.requirements.find((item) => item.id === gap.requirementId)}
                  <div><WarningCircle size={17} weight="fill" /><span><strong>{requirement?.text}</strong><small>{gap.reason}</small></span></div>
                {/each}
              </section>
            {/if}
          </div>
        {:else}
          <div class="preview-panel" role="tabpanel">
            {#if compiling}
              <div class="preview-loading"><Spinner size={22} label="Building preview" /></div>
            {:else if previewUrl && compiled}
              <img class="resume-preview" src={previewUrl} alt="Preview of the tailored resume" />
              <div class="preview-meta">
                <span>{compiled.pageCount} page{compiled.pageCount === 1 ? "" : "s"}</span>
                {#if compiled.resume.removedForSpace.length}
                  <details>
                    <summary>{compiled.resume.removedForSpace.length} item{compiled.resume.removedForSpace.length === 1 ? "" : "s"} removed to fit</summary>
                    <ul>
                      {#each compiled.resume.removedForSpace as item}<li>{item.label}</li>{/each}
                    </ul>
                  </details>
                {/if}
              </div>
            {:else}
              <button class="btn-secondary" type="button" onclick={() => void compilePreview()}><Eye size={17} /> Build preview</button>
            {/if}
          </div>
        {/if}

        <div class="download-action">
          <button class="btn-primary btn-accent full-width" type="button" disabled={exporting || saving} onclick={() => void exportResume()}>
            {#if exporting}<Spinner />{:else}<DownloadSimple size={18} weight="bold" />{/if}
            Download PDF
          </button>
        </div>
      </section>
    {/if}
  </main>
</div>

<style>
  .tailor-page-body {
    display: grid;
    gap: var(--space-6);
  }

  .job-context,
  .section-heading,
  .empty-tailoring h2,
  .progress-state h2,
  .resume-section h2,
  .gaps-summary h2 {
    margin: 0;
  }

  .job-context {
    display: grid;
    gap: var(--space-1);
  }

  .job-context h1 {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-xl);
    line-height: var(--leading-screen-title);
  }

  .job-context p,
  .empty-tailoring p,
  .progress-state p,
  .section-heading p,
  .requirement p,
  .rebuild-note {
    margin: 0;
    color: var(--color-ink-3);
    line-height: var(--leading-body);
  }

  .progress-state,
  .empty-tailoring {
    display: grid;
    gap: var(--space-5);
    padding-block: var(--space-8);
  }

  .progress-state {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .progress-state h2,
  .empty-tailoring h2,
  .section-heading h2 {
    color: var(--color-ink);
    font-size: var(--fs-xl);
    line-height: 1.25;
  }

  .plan-review,
  .structured-workspace,
  .structured-editor {
    display: grid;
    gap: var(--space-6);
  }

  .workspace-toolbar,
  .bullet-actions,
  .sticky-action,
  .download-action,
  .static-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .eyebrow,
  .priority {
    margin: 0 0 var(--space-1);
    color: var(--color-ink-4);
    font-size: var(--fs-2xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .section-heading {
    display: grid;
    gap: var(--space-2);
  }

  .requirements {
    display: grid;
    gap: var(--space-3);
  }

  .requirement {
    display: grid;
    gap: var(--space-3);
    padding-block: var(--space-4);
    border-bottom: 1px solid var(--color-line);
  }

  .requirement-title {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-3);
    color: var(--color-good);
  }

  .requirement.gap .requirement-title {
    color: var(--color-warn);
  }

  .requirement h3 {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-md);
    line-height: 1.35;
  }

  .evidence-options {
    display: grid;
    gap: var(--space-2);
    margin-left: calc(18px + var(--space-3));
  }

  .evidence-option {
    min-height: var(--tap-min);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-bg-elev);
  }

  .evidence-option input {
    width: 18px;
    height: 18px;
    margin-top: 2px;
    accent-color: var(--color-accent);
  }

  .static-evidence > :global(svg) {
    margin-top: 2px;
    color: var(--color-good);
  }

  .plan-exclusions {
    display: grid;
    gap: var(--space-2);
  }

  .evidence-option span,
  .excluded-row > span,
  .gaps-summary div > span {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  .evidence-option small,
  .excluded-row small,
  .gaps-summary small {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.45;
  }

  .sticky-action {
    position: sticky;
    bottom: calc(var(--safe-bottom) + var(--space-3));
    z-index: 2;
    padding: var(--space-3);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elev);
    box-shadow: var(--shadow-overlay);
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .workspace-toolbar {
    align-items: center;
  }

  .workspace-toolbar .segmented-control {
    flex: 1;
  }

  .resume-section {
    display: grid;
    gap: var(--space-4);
  }

  .resume-section h2,
  .gaps-summary h2 {
    color: var(--color-ink);
    font-size: var(--fs-lg);
    line-height: 1.3;
  }

  .contact-summary,
  .skill-row {
    display: grid;
    gap: var(--space-1);
  }

  .contact-summary span,
  .skill-row span,
  .entry-heading span,
  .static-row span {
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
  }

  .resume-entry {
    display: grid;
    gap: var(--space-3);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--color-line);
  }

  .entry-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .entry-heading h3,
  .entry-heading p {
    margin: 0;
  }

  .entry-heading h3 {
    color: var(--color-ink);
    font-size: var(--fs-md);
  }

  .entry-heading p {
    margin-top: var(--space-1);
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
  }

  .entry-heading-meta {
    flex: none;
    display: grid;
    justify-items: end;
    gap: var(--space-1);
  }

  .bullet-editor {
    display: grid;
    gap: var(--space-2);
  }

  .bullet-editor textarea {
    min-height: 88px;
    resize: vertical;
    line-height: var(--leading-body);
  }

  .evidence-chips {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .evidence-chip {
    max-width: 100%;
    padding: var(--space-1) var(--space-2);
    overflow: hidden;
    border-radius: var(--radius-full);
    background: var(--color-good-soft);
    color: var(--color-good);
    font-size: var(--fs-2xs);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .icon-actions {
    flex: none;
    display: flex;
    gap: var(--space-1);
  }

  .icon-actions button {
    width: var(--tap-min);
    height: var(--tap-min);
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-ink-2);
  }

  .icon-actions button:disabled {
    color: var(--color-ink-4);
    opacity: 0.45;
  }

  .source-comparison,
  .excluded-content,
  .preview-meta details {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .source-comparison summary,
  .excluded-content summary,
  .preview-meta summary {
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    color: var(--color-ink-2);
    font-weight: 600;
  }

  .source-comparison p {
    margin: 0;
    padding: var(--space-3);
    border-left: 2px solid var(--color-good);
    line-height: 1.5;
  }

  .compact-section {
    padding-block: var(--space-2);
    border-bottom: 1px solid var(--color-line);
  }

  .skill-row {
    grid-template-columns: minmax(90px, auto) 1fr;
  }

  .excluded-content {
    display: grid;
    gap: var(--space-3);
  }

  .excluded-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    padding-block: var(--space-3);
    border-bottom: 1px solid var(--color-line);
  }

  .gaps-summary {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--color-bad-soft);
  }

  .gaps-summary > div {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-2);
    color: var(--color-warn);
  }

  .preview-panel {
    min-height: 50dvh;
    display: grid;
    justify-items: center;
    gap: var(--space-4);
  }

  .preview-loading {
    min-height: 45dvh;
    display: grid;
    place-items: center;
  }

  .resume-preview {
    width: 100%;
    height: auto;
    display: block;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-sm);
    background: var(--color-paper);
    box-shadow: var(--shadow-overlay);
  }

  .preview-meta {
    width: 100%;
    display: grid;
    gap: var(--space-2);
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .download-action {
    padding-bottom: calc(var(--safe-bottom) + var(--space-4));
  }

  @media (max-width: 520px) {
    .bullet-actions {
      align-items: end;
    }

    .evidence-chips {
      display: grid;
    }

    .workspace-toolbar :global(.save-status) {
      min-width: 72px;
    }
  }
</style>
