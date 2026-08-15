<script lang="ts">
  import { onMount, tick } from "svelte";
  import ArrowCounterClockwise from "phosphor-svelte/lib/ArrowCounterClockwise";
  import ArrowDown from "phosphor-svelte/lib/ArrowDown";
  import ArrowUp from "phosphor-svelte/lib/ArrowUp";
  import ArrowsClockwise from "phosphor-svelte/lib/ArrowsClockwise";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import Check from "phosphor-svelte/lib/Check";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
  import Eye from "phosphor-svelte/lib/Eye";
  import FilePdf from "phosphor-svelte/lib/FilePdf";
  import LockSimple from "phosphor-svelte/lib/LockSimple";
  import MagicWand from "phosphor-svelte/lib/MagicWand";
  import Plus from "phosphor-svelte/lib/Plus";
  import Sparkle from "phosphor-svelte/lib/Sparkle";
  import Trash from "phosphor-svelte/lib/Trash";
  import WarningCircle from "phosphor-svelte/lib/WarningCircle";
  import X from "phosphor-svelte/lib/X";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import {
    api,
    type Job,
    type StructuredTailoring,
    type TailoringArtifact,
    type TailoredResume,
    type Tailoring,
  } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import {
    compileResumeDocument,
    verifyCompiledResumePdf,
    type CompiledResumeDocument,
  } from "../lib/resume-document-client";
  import {
    cloneTailoredResume,
    RESUME_COMPILER_VERSION,
    RESUME_TEMPLATE_VERSION,
    restoreRemovedContent as restoreRemovedResumeContent,
  } from "../lib/resume-document";
  import { exportPdfBytes, tailoredResumePdfFileName } from "../lib/pdf-resume";
  import { registerAutosaveFlush } from "../lib/autosave-lifecycle";
  import { SavePresentation } from "../lib/task-presentation.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import Spinner from "../components/Spinner.svelte";
  import SaveStatus from "../components/SaveStatus.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import InlineFailure from "../components/InlineFailure.svelte";
  import ResumePdfPreview from "../components/ResumePdfPreview.svelte";
  import Modal from "../components/Modal.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import Switch from "../components/Switch.svelte";

  let { jobId = null }: { jobId?: string | null } = $props();

  type ViewId = "resume" | "preview";
  type DraftSection = "experience" | "projects";
  type EditingBullet = {
    section: DraftSection;
    entryIndex: number;
    bulletIndex: number;
  };
  type WordDiffPart = {
    kind: "same" | "added" | "removed";
    value: string;
  };

  function tokenizeForDiff(value: string): string[] {
    return value.match(/\s+|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu) ?? [];
  }

  function comparableDiffToken(value: string): string {
    return /^\s+$/u.test(value) ? " " : value.toLocaleLowerCase();
  }

  function mergeDiffParts(parts: WordDiffPart[]): WordDiffPart[] {
    const merged: WordDiffPart[] = [];
    for (const part of parts) {
      const previous = merged.at(-1);
      if (previous?.kind === part.kind) previous.value += part.value;
      else merged.push({ ...part });
    }
    return merged;
  }

  /** Word-and-punctuation LCS diff. Whitespace is retained so the comparison reads naturally. */
  function wordDiff(original: string, tailored: string): WordDiffPart[] {
    const before = tokenizeForDiff(original);
    const after = tokenizeForDiff(tailored);
    const rows = before.length + 1;
    const columns = after.length + 1;
    const table = Array.from({ length: rows }, () => new Uint16Array(columns));
    for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
      for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
        table[beforeIndex][afterIndex] = comparableDiffToken(before[beforeIndex]) === comparableDiffToken(after[afterIndex])
          ? table[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(table[beforeIndex + 1][afterIndex], table[beforeIndex][afterIndex + 1]);
      }
    }
    const parts: WordDiffPart[] = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    while (beforeIndex < before.length || afterIndex < after.length) {
      if (
        beforeIndex < before.length
        && afterIndex < after.length
        && comparableDiffToken(before[beforeIndex]) === comparableDiffToken(after[afterIndex])
      ) {
        parts.push({ kind: "same", value: after[afterIndex] });
        beforeIndex += 1;
        afterIndex += 1;
      } else if (
        afterIndex < after.length
        && (beforeIndex >= before.length || table[beforeIndex][afterIndex + 1] > table[beforeIndex + 1][afterIndex])
      ) {
        parts.push({ kind: "added", value: after[afterIndex] });
        afterIndex += 1;
      } else if (beforeIndex < before.length) {
        parts.push({ kind: "removed", value: before[beforeIndex] });
        beforeIndex += 1;
      }
    }
    return mergeDiffParts(parts);
  }

  const artifactDateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
  let bulletInstruction = $state("");
  let regeneratingBullet = $state(false);
  let bulletRegenerationError: string | null = $state(null);
  let bulletRegenerationStatus = $state("");
  let compiled: CompiledResumeDocument | null = $state(null);
  let saveTimer: number | null = null;
  let compileTimer: number | null = null;
  let progressTimer: number | null = null;
  let editRevision = 0;
  let compileRevision = 0;
  let saveInFlight: Promise<boolean> | null = null;
  let restoringEvidenceId: string | null = $state(null);
  let artifacts: TailoringArtifact[] = $state([]);
  let artifactsLoading = $state(false);
  let artifactsError: string | null = $state(null);
  let artifactsTailoringId: string | null = null;
  let artifactBusyId: string | null = $state(null);
  let artifactDeleteTarget: TailoringArtifact | null = $state(null);
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
  let activeBulletOriginal = $derived(
    activeBulletEvidence.map((item) => item?.text ?? "").filter(Boolean).join("\n")
  );
  let activeBulletDiff = $derived(wordDiff(activeBulletOriginal, editingBulletText));
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
      if (artifactsTailoringId !== next.id) void loadArtifactHistory(next.id);
    } else {
      selectedEvidenceIds = [];
      savePresentation.hydrate(next?.created_at ?? null);
      artifactsTailoringId = null;
      artifacts = [];
    }
    clearPreview();
  }

  async function loadArtifactHistory(tailoringId = structured?.id) {
    if (!tailoringId) return;
    artifactsTailoringId = tailoringId;
    artifactsLoading = true;
    artifactsError = null;
    try {
      const response = await api.tailor.artifacts.list(tailoringId);
      if (artifactsTailoringId === tailoringId) {
        artifacts = [...response.artifacts].sort((left, right) => right.revision - left.revision);
      }
    } catch (cause) {
      if (artifactsTailoringId === tailoringId) {
        artifactsError = errorMessage(cause, "Could not load PDF history");
      }
    } finally {
      if (artifactsTailoringId === tailoringId) artifactsLoading = false;
    }
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
    const sourceEntryId = next[section][entryIndex]?.sourceEntryId;
    const [removed] = next[section][entryIndex].bullets.splice(bulletIndex, 1);
    if (!removed) return;
    if (next[section][entryIndex].bullets.length === 0) next[section].splice(entryIndex, 1);
    selectedEvidenceIds = selectedEvidenceIds.filter((id) => !removed.evidenceIds.includes(id));
    next.removedForSpace.push({
      evidenceId: removed.evidenceIds[0] ?? removed.id,
      label: removed.text,
      section,
      sourceEntryId,
      bullet: removed,
    });
    replaceDraft(next);
  }

  function openBulletEditor(section: DraftSection, entryIndex: number, bulletIndex: number) {
    const bullet = draft?.[section][entryIndex]?.bullets[bulletIndex];
    if (!bullet) return;
    editingBulletText = bullet.text;
    bulletInstruction = "";
    bulletRegenerationError = null;
    bulletRegenerationStatus = "";
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
    if (!editingBullet || activeBullet?.locked) return;
    excludeBullet(editingBullet.section, editingBullet.entryIndex, editingBullet.bulletIndex);
    editingBullet = null;
  }

  function setActiveBulletLocked(locked: boolean) {
    if (!editingBullet || !draft) return;
    const next = cloneTailoredResume(draft);
    const bullet = next[editingBullet.section][editingBullet.entryIndex]?.bullets[editingBullet.bulletIndex];
    if (!bullet) return;
    const nextText = editingBulletText.trim();
    if (nextText) bullet.text = nextText;
    bullet.locked = locked;
    replaceDraft(next);
    bulletRegenerationError = null;
    bulletRegenerationStatus = locked
      ? "This bullet will stay unchanged."
      : "This bullet can be rewritten again.";
  }

  function findBulletLocation(resume: TailoredResume, bulletId: string): EditingBullet | null {
    for (const section of ["experience", "projects"] as const) {
      const entries = resume[section];
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const bulletIndex = entries[entryIndex].bullets.findIndex((bullet) => bullet.id === bulletId);
        if (bulletIndex >= 0) return { section, entryIndex, bulletIndex };
      }
    }
    return null;
  }

  async function regenerateActiveBullet() {
    if (!editingBullet || !activeBullet || !structured || regeneratingBullet || activeBullet.locked) return;
    const location = { ...editingBullet };
    const entry = draft?.[location.section][location.entryIndex];
    if (!entry) return;
    const bulletId = activeBullet.id;
    const nextText = editingBulletText.trim();
    if (nextText && nextText !== activeBullet.text) {
      updateBullet(location.section, location.entryIndex, location.bulletIndex, nextText);
      await tick();
    }
    clearSaveTimer();
    if (!(await saveEdits())) return;
    regeneratingBullet = true;
    bulletRegenerationError = null;
    bulletRegenerationStatus = "";
    try {
      const response = await api.tailor.regenerateBullet(structured.id, {
        section: location.section,
        sourceEntryId: entry.sourceEntryId,
        bulletId,
        instruction: bulletInstruction.trim() || undefined,
      });
      setTailoring(response.tailoring);
      const nextDraft = response.tailoring.resumeDraft;
      const nextLocation = nextDraft ? findBulletLocation(nextDraft, bulletId) : null;
      if (nextDraft && nextLocation) {
        editingBullet = nextLocation;
        editingBulletText = nextDraft[nextLocation.section][nextLocation.entryIndex].bullets[nextLocation.bulletIndex].text;
        bulletInstruction = "";
        bulletRegenerationStatus = "Bullet updated.";
      } else {
        editingBullet = null;
      }
    } catch (cause) {
      bulletRegenerationError = errorMessage(cause, "Could not rewrite this bullet");
    } finally {
      regeneratingBullet = false;
    }
  }

  function includeEvidence(id: string) {
    if (!draft || !structured) return;
    const evidence = evidenceById.get(id);
    if (!evidence || (evidence.sourceType !== "experience" && evidence.sourceType !== "project")) return;
    selectedEvidenceIds = [...new Set([...selectedEvidenceIds, id])];
  }

  function removedItemKey(item: TailoredResume["removedForSpace"][number], itemIndex: number): string {
    return `${item.section ?? "unknown"}:${item.sourceEntryId ?? ""}:${item.evidenceId}:${itemIndex}`;
  }

  async function restoreRemovedItem(itemIndex: number) {
    if (!compiled || !structured || restoringEvidenceId) return;
    const item = compiled.resume.removedForSpace[itemIndex];
    if (!item) return;
    const itemKey = removedItemKey(item, itemIndex);
    restoringEvidenceId = itemKey;
    error = null;
    try {
      const restoration = restoreRemovedResumeContent(compiled.resume, itemIndex);
      if (!restoration.restored) {
        throw new Error("This item cannot be restored from the saved preview.");
      }
      const next = restoration.resume;
      if ((item.section === "experience" || item.section === "projects") && item.sourceEntryId && item.bullet) {
        const entry = next[item.section].find((candidate) => candidate.sourceEntryId === item.sourceEntryId);
        const restoredBullet = entry?.bullets.find((bullet) => bullet.id === item.bullet?.id);
        if (restoredBullet) restoredBullet.locked = true;
      }
      replaceDraft(next);
      await tick();
      if (compileTimer !== null) window.clearTimeout(compileTimer);
      compileTimer = null;
      await compilePreview();
    } catch (cause) {
      error = errorMessage(cause, "Could not restore this content");
    } finally {
      restoringEvidenceId = null;
    }
  }

  function artifactFileName(artifact: TailoringArtifact): string {
    const base = tailoredResumePdfFileName(job?.company_name, job?.title);
    return base.replace(/\.pdf$/i, `-v${artifact.revision}.pdf`);
  }

  async function downloadArtifact(artifact: TailoringArtifact) {
    if (!structured || artifactBusyId) return;
    artifactBusyId = artifact.id;
    artifactsError = null;
    try {
      const pdf = await api.tailor.artifacts.download(structured.id, artifact.id);
      const delivery = await exportPdfBytes(
        artifactFileName(artifact),
        new Uint8Array(await pdf.arrayBuffer()),
      );
      if (delivery === "downloaded") feedback.success("PDF downloaded");
    } catch (cause) {
      artifactsError = errorMessage(cause, "Could not download this PDF");
    } finally {
      artifactBusyId = null;
    }
  }

  async function selectArtifact(artifact: TailoringArtifact) {
    if (!structured || artifactBusyId || artifact.selected) return;
    artifactBusyId = artifact.id;
    artifactsError = null;
    try {
      const response = await api.tailor.artifacts.select(structured.id, artifact.id);
      artifacts = artifacts.map((item) => ({
        ...item,
        selected: item.id === response.artifact.id,
      }));
    } catch (cause) {
      artifactsError = errorMessage(cause, "Could not select this PDF");
    } finally {
      artifactBusyId = null;
    }
  }

  async function deleteArtifact() {
    if (!structured || !artifactDeleteTarget || artifactBusyId) return;
    const target = artifactDeleteTarget;
    artifactBusyId = target.id;
    artifactsError = null;
    try {
      await api.tailor.artifacts.delete(structured.id, target.id);
      artifactDeleteTarget = null;
      await loadArtifactHistory(structured.id);
    } catch (cause) {
      artifactsError = errorMessage(cause, "Could not delete this PDF");
    } finally {
      artifactBusyId = null;
    }
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
    const startedAt = performance.now();
    const tailoringId = structured.id;
    const revision = ++compileRevision;
    compiling = true;
    previewError = null;
    try {
      const result = await compileResumeDocument(draft, priorityEvidenceIds);
      if (revision !== compileRevision) return null;
      compiled = result;
      void api.tailor.recordQuality(tailoringId, {
        stage: "compile",
        outcome: "succeeded",
        durationMs: Math.round(performance.now() - startedAt),
        pageCount: result.pageCount,
      }).catch(() => undefined);
      return result;
    } catch (cause) {
      if (revision === compileRevision) {
        previewError = errorMessage(cause, "Could not build the resume preview");
        const failure = errorMessage(cause).toLocaleLowerCase();
        const errorCode = failure.includes("wasm")
          ? "compiler_wasm_failed"
          : failure.includes("clone")
            ? "compiler_clone_failed"
            : "compiler_failed";
        void api.tailor.recordQuality(tailoringId, {
          stage: "compile",
          outcome: "failed",
          durationMs: Math.round(performance.now() - startedAt),
          errorCode,
        }).catch(() => undefined);
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

  function handlePreviewReady(durationMs: number) {
    if (!structured || !compiled) return;
    void api.tailor.recordQuality(structured.id, {
      stage: "preview",
      outcome: "succeeded",
      durationMs,
      pageCount: compiled.pageCount,
    }).catch(() => undefined);
  }

  function handlePreviewError(message: string) {
    previewError = message;
    if (!structured) return;
    void api.tailor.recordQuality(structured.id, {
      stage: "preview",
      outcome: "failed",
      errorCode: "pdf_preview_failed",
    }).catch(() => undefined);
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
        error = "Resolve the evidence warnings before exporting this resume.";
        return;
      }
      const pdfVerification = await verifyCompiledResumePdf(result.pdf, result.resume);
      if (!pdfVerification.valid) {
        error = "The PDF is missing resume content. Rebuild the preview and try again.";
        clearPreview();
        return;
      }
      const pdfBlob = new Blob([Uint8Array.from(result.pdf)], { type: "application/pdf" });
      const response = await api.tailor.createArtifact(structured.id, {
        pdf: pdfBlob,
        resume: result.resume,
        validation,
        typstSource: result.source,
        templateVersion: RESUME_TEMPLATE_VERSION,
        compilerVersion: RESUME_COMPILER_VERSION,
        pageCount: result.pageCount,
      });
      artifacts = [response.artifact, ...artifacts.filter((artifact) => artifact.id !== response.artifact.id)]
        .sort((left, right) => right.revision - left.revision);
      const delivery = await exportPdfBytes(
        tailoredResumePdfFileName(job?.company_name, job?.title),
        result.pdf,
      );
      if (delivery === "downloaded") feedback.success("Resume downloaded");
    } catch (cause) {
      error = errorMessage(cause, "Could not export the resume");
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
                {#if requirement.source.quote}
                  <blockquote>
                    <span>From the posting</span>
                    “{requirement.source.quote}”
                  </blockquote>
                {/if}
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
                          class:locked={bullet.locked}
                          type="button"
                          aria-label={`${bullet.locked ? "Locked bullet" : "Edit bullet"}: ${bullet.text}`}
                          onclick={() => openBulletEditor("experience", entryIndex, bulletIndex)}
                        >
                          <span class="bullet-mark" aria-hidden="true">•</span>
                          <span class="bullet-copy">
                            <span>{bullet.text}</span>
                            <small>
                              {#if bullet.locked}<LockSimple size={13} weight="fill" aria-hidden="true" /> Locked{:else}Edit and compare with original{/if}
                            </small>
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
                          class:locked={bullet.locked}
                          type="button"
                          aria-label={`${bullet.locked ? "Locked bullet" : "Edit bullet"}: ${bullet.text}`}
                          onclick={() => openBulletEditor("projects", entryIndex, bulletIndex)}
                        >
                          <span class="bullet-mark" aria-hidden="true">•</span>
                          <span class="bullet-copy">
                            <span>{bullet.text}</span>
                            <small>
                              {#if bullet.locked}<LockSimple size={13} weight="fill" aria-hidden="true" /> Locked{:else}Edit and compare with original{/if}
                            </small>
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

            <section class="resume-section artifact-history" aria-labelledby="pdf-history-heading">
              <header class="resume-section-heading">
                <h2 id="pdf-history-heading">PDF history</h2>
                {#if artifacts.length}<span>{artifacts.length}</span>{/if}
              </header>
              {#if artifactsError}
                <InlineFailure
                  title="PDF history needs attention"
                  message={artifactsError}
                  retryLabel="Try again"
                  onRetry={() => void loadArtifactHistory()}
                />
              {/if}
              {#if artifactsLoading && artifacts.length === 0}
                <div class="artifact-loading"><Spinner size={18} label="Loading PDF history" /></div>
              {:else if artifacts.length === 0}
                <p class="artifact-empty">PDFs you download will stay here as separate versions.</p>
              {:else}
                <div class="artifact-list">
                  {#each artifacts as artifact (artifact.id)}
                    <article class="artifact-row" class:selected={artifact.selected}>
                      <span class="artifact-icon" aria-hidden="true"><FilePdf size={20} weight="bold" /></span>
                      <span class="artifact-copy">
                        <strong>Version {artifact.revision}</strong>
                        <small>
                          {artifactDateFormatter.format(new Date(artifact.createdAt))}
                          {#if artifact.pageCount} · {artifact.pageCount} page{artifact.pageCount === 1 ? "" : "s"}{/if}
                        </small>
                        {#if artifact.selected}<span class="artifact-selected"><Check size={13} weight="bold" /> Ready to use</span>{/if}
                      </span>
                      <span class="artifact-actions">
                        {#if !artifact.selected}
                          <button
                            type="button"
                            class="row-action"
                            disabled={artifactBusyId !== null}
                            onclick={() => void selectArtifact(artifact)}
                          >Use this version</button>
                        {/if}
                        <button
                          type="button"
                          class="icon-btn"
                          aria-label={`Download version ${artifact.revision}`}
                          disabled={artifactBusyId !== null}
                          onclick={() => void downloadArtifact(artifact)}
                        >
                          {#if artifactBusyId === artifact.id}<Spinner size={16} />{:else}<DownloadSimple size={17} weight="bold" />{/if}
                        </button>
                        <button
                          type="button"
                          class="icon-btn artifact-delete"
                          aria-label={`Delete version ${artifact.revision}`}
                          disabled={artifactBusyId !== null}
                          onclick={() => (artifactDeleteTarget = artifact)}
                        ><Trash size={17} weight="bold" /></button>
                      </span>
                    </article>
                  {/each}
                </div>
              {/if}
            </section>
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
            {:else if compiled}
              <ResumePdfPreview
                pdf={compiled.pdf}
                pageCount={compiled.pageCount}
                onReady={handlePreviewReady}
                onError={handlePreviewError}
              />
              <div class="preview-meta">
                <span class="preview-page-count">{compiled.pageCount} page{compiled.pageCount === 1 ? "" : "s"}</span>
                {#if compiled.resume.removedForSpace.length}
                  <section class="removed-for-space" aria-labelledby="removed-for-space-heading">
                    <div class="removed-for-space-heading">
                      <div>
                        <h2 id="removed-for-space-heading">Removed to fit</h2>
                        <span>{compiled.resume.removedForSpace.length}</span>
                      </div>
                      <p class="page-count-warning">
                        <WarningCircle size={17} weight="fill" aria-hidden="true" />
                        <span>Current preview: {compiled.pageCount} page{compiled.pageCount === 1 ? "" : "s"}. Restoring content can increase the page count. We’ll rebuild the preview before download.</span>
                      </p>
                    </div>
                    <div class="removed-content-list">
                      {#each compiled.resume.removedForSpace as item, itemIndex (removedItemKey(item, itemIndex))}
                        {@const itemKey = removedItemKey(item, itemIndex)}
                        <div class="removed-content-row">
                          <span>
                            <strong>
                              {item.section === "experience"
                                ? "Experience bullet"
                                : item.section === "projects"
                                  ? "Project bullet"
                                  : "Resume section"}
                            </strong>
                            <small>{item.label}</small>
                          </span>
                          <button
                            type="button"
                            class="row-action"
                            disabled={restoringEvidenceId !== null}
                            aria-label={`Restore ${item.label}`}
                            onclick={() => void restoreRemovedItem(itemIndex)}
                          >
                            {#if restoringEvidenceId === itemKey}
                              <Spinner size={16} label="Restoring content" />
                            {:else}
                              <ArrowCounterClockwise size={16} weight="bold" aria-hidden="true" />
                            {/if}
                            Restore
                          </button>
                        </div>
                      {/each}
                    </div>
                  </section>
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
    busy={regeneratingBullet}
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

      <div class="trust-control-row">
        <span>
          <strong>Keep this bullet</strong>
          <small>Future updates won’t rewrite or remove it.</small>
        </span>
        <Switch
          checked={Boolean(activeBullet.locked)}
          disabled={regeneratingBullet}
          onCheckedChange={setActiveBulletLocked}
          aria-label="Keep this bullet unchanged"
        />
      </div>

      <section class="bullet-diff" aria-labelledby="bullet-diff-heading">
        <header>
          <h3 id="bullet-diff-heading">Original vs tailored</h3>
          {#if activeBulletEvidence.length}
            <p>Based on {activeBulletEvidence.map((item) => item?.label).filter(Boolean).join(", ")}</p>
          {/if}
        </header>
        {#if activeBulletOriginal}
          <div class="word-diff">
            <div class="diff-block">
              <span class="diff-label">Original</span>
              <p class="diff-copy" aria-label={activeBulletOriginal}>
                {#each activeBulletDiff.filter((part) => part.kind !== "added") as part}
                  {#if part.kind === "removed"}
                    <del aria-hidden="true">{part.value}</del>
                  {:else}
                    <span aria-hidden="true">{part.value}</span>
                  {/if}
                {/each}
              </p>
            </div>
            <div class="diff-block">
              <span class="diff-label">Tailored</span>
              <p class="diff-copy" aria-label={editingBulletText}>
                {#each activeBulletDiff.filter((part) => part.kind !== "removed") as part}
                  {#if part.kind === "added"}
                    <ins aria-hidden="true">{part.value}</ins>
                  {:else}
                    <span aria-hidden="true">{part.value}</span>
                  {/if}
                {/each}
              </p>
            </div>
          </div>
        {:else}
          <p class="diff-empty">No saved source text is available for comparison.</p>
        {/if}
      </section>

      <form
        class="bullet-regenerator"
        onsubmit={(event) => {
          event.preventDefault();
          void regenerateActiveBullet();
        }}
      >
        <div class="bullet-regenerator-heading">
          <Sparkle size={18} weight="fill" aria-hidden="true" />
          <span>
            <strong>Rewrite this bullet</strong>
            <small>{activeBullet.locked ? "Unlock it first to make another version." : "The rewrite can only use the same saved evidence."}</small>
          </span>
        </div>
        <label for="bullet-rewrite-direction">Direction <span>(optional)</span></label>
        <div class="bullet-regenerator-controls">
          <input
            id="bullet-rewrite-direction"
            class="input-field"
            type="text"
            placeholder="Make it shorter"
            enterkeyhint="done"
            bind:value={bulletInstruction}
            disabled={activeBullet.locked || regeneratingBullet}
          />
          <button
            class="btn-secondary"
            type="submit"
            disabled={activeBullet.locked || regeneratingBullet}
          >
            {#if regeneratingBullet}<Spinner size={16} />{:else}<Sparkle size={16} weight="bold" aria-hidden="true" />{/if}
            Rewrite
          </button>
        </div>
        {#if bulletRegenerationError}
          <InlineFailure title="Couldn’t rewrite this bullet" message={bulletRegenerationError} />
        {/if}
        {#if bulletRegenerationStatus}
          <p class="regeneration-status" role="status" aria-live="polite">
            <Check size={15} weight="bold" aria-hidden="true" /> {bulletRegenerationStatus}
          </p>
        {/if}
      </form>

      <div class="bullet-sheet-actions">
        <button
          type="button"
          disabled={editingBullet.bulletIndex === 0 || regeneratingBullet}
          onclick={() => moveActiveBullet(-1)}
        >
          <ArrowUp size={17} weight="bold" aria-hidden="true" /> Move up
        </button>
        <button
          type="button"
          disabled={editingBullet.bulletIndex === activeBulletCount - 1 || regeneratingBullet}
          onclick={() => moveActiveBullet(1)}
        >
          <ArrowDown size={17} weight="bold" aria-hidden="true" /> Move down
        </button>
        <button
          class="leave-out-action"
          type="button"
          disabled={activeBullet.locked || regeneratingBullet}
          onclick={excludeActiveBullet}
        >
          <X size={17} weight="bold" aria-hidden="true" /> {activeBullet.locked ? "Unlock to leave out" : "Leave out"}
        </button>
      </div>

      <button
        class="btn-primary btn-accent full-width"
        type="button"
        disabled={!editingBulletText.trim() || regeneratingBullet}
        onclick={commitBulletEditor}
      >Done</button>
    </div>
  </Modal>
{/if}

{#if artifactDeleteTarget}
  <Modal
    title={`Delete version ${artifactDeleteTarget.revision}?`}
    subtitle="This removes the saved PDF. Your current tailored resume stays unchanged."
    busy={artifactBusyId === artifactDeleteTarget.id}
    onclose={() => (artifactDeleteTarget = null)}
  >
    <div class="modal-actions">
      <button
        class="btn-secondary"
        type="button"
        disabled={artifactBusyId !== null}
        onclick={() => (artifactDeleteTarget = null)}
      >Cancel</button>
      <button
        class="btn-secondary btn-danger"
        type="button"
        disabled={artifactBusyId !== null}
        onclick={() => void deleteArtifact()}
      >
        {#if artifactBusyId === artifactDeleteTarget.id}<Spinner size={16} />{:else}<Trash size={17} weight="bold" aria-hidden="true" />{/if}
        Delete PDF
      </button>
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
  .update-resume-action p {
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
  .disclosure-section {
    border-bottom: 1px solid var(--color-line);
  }

  .requirement-row > summary,
  .disclosure-section > summary {
    min-height: var(--tap-min);
    display: grid;
    align-items: center;
    cursor: pointer;
    list-style: none;
  }

  .requirement-row > summary::-webkit-details-marker,
  .disclosure-section > summary::-webkit-details-marker {
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
  .excluded-row strong {
    color: var(--color-ink);
    font-size: var(--fs-sm);
    font-weight: 600;
    line-height: 1.35;
  }

  .requirement-copy small,
  .selection-row small,
  .summary-row small,
  .excluded-row small,
  .gaps-summary small {
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

  .requirement-detail blockquote {
    margin: 0;
    padding-inline-start: var(--space-3);
    border-inline-start: 2px solid var(--color-line-2);
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    line-height: var(--leading-body);
  }

  .requirement-detail blockquote span {
    display: block;
    margin-block-end: var(--space-1);
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    font-weight: 600;
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
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-ink-4);
    font-size: var(--fs-2xs);
    line-height: 1.35;
  }

  .bullet-row.locked .bullet-mark,
  .bullet-row.locked .bullet-copy small {
    color: var(--color-accent-soft-ink);
  }

  .bullet-row > :global(svg) {
    margin-top: var(--space-1);
    color: var(--color-ink-4);
  }

  .disclosure-section {
    display: grid;
  }

  .disclosure-section > summary {
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

  .artifact-list {
    border-top: 1px solid var(--color-line);
  }

  .artifact-loading {
    min-height: calc(var(--tap-min) + var(--space-4));
    display: grid;
    place-items: center;
  }

  .artifact-empty {
    margin: 0;
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: var(--leading-body);
  }

  .artifact-row {
    min-height: calc(var(--tap-min) + var(--space-4));
    padding-block: var(--space-3);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    border-bottom: 1px solid var(--color-line);
  }

  .artifact-row.selected {
    box-shadow: inset 2px 0 var(--color-accent);
    padding-inline-start: var(--space-3);
  }

  .artifact-icon {
    width: var(--control-height-small);
    height: var(--control-height-small);
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    background: var(--color-bg-sunken);
    color: var(--color-ink-3);
  }

  .artifact-copy {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  .artifact-copy > strong {
    color: var(--color-ink);
    font-size: var(--fs-sm);
    line-height: 1.35;
  }

  .artifact-copy > small {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }

  .artifact-selected {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-accent-soft-ink);
    font-size: var(--fs-2xs);
    font-weight: 600;
  }

  .artifact-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .row-action:disabled {
    color: var(--color-ink-4);
    cursor: default;
  }

  .artifact-delete {
    color: var(--color-bad);
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

  .preview-meta {
    width: 100%;
    display: grid;
    gap: var(--space-2);
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
  }

  .preview-page-count {
    color: var(--color-ink-2);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .removed-for-space {
    display: grid;
    gap: var(--space-3);
    border-top: 1px solid var(--color-line);
    padding-top: var(--space-4);
  }

  .removed-for-space-heading {
    display: grid;
    gap: var(--space-2);
  }

  .removed-for-space-heading > div {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .removed-for-space-heading h2 {
    margin: 0;
    color: var(--color-ink);
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: 600;
  }

  .removed-for-space-heading > div > span {
    color: var(--color-ink-4);
    font-variant-numeric: tabular-nums;
  }

  .page-count-warning {
    margin: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-2);
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.45;
  }

  .page-count-warning > :global(svg) {
    margin-top: var(--space-1);
    color: var(--color-warn);
  }

  .removed-content-list {
    border-top: 1px solid var(--color-line);
  }

  .removed-content-row {
    min-height: calc(var(--tap-min) + var(--space-3));
    padding-block: var(--space-2);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    border-bottom: 1px solid var(--color-line);
  }

  .removed-content-row > span {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  .removed-content-row strong {
    color: var(--color-ink-2);
    font-size: var(--fs-xs);
  }

  .removed-content-row small {
    display: -webkit-box;
    overflow: hidden;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
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

  .trust-control-row {
    min-height: calc(var(--tap-min) + var(--space-3));
    padding-block: var(--space-2);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-4);
    border-top: 1px solid var(--color-line);
    border-bottom: 1px solid var(--color-line);
  }

  .trust-control-row > span,
  .bullet-regenerator-heading > span {
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  .trust-control-row strong,
  .bullet-regenerator-heading strong {
    color: var(--color-ink);
    font-size: var(--fs-sm);
    line-height: 1.35;
  }

  .trust-control-row small,
  .bullet-regenerator-heading small {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .bullet-diff {
    display: grid;
    gap: var(--space-3);
  }

  .bullet-diff > header {
    display: grid;
    gap: var(--space-1);
  }

  .bullet-diff h3,
  .bullet-diff p,
  .bullet-regenerator p {
    margin: 0;
  }

  .bullet-diff h3 {
    color: var(--color-ink);
    font-size: var(--fs-sm);
    font-weight: 600;
    line-height: 1.35;
  }

  .bullet-diff > header p,
  .diff-empty {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.4;
  }

  .word-diff {
    display: grid;
    gap: var(--space-3);
  }

  .diff-block {
    display: grid;
    grid-template-columns: var(--control-height) minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3);
  }

  .diff-label {
    padding-top: var(--space-1);
    color: var(--color-ink-4);
    font-size: var(--fs-2xs);
    font-weight: 600;
  }

  .diff-copy {
    color: var(--color-ink-2);
    font-size: var(--fs-xs);
    line-height: 1.55;
    white-space: pre-wrap;
  }

  .diff-copy del,
  .diff-copy ins {
    border-radius: var(--radius-xs);
    padding-inline: var(--space-1);
  }

  .diff-copy del {
    background: var(--color-bad-soft);
    color: var(--color-bad);
    text-decoration-thickness: 1px;
  }

  .diff-copy ins {
    background: var(--color-good-soft);
    color: var(--color-good);
    text-decoration: none;
  }

  .bullet-regenerator {
    display: grid;
    gap: var(--space-3);
    padding-block: var(--space-3);
    border-top: 1px solid var(--color-line);
    border-bottom: 1px solid var(--color-line);
  }

  .bullet-regenerator-heading {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-2);
  }

  .bullet-regenerator-heading > :global(svg) {
    margin-top: var(--space-1);
    color: var(--color-accent-soft-ink);
  }

  .bullet-regenerator > label {
    color: var(--color-ink-2);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .bullet-regenerator > label span {
    color: var(--color-ink-4);
    font-weight: 400;
  }

  .bullet-regenerator-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
  }

  .regeneration-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-good);
    font-size: var(--fs-xs);
    font-weight: 600;
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

    .artifact-row {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .artifact-actions {
      grid-column: 2;
      justify-content: flex-start;
    }

    .bullet-regenerator-controls {
      grid-template-columns: minmax(0, 1fr);
    }

    .bullet-regenerator-controls .btn-secondary {
      width: 100%;
    }
  }
</style>
