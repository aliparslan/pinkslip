<script lang="ts">
  import { onMount } from "svelte";
  import ArrowDown from "phosphor-svelte/lib/ArrowDown";
  import ArrowUp from "phosphor-svelte/lib/ArrowUp";
  import ArrowsClockwise from "phosphor-svelte/lib/ArrowsClockwise";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
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
    cloneTailoredResume,
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
  import Modal from "../components/Modal.svelte";
  import EmptyState from "../components/EmptyState.svelte";

  let { jobId = null }: { jobId?: string | null } = $props();

  type ViewId = "resume" | "preview";
  type DraftSection = "experience" | "projects";
  type EditingBullet = {
    section: DraftSection;
    entryIndex: number;
    bulletIndex: number;
  };

  let loading = $state(true);
  let loaded = $state(false);
  let working = $state(false);
  let saving = $state(false);
  let exporting = $state(false);
  let compiling = $state(false);
  let error: string | null = $state(null);
  let previewError: string | null = $state(null);
  let job: Job | null = $state(null);
  let tailoring: Tailoring | null = $state(null);
  let selectedEvidenceIds: string[] = $state([]);
  let activeView: ViewId = $state("resume");
  let progressMessage = $state("Reading the role");
  let refreshOpen = $state(false);
  let editingBullet: EditingBullet | null = $state(null);
  let editingBulletText = $state("");
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
  let matchedRequirementCount = $derived(structured?.plan.matches.length ?? 0);
  let activeBullet = $derived.by(() => {
    if (!draft || !editingBullet) return null;
    return draft[editingBullet.section][editingBullet.entryIndex]?.bullets[editingBullet.bulletIndex] ?? null;
  });
  let activeBulletLabel = $derived.by(() => {
    if (!draft || !editingBullet) return "Resume bullet";
    if (editingBullet.section === "experience") {
      return draft.experience[editingBullet.entryIndex]?.title ?? "Resume bullet";
    }
    return draft.projects[editingBullet.entryIndex]?.name ?? "Resume bullet";
  });
  let activeBulletEvidence = $derived(
    activeBullet?.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean) ?? []
  );
  let selectionsChanged = $derived.by(() => {
    if (!structured || !draft) return false;
    const current = [...selectedEvidenceIds].sort().join("|");
    const saved = [...structured.plan.selectedEvidenceIds].sort().join("|");
    const renderedEvidence = new Set([
      ...draft.experience.flatMap((entry) => entry.bullets.flatMap((bullet) => bullet.evidenceIds)),
      ...draft.projects.flatMap((entry) => entry.bullets.flatMap((bullet) => bullet.evidenceIds)),
    ]);
    const selectedDetailMissing = selectedEvidenceIds.some((id) => {
      const evidence = evidenceById.get(id);
      return (evidence?.sourceType === "experience" || evidence?.sourceType === "project")
        && !renderedEvidence.has(id);
    });
    return current !== saved || selectedDetailMissing;
  });
  let activeBulletCount = $derived.by(() => {
    if (!draft || !editingBullet) return 0;
    return draft[editingBullet.section][editingBullet.entryIndex]?.bullets.length ?? 0;
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
    refreshOpen = false;
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
    const next = cloneTailoredResume(draft);
    next[section][entryIndex].bullets[bulletIndex].text = text;
    replaceDraft(next);
  }

  function excludeBullet(section: DraftSection, entryIndex: number, bulletIndex: number) {
    if (!draft) return;
    const next = cloneTailoredResume(draft);
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

  function openBulletEditor(section: DraftSection, entryIndex: number, bulletIndex: number) {
    const bullet = draft?.[section][entryIndex]?.bullets[bulletIndex];
    if (!bullet) return;
    editingBulletText = bullet.text;
    editingBullet = { section, entryIndex, bulletIndex };
  }

  function commitBulletEditor() {
    if (!editingBullet || !activeBullet) return;
    const nextText = editingBulletText.trim();
    if (nextText && nextText !== activeBullet.text) {
      updateBullet(
        editingBullet.section,
        editingBullet.entryIndex,
        editingBullet.bulletIndex,
        nextText,
      );
    }
    editingBullet = null;
  }

  function moveActiveBullet(direction: -1 | 1) {
    if (!editingBullet || !draft) return;
    const next = cloneTailoredResume(draft);
    const bullets = next[editingBullet.section][editingBullet.entryIndex]?.bullets ?? [];
    const target = editingBullet.bulletIndex + direction;
    if (target < 0 || target >= bullets.length) return;
    const nextText = editingBulletText.trim();
    if (nextText) bullets[editingBullet.bulletIndex].text = nextText;
    [bullets[editingBullet.bulletIndex], bullets[target]] = [bullets[target], bullets[editingBullet.bulletIndex]];
    replaceDraft(next);
    editingBullet = { ...editingBullet, bulletIndex: target };
  }

  function excludeActiveBullet() {
    if (!editingBullet) return;
    excludeBullet(editingBullet.section, editingBullet.entryIndex, editingBullet.bulletIndex);
    editingBullet = null;
  }

  function includeEvidence(id: string) {
    if (!draft || !structured) return;
    const evidence = evidenceById.get(id);
    if (!evidence || (evidence.sourceType !== "experience" && evidence.sourceType !== "project")) return;
    selectedEvidenceIds = [...new Set([...selectedEvidenceIds, id])];
  }

  async function performSave(): Promise<boolean> {
    if (!structured?.resumeDraft) return true;
    saving = true;
    const revision = editRevision;
    const snapshot = cloneTailoredResume(structured.resumeDraft);
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
    previewError = null;
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
    previewError = null;
    try {
      const result = await compileResumeDocument(draft, priorityEvidenceIds);
      if (revision !== compileRevision) return null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml" }));
      compiled = result;
      return result;
    } catch (cause) {
      if (revision === compileRevision) {
        previewError = errorMessage(cause, "Could not build the resume preview");
      }
      return null;
    } finally {
      if (revision === compileRevision) compiling = false;
    }
  }

  async function selectView(view: ViewId) {
    activeView = view;
    if (view === "preview" && !compiled) await compilePreview();
  }

  function handleViewKeydown(event: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: ViewId = event.key === "ArrowLeft" || event.key === "Home" ? "resume" : "preview";
    void selectView(next);
    window.requestAnimationFrame(() => document.getElementById(`tailoring-tab-${next}`)?.focus());
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

<div class="page pushed-screen tailoring-screen">
  <ScreenNav title="Tailor" onBack={() => void handleBack()}>
    {#snippet trailing()}
      {#if draft}<SaveStatus phase={savePresentation.phase} />{/if}
    {/snippet}
  </ScreenNav>

  <main class="page-frame tailor-page-body">
    {#if job && !loading}
      <header class="job-context">
        <div class="job-context__copy">
          <h2>{job.title}</h2>
          <p>{job.company_name}</p>
        </div>
        {#if structured && !structured.requiresFreshPlan}
          <button class="refresh-action" type="button" aria-label="Start over" onclick={() => (refreshOpen = true)}>
            <ArrowsClockwise size={17} weight="bold" aria-hidden="true" />
            <span>Start over</span>
          </button>
        {/if}
      </header>
    {/if}

    {#if structured?.sourceProfileChanged && !structured.requiresFreshPlan && !working}
      <section class="source-change-notice" aria-live="polite">
        <div>
          <strong>Your resume has changed</strong>
          <span>Update the matches to use your latest information.</span>
        </div>
        <button type="button" onclick={() => (refreshOpen = true)}>Update</button>
      </section>
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
        message={error ?? "Try again in a moment."}
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
    {:else if structured?.requiresFreshPlan}
      <EmptyState
        title="Update this tailoring"
        message="Create fresh matches before you continue with this role."
      >
        {#snippet icon()}<ArrowsClockwise size={24} weight="bold" />{/snippet}
        {#snippet actions()}
          <button class="btn-primary btn-accent" type="button" onclick={() => void createPlan()}>
            Update matches
          </button>
        {/snippet}
      </EmptyState>
    {:else if !structured}
      <EmptyState
        title="Tailor your resume"
        message="See how this role matches your saved resume, then choose what to include."
      >
        {#snippet icon()}<MagicWand size={24} weight="duotone" />{/snippet}
        {#snippet actions()}
          <button class="btn-primary btn-accent" type="button" onclick={() => void createPlan()}>
            Review matches
          </button>
        {/snippet}
      </EmptyState>
    {:else if isPlanReview}
      <section class="plan-review">
        <header class="section-intro">
          <h2>Review matches</h2>
          <p>Only details from your saved resume will be used.</p>
          <p class="match-summary" aria-live="polite">
            {matchedRequirementCount} matched <span aria-hidden="true">·</span>
            {structured.plan.gaps.length} not covered
          </p>
        </header>

        <section class="review-section" aria-labelledby="requirements-heading">
          <h3 id="requirements-heading">Role requirements</h3>
          <div class="requirement-list">
          {#each structured.plan.requirements as requirement}
            {@const match = structured.plan.matches.find((item) => item.requirementId === requirement.id)}
            {@const gap = structured.plan.gaps.find((item) => item.requirementId === requirement.id)}
            <details class="requirement-row" class:gap={Boolean(gap)}>
              <summary>
                <span class="requirement-state" aria-hidden="true">
                  {#if gap}<WarningCircle size={17} weight="fill" />{:else}<Check size={17} weight="bold" />{/if}
                </span>
                <span class="requirement-copy">
                  <strong>{requirement.text}</strong>
                  <small>{gap ? "Not in your resume" : "Matched"} · {requirement.priority}</small>
                </span>
                <CaretRight class="disclosure-caret" size={17} weight="bold" aria-hidden="true" />
              </summary>
              <div class="requirement-detail">
                <p>{match?.reason ?? gap?.reason}</p>
                {#if match}
                  <small>
                    Based on {match.evidenceIds
                      .map((id) => evidenceById.get(id)?.label)
                      .filter(Boolean)
                      .filter((label, index, labels) => labels.indexOf(label) === index)
                      .join(", ")}
                  </small>
                {/if}
              </div>
            </details>
          {/each}
          </div>
        </section>

        <section class="review-section" aria-labelledby="evidence-heading">
          <div class="review-heading-copy">
            <h3 id="evidence-heading">Resume details to include</h3>
            <p>Contact, education, and skills are copied exactly.</p>
          </div>

          {#each ["experience", "project"] as sourceType}
            {@const items = structured.evidence.filter((item) => item.sourceType === sourceType)}
            {#if items.length}
              <div class="evidence-group">
                <h4>{sourceType === "experience" ? "Experience" : "Projects"}</h4>
                <div class="selection-list">
                  {#each items as evidence}
                    <label class="selection-row">
                      <span>
                        <strong>{evidence.label}</strong>
                        <small>{evidence.text}</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedEvidenceIds.includes(evidence.id)}
                        onchange={() => toggleEvidence(evidence.id)}
                      />
                    </label>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
        </section>

        <div class="sticky-action">
          <span aria-live="polite">{selectedEvidence.length} selected</span>
          <button
            class="btn-primary btn-accent"
            type="button"
            disabled={selectedEvidenceIds.length === 0}
            onclick={() => void generateResume()}
          >
            Create resume
          </button>
        </div>
      </section>
    {:else if draft}
      <section class="structured-workspace">
        <div class="my-jobs-tabs tailoring-tabs" class:preview-active={activeView === "preview"} role="tablist" aria-label="Tailored resume views">
            <button
              id="tailoring-tab-resume"
              type="button"
              class:active={activeView === "resume"}
              role="tab"
              aria-selected={activeView === "resume"}
              aria-controls="tailoring-panel"
              tabindex={activeView === "resume" ? 0 : -1}
              onclick={() => void selectView("resume")}
              onkeydown={handleViewKeydown}
            >Resume</button>
            <button
              id="tailoring-tab-preview"
              type="button"
              class:active={activeView === "preview"}
              role="tab"
              aria-selected={activeView === "preview"}
              aria-controls="tailoring-panel"
              tabindex={activeView === "preview" ? 0 : -1}
              onclick={() => void selectView("preview")}
              onkeydown={handleViewKeydown}
            >Preview</button>
        </div>

        {#if structured.validation && !structured.validation.valid}
          <InlineFailure
            title="This version is not ready to export"
            message={structured.validation.issues[0]?.message ?? "Review the evidence warnings below."}
          />
        {/if}

        {#if activeView === "resume"}
          <div
            id="tailoring-panel"
            class="structured-editor"
            role="tabpanel"
            aria-labelledby="tailoring-tab-resume"
          >
            <section class="resume-section">
              <header class="resume-section-heading">
                <h2>Contact</h2>
              </header>
              <div class="summary-row">
                <span>
                  <strong>{draft.contact.name}</strong>
                  <small>{[draft.contact.email, draft.contact.phone, draft.contact.location].filter(Boolean).join(" · ")}</small>
                </span>
              </div>
            </section>

            {#if draft.experience.length}
              <section class="resume-section">
                <header class="resume-section-heading">
                  <h2>Experience</h2>
                  <span>{draft.experience.length}</span>
                </header>
                {#each draft.experience as entry, entryIndex}
                  <article class="resume-entry">
                    <div class="entry-heading">
                      <div>
                        <h3>{entry.title}</h3>
                        <p>{[entry.company, entry.location].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span>{[entry.startDate, entry.endDate].filter(Boolean).join(" – ")}</span>
                    </div>
                    <div class="bullet-list">
                      {#each entry.bullets as bullet, bulletIndex}
                        <button
                          class="bullet-row"
                          type="button"
                          onclick={() => openBulletEditor("experience", entryIndex, bulletIndex)}
                        >
                          <span class="bullet-mark" aria-hidden="true">•</span>
                          <span class="bullet-copy">
                            <span>{bullet.text}</span>
                            <small>Edit and compare with original</small>
                          </span>
                          <CaretRight size={17} weight="bold" aria-hidden="true" />
                        </button>
                      {/each}
                    </div>
                  </article>
                {/each}
              </section>
            {/if}

            {#if draft.projects.length}
              <section class="resume-section">
                <header class="resume-section-heading">
                  <h2>Projects</h2>
                  <span>{draft.projects.length}</span>
                </header>
                {#each draft.projects as entry, entryIndex}
                  <article class="resume-entry">
                    <div class="entry-heading">
                      <div>
                        <h3>{entry.name}</h3>
                        {#if entry.role}<p>{entry.role}</p>{/if}
                      </div>
                      <span>{entry.date ?? ""}</span>
                    </div>
                    <div class="bullet-list">
                      {#each entry.bullets as bullet, bulletIndex}
                        <button
                          class="bullet-row"
                          type="button"
                          onclick={() => openBulletEditor("projects", entryIndex, bulletIndex)}
                        >
                          <span class="bullet-mark" aria-hidden="true">•</span>
                          <span class="bullet-copy">
                            <span>{bullet.text}</span>
                            <small>Edit and compare with original</small>
                          </span>
                          <CaretRight size={17} weight="bold" aria-hidden="true" />
                        </button>
                      {/each}
                    </div>
                  </article>
                {/each}
              </section>
            {/if}

            <section class="resume-section">
              <header class="resume-section-heading">
                <h2>Education</h2>
                <span>{draft.education.length}</span>
              </header>
              {#each draft.education as entry}
                <div class="summary-row">
                  <span>
                    <strong>{entry.institution}</strong>
                    {#each entry.credentials as credential}
                      <small>{[credential.degreeType, credential.fieldsOfStudy.join(" and ")].filter(Boolean).join(" · ")}</small>
                    {/each}
                    {#if entry.minors.length}<small>Minor in {entry.minors.join(" and ")}</small>{/if}
                  </span>
                  <small>{[entry.startDate, entry.endDate].filter(Boolean).join(" – ")}</small>
                </div>
              {/each}
            </section>

            <section class="resume-section">
              <header class="resume-section-heading">
                <h2>Skills</h2>
                <span>{draft.skills.length}</span>
              </header>
              {#each draft.skills as row}
                <div class="skill-row"><strong>{row.category}</strong><span>{row.items}</span></div>
              {/each}
            </section>

            {#if excludedEvidence.some((item) => item.sourceType === "experience" || item.sourceType === "project")}
              <details class="disclosure-section">
                <summary>
                  <span>Left out ({selectableExcludedEvidence.length})</span>
                  <CaretRight class="disclosure-caret" size={17} weight="bold" aria-hidden="true" />
                </summary>
                {#each excludedEvidence.filter((item) => item.sourceType === "experience" || item.sourceType === "project") as evidence}
                  <div class="excluded-row">
                    <span><strong>{evidence.label}</strong><small>{evidence.text}</small></span>
                    <button class="row-action" type="button" onclick={() => includeEvidence(evidence.id)}>
                      <Plus size={16} weight="bold" /> Include
                    </button>
                  </div>
                {/each}
              </details>
            {/if}

            {#if selectionsChanged}
              <div class="update-resume-action">
                <p>Your selections have changed.</p>
                <button class="btn-primary" type="button" onclick={() => void generateResume()}>Update resume</button>
              </div>
            {/if}

            {#if structured.plan.gaps.length}
              <details class="disclosure-section gaps-summary">
                <summary>
                  <span>Not covered ({structured.plan.gaps.length})</span>
                  <CaretRight class="disclosure-caret" size={17} weight="bold" aria-hidden="true" />
                </summary>
                {#each structured.plan.gaps as gap}
                  {@const requirement = structured.plan.requirements.find((item) => item.id === gap.requirementId)}
                  <div><WarningCircle size={17} weight="fill" /><span><strong>{requirement?.text}</strong><small>{gap.reason}</small></span></div>
                {/each}
              </details>
            {/if}
          </div>
        {:else}
          <div
            id="tailoring-panel"
            class="preview-panel"
            role="tabpanel"
            aria-labelledby="tailoring-tab-preview"
          >
            {#if previewError}
              <InlineFailure
                title="Preview didn’t build"
                message={previewError}
                retryLabel="Try preview again"
                onRetry={() => void compilePreview()}
              />
            {:else if compiling}
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

{#if refreshOpen}
  <Modal
    title="Start fresh?"
    subtitle="This will reread the current role and your latest saved resume. Downloaded versions stay unchanged."
    busy={working}
    onclose={() => (refreshOpen = false)}
  >
    <div class="modal-actions">
      <button class="btn-secondary" type="button" onclick={() => (refreshOpen = false)}>Cancel</button>
      <button class="btn-primary btn-accent" type="button" onclick={() => void createPlan()}>Start fresh</button>
    </div>
  </Modal>
{/if}

{#if editingBullet && activeBullet}
  <Modal
    title="Edit bullet"
    subtitle={activeBulletLabel}
    onclose={commitBulletEditor}
  >
    <div class="bullet-sheet">
      <label for="tailored-bullet-text">Bullet</label>
      <textarea
        id="tailored-bullet-text"
        class="input-field"
        rows="6"
        bind:value={editingBulletText}
      ></textarea>

      {#if activeBulletEvidence.length}
        <details class="original-evidence">
          <summary>
            <span>View original</span>
            <CaretRight class="disclosure-caret" size={17} weight="bold" aria-hidden="true" />
          </summary>
          {#each activeBulletEvidence as evidence}
            <div>
              <strong>{evidence?.label}</strong>
              <p>{evidence?.text}</p>
            </div>
          {/each}
        </details>
      {/if}

      <div class="bullet-sheet-actions">
        <button
          type="button"
          disabled={editingBullet.bulletIndex === 0}
          onclick={() => moveActiveBullet(-1)}
        >
          <ArrowUp size={17} weight="bold" aria-hidden="true" /> Move up
        </button>
        <button
          type="button"
          disabled={editingBullet.bulletIndex === activeBulletCount - 1}
          onclick={() => moveActiveBullet(1)}
        >
          <ArrowDown size={17} weight="bold" aria-hidden="true" /> Move down
        </button>
        <button class="leave-out-action" type="button" onclick={excludeActiveBullet}>
          <X size={17} weight="bold" aria-hidden="true" /> Leave out
        </button>
      </div>

      <button
        class="btn-primary btn-accent full-width"
        type="button"
        disabled={!editingBulletText.trim()}
        onclick={commitBulletEditor}
      >Done</button>
    </div>
  </Modal>
{/if}

<style>
  .tailor-page-body {
    display: grid;
    gap: var(--space-8);
    padding: var(--space-4) var(--screen-gutter) calc(var(--safe-bottom) + var(--space-8));
  }

  .job-context {
    min-width: 0;
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-4);
    padding-bottom: var(--space-5);
    border-bottom: 1px solid var(--color-line);
  }

  .job-context__copy {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  .job-context h2,
  .job-context p,
  .progress-state h2,
  .progress-state p,
  .section-intro h2,
  .section-intro p,
  .review-section h3,
  .review-heading-copy p,
  .resume-section h2,
  .entry-heading h3,
  .entry-heading p,
  .update-resume-action p,
  .original-evidence p {
    margin: 0;
  }

  .job-context h2 {
    overflow-wrap: anywhere;
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: var(--fs-xl);
    font-weight: 600;
    line-height: var(--leading-screen-title);
    letter-spacing: var(--tracking-screen-title);
  }

  .job-context p {
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: var(--leading-body);
  }

  .refresh-action,
  .source-change-notice button,
  .row-action {
    appearance: none;
    min-height: var(--tap-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    border: 0;
    background: transparent;
    color: var(--color-accent-soft-ink);
    font: 600 var(--fs-xs) / 1 var(--font-sans);
    cursor: pointer;
  }

  .refresh-action {
    flex: none;
    margin-block-start: calc(var(--space-2) * -1);
    margin-inline-end: calc(var(--space-2) * -1);
    padding-inline: var(--space-2);
  }

  .source-change-notice {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-left: 2px solid var(--color-accent);
    background: var(--color-accent-soft);
  }

  .source-change-notice > div {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  .source-change-notice strong {
    color: var(--color-ink);
    font-size: var(--fs-sm);
  }

  .source-change-notice span {
    color: var(--color-ink-2);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .progress-state {
    min-height: 42dvh;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-content: center;
    align-items: start;
    gap: var(--space-4);
  }

  .progress-state h2 {
    color: var(--color-ink);
    font-size: var(--fs-lg);
    line-height: 1.3;
  }

  .progress-state p {
    margin-top: var(--space-1);
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: var(--leading-body);
  }

  .plan-review,
  .structured-workspace,
  .structured-editor {
    display: grid;
  }

  .plan-review {
    gap: var(--space-8);
  }

  .structured-workspace {
    gap: var(--space-6);
  }

  .structured-editor {
    gap: var(--space-8);
  }

  .section-intro {
    display: grid;
    gap: var(--space-2);
  }

  .section-intro h2 {
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: var(--fs-2xl);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: var(--tracking-screen-title);
  }

  .section-intro > p:not(.match-summary),
  .review-heading-copy p {
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: var(--leading-body);
  }

  .section-intro p.match-summary {
    margin-top: var(--space-1);
    color: var(--color-ink-2);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .match-summary span {
    margin-inline: var(--space-1);
    color: var(--color-ink-4);
  }

  .review-section {
    display: grid;
    gap: var(--space-3);
  }

  .review-section > h3,
  .review-heading-copy h3 {
    margin: 0;
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.3;
  }

  .review-heading-copy {
    display: grid;
    gap: var(--space-1);
  }

  .requirement-list,
  .selection-list,
  .bullet-list {
    border-top: 1px solid var(--color-line);
  }

  .requirement-row,
  .disclosure-section,
  .original-evidence {
    border-bottom: 1px solid var(--color-line);
  }

  .requirement-row > summary,
  .disclosure-section > summary,
  .original-evidence > summary {
    min-height: var(--tap-min);
    display: grid;
    align-items: center;
    cursor: pointer;
    list-style: none;
  }

  .requirement-row > summary::-webkit-details-marker,
  .disclosure-section > summary::-webkit-details-marker,
  .original-evidence > summary::-webkit-details-marker {
    display: none;
  }

  .requirement-row > summary {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--space-3);
    padding-block: var(--space-3);
  }

  .requirement-state {
    width: var(--control-height-small);
    height: var(--control-height-small);
    display: grid;
    place-items: center;
    border-radius: var(--radius-full);
    background: var(--color-good-soft);
    color: var(--color-good);
  }

  .requirement-row.gap .requirement-state {
    background: transparent;
    color: var(--color-warn);
  }

  .requirement-copy,
  .selection-row > span,
  .summary-row > span,
  .bullet-copy,
  .excluded-row > span,
  .gaps-summary > div > span {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  .requirement-copy strong,
  .selection-row strong,
  .summary-row strong,
  .excluded-row strong,
  .original-evidence strong {
    color: var(--color-ink);
    font-size: var(--fs-sm);
    font-weight: 600;
    line-height: 1.35;
  }

  .requirement-copy small,
  .selection-row small,
  .summary-row small,
  .excluded-row small,
  .gaps-summary small,
  .original-evidence p {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.45;
  }

  :global(.disclosure-caret) {
    flex: none;
    color: var(--color-ink-4);
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  details[open] > summary :global(.disclosure-caret) {
    transform: rotate(90deg);
  }

  .requirement-detail {
    margin-inline-start: calc(var(--control-height-small) + var(--space-3));
    padding: 0 0 var(--space-4);
    display: grid;
    gap: var(--space-2);
  }

  .requirement-detail p {
    margin: 0;
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    line-height: var(--leading-body);
  }

  .requirement-detail small {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .evidence-group {
    display: grid;
    gap: var(--space-1);
  }

  .evidence-group + .evidence-group {
    margin-top: var(--space-4);
  }

  .evidence-group h4 {
    margin: 0;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .selection-row {
    min-height: calc(var(--tap-min) + var(--space-5));
    padding-block: var(--space-3);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-4);
    border-bottom: 1px solid var(--color-line);
    cursor: pointer;
  }

  .selection-row input {
    width: var(--space-5);
    height: var(--space-5);
    margin: 0;
    accent-color: var(--color-accent);
  }

  .sticky-action,
  .download-action {
    position: sticky;
    bottom: 0;
    z-index: 2;
    margin-inline: calc(var(--screen-gutter) * -1);
    padding: var(--space-3) var(--screen-gutter) calc(var(--safe-bottom) + var(--space-3));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    border-top: 1px solid var(--color-line);
    background: var(--color-bg);
  }

  .sticky-action > span {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .tailoring-tabs {
    width: 100%;
    margin-bottom: 0;
  }

  .tailoring-tabs.preview-active::before {
    transform: translateX(calc(100% + var(--space-1) - 1px));
  }

  .resume-section {
    display: grid;
    gap: var(--space-2);
  }

  .resume-section-heading {
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .resume-section-heading h2 {
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.3;
  }

  .resume-section-heading > span {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
  }

  .summary-row,
  .skill-row {
    min-height: var(--tap-min);
    padding-block: var(--space-2);
    display: grid;
    align-items: start;
    gap: var(--space-3);
  }

  .summary-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .summary-row + .summary-row,
  .skill-row + .skill-row {
    border-top: 1px solid var(--color-line);
  }

  .skill-row {
    grid-template-columns: minmax(88px, 0.35fr) minmax(0, 1fr);
  }

  .skill-row strong {
    color: var(--color-ink-2);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .skill-row span {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.45;
  }

  .resume-entry {
    display: grid;
    gap: var(--space-2);
  }

  .resume-entry + .resume-entry {
    padding-top: var(--space-4);
  }

  .entry-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .entry-heading > div {
    min-width: 0;
  }

  .entry-heading h3 {
    color: var(--color-ink);
    font-size: var(--fs-md);
    font-weight: 600;
    line-height: 1.35;
  }

  .entry-heading p,
  .entry-heading > span {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .entry-heading > span {
    flex: none;
    text-align: end;
  }

  .bullet-row {
    appearance: none;
    width: 100%;
    min-height: calc(var(--tap-min) + var(--space-4));
    padding: var(--space-3) 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-2);
    border: 0;
    border-bottom: 1px solid var(--color-line);
    background: transparent;
    color: var(--color-ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .bullet-mark {
    color: var(--color-ink-3);
    font-size: var(--fs-lg);
    line-height: 1;
  }

  .bullet-copy > span {
    display: -webkit-box;
    overflow: hidden;
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    line-height: var(--leading-body);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .bullet-copy small {
    color: var(--color-ink-4);
    font-size: var(--fs-2xs);
    line-height: 1.35;
  }

  .bullet-row > :global(svg) {
    margin-top: var(--space-1);
    color: var(--color-ink-4);
  }

  .disclosure-section {
    display: grid;
  }

  .disclosure-section > summary,
  .original-evidence > summary {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  .excluded-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-3);
    border-top: 1px solid var(--color-line);
  }

  .row-action {
    color: var(--color-accent-soft-ink);
  }

  .update-resume-action {
    padding: var(--space-3) 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .update-resume-action p {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .gaps-summary > div {
    padding-block: var(--space-3);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-2);
    border-top: 1px solid var(--color-line);
    color: var(--color-warn);
  }

  .preview-panel {
    min-height: 50dvh;
    display: grid;
    justify-items: center;
    align-content: start;
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

  .preview-meta summary {
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .download-action {
    justify-content: stretch;
  }

  .download-action > button {
    width: 100%;
  }

  .modal-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .bullet-sheet {
    display: grid;
    gap: var(--space-4);
  }

  .bullet-sheet > label {
    margin-bottom: calc(var(--space-3) * -1);
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  .bullet-sheet textarea {
    min-height: 9rem;
    resize: vertical;
    line-height: var(--leading-body);
  }

  .original-evidence > div {
    padding-block: var(--space-3);
    display: grid;
    gap: var(--space-1);
    border-top: 1px solid var(--color-line);
  }

  .bullet-sheet-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    border-top: 1px solid var(--color-line);
    border-bottom: 1px solid var(--color-line);
  }

  .bullet-sheet-actions button {
    appearance: none;
    min-height: var(--tap-min);
    padding-inline: var(--space-2);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border: 0;
    background: transparent;
    color: var(--color-ink-2);
    font: 500 var(--fs-xs) / 1 var(--font-sans);
    cursor: pointer;
  }

  .bullet-sheet-actions button:disabled {
    color: var(--color-ink-4);
    opacity: 0.45;
  }

  .bullet-sheet-actions .leave-out-action {
    margin-inline-start: auto;
    color: var(--color-bad);
  }

  @media (max-width: 420px) {
    .job-context {
      align-items: stretch;
    }

    .refresh-action {
      align-self: start;
    }

    .refresh-action span {
      display: none;
    }

    .refresh-action :global(svg) {
      width: var(--space-5);
      height: var(--space-5);
    }

    .summary-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .summary-row > small {
      justify-self: start;
    }

    .bullet-sheet-actions .leave-out-action {
      width: 100%;
      margin-inline-start: 0;
    }
  }
</style>
