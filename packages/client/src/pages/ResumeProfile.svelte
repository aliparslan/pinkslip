<script lang="ts">
  import { onMount } from "svelte";
  import { api, type ResumeProfile, type OptionalSectionKind, type DegreeType } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { navigate } from "../router";
  import {
    announceLocalNavigation,
    registerLocalBackHandler,
    requestBack,
  } from "../lib/nav-back";
  import Plus from "phosphor-svelte/lib/Plus";
  import Trash from "phosphor-svelte/lib/Trash";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import UploadSimple from "phosphor-svelte/lib/UploadSimple";
  import Spinner from "../components/Spinner.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import SaveStatus from "../components/SaveStatus.svelte";
  import Modal from "../components/Modal.svelte";
  import PageFailure from "../components/PageFailure.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import { SavePresentation } from "../lib/task-presentation.svelte";
  import { createEmptyResumeProfile } from "../../../../shared/resume-profile";
  import { registerAutosaveFlush } from "../lib/autosave-lifecycle";
  import { isIosApp } from "../lib/platform";
  import {
    DEGREE_OPTIONS,
    US_STATES,
    formatDegree,
    formatResumeDate,
    hasResumeContent,
    inferDegreeType,
    inferFieldOfStudy,
    joinUsLocation,
    monthInputValue,
    splitUsLocation,
  } from "../lib/resume-fields";

  const OPTIONAL_SECTION_LABELS: Record<OptionalSectionKind, string> = {
    leadership: "Leadership & affiliations",
    certifications: "Certifications",
    publications: "Publications",
    awards: "Awards & honors",
    volunteer: "Volunteer experience",
  };

  type CollectionSection = "experience" | "education" | "projects";
  type DirectSection = "contact" | "skills" | "notes" | OptionalSectionKind;
  type ResumeView =
    | { kind: "overview" }
    | { kind: "section"; section: DirectSection }
    | { kind: "record"; section: CollectionSection; id: string };

  const RESUME_OVERVIEW_SNAPSHOT = "resume:overview";

  let loading = $state(true);
  let loaded = $state(false);
  let saving = $state(false);
  let error: string | null = $state(null);
  const savePresentation = new SavePresentation();
  let profile: ResumeProfile = $state(createEmptyResumeProfile());
  let notes = $state("");
  let notesUnavailable = $state(false);
  let notesRetrying = $state(false);
  let autosaveTimer: number | null = null;
  let saveAgain = false;
  let importing = $state(false);
  let importInput: HTMLInputElement | null = $state(null);
  let pendingImport: Partial<ResumeProfile> | null = $state(null);
  let view: ResumeView = $state({ kind: "overview" });
  let addSectionOpen = $state(false);
  let draftRecord: { section: CollectionSection; id: string } | null = null;
  let draftDirectSection: "skills" | OptionalSectionKind | null = null;
  const nativeIos = isIosApp();

  function currentDraftValue(): unknown {
    if (!draftRecord) return null;
    return profile[draftRecord.section].find((entry) => entry.id === draftRecord?.id);
  }

  function currentDirectDraftValue(): unknown {
    if (draftDirectSection === "skills") return profile.skills;
    if (draftDirectSection) return optionalSectionFor(draftDirectSection);
    return null;
  }

  function undoable(message: string, restore: () => void) {
    if (!nativeIos) return;
    feedback.show({ message, action: { label: "Undo", run: restore } });
  }

  function removeWithUndo<T>(
    index: number,
    message: string,
    getItems: () => T[],
    setItems: (items: T[]) => void,
  ) {
    const removed = getItems()[index];
    if (removed === undefined) return;
    setItems(getItems().filter((_, itemIndex) => itemIndex !== index));
    queueAutosave();
    undoable(message, () => {
      const next = [...getItems()];
      next.splice(Math.max(0, index), 0, removed);
      setItems(next);
      queueAutosave();
    });
  }

  function recordId(activeView: ResumeView): string {
    return activeView.kind === "record" ? activeView.id : "";
  }

  let currentRecordId = $derived(recordId(view));

  let availableOptionalSections = $derived.by(() => {
    const active = new Set(profile.optionalSections.map((section) => section.kind));
    return (Object.keys(OPTIONAL_SECTION_LABELS) as OptionalSectionKind[])
      .filter((kind) => !active.has(kind));
  });

  let screenTitle = $derived.by(() => {
    if (view.kind === "overview") return "Resume";
    if (view.kind === "section") return sectionLabel(view.section);
    if (view.section === "experience") return "Edit experience";
    if (view.section === "education") return "Edit education";
    return "Edit project";
  });

  function sectionLabel(section: DirectSection): string {
    if (section === "contact") return "Contact info";
    if (section === "skills") return "Skills";
    if (section === "notes") return "Tailoring notes";
    return OPTIONAL_SECTION_LABELS[section];
  }

  function genId(): string {
    return crypto.randomUUID().slice(0, 8);
  }

  function contactLine(): string {
    return [profile.contact.email, profile.contact.phone, profile.contact.location]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" · ");
  }

  function educationDetail(entry: ResumeProfile["education"][number]): string {
    return [entry.degree, entry.location].filter(Boolean).join(" · ");
  }

  function projectDetail(entry: ResumeProfile["projects"][number]): string {
    return [entry.role, entry.teamInfo].map((value) => value?.trim()).filter(Boolean).join(" · ");
  }

  function firstBullet(items: string[]): string {
    return items.find((item) => item.trim())?.trim() ?? "";
  }

  function preventFormSubmit(event: SubmitEvent) {
    event.preventDefault();
  }

  function optionalSectionFor(section: DirectSection) {
    return profile.optionalSections.find((candidate) => candidate.kind === section);
  }

  function hydrateEducationEntry(entry: ResumeProfile["education"][number]): ResumeProfile["education"][number] {
    const degreeType = entry.degreeType ?? inferDegreeType(entry.degree);
    const fieldOfStudy = entry.fieldOfStudy ?? inferFieldOfStudy(entry.degree, degreeType);
    return {
      ...entry,
      degreeType: degreeType || undefined,
      fieldOfStudy,
      degree: formatDegree(degreeType, fieldOfStudy) || entry.degree,
    };
  }

  function updateEducationDegree(
    entry: ResumeProfile["education"][number],
    updates: { degreeType?: DegreeType | ""; fieldOfStudy?: string }
  ) {
    const degreeType = updates.degreeType ?? entry.degreeType ?? "";
    const fieldOfStudy = updates.fieldOfStudy ?? entry.fieldOfStudy ?? "";
    entry.degreeType = degreeType || undefined;
    entry.fieldOfStudy = fieldOfStudy;
    entry.degree = formatDegree(degreeType, fieldOfStudy);
    queueAutosave();
  }

  function updateLocation(target: { location: string }, part: "city" | "state", value: string) {
    const location = splitUsLocation(target.location);
    location[part] = value;
    target.location = joinUsLocation(location.city, location.state);
    queueAutosave();
  }

  function isCurrentRole(endDate: string): boolean {
    return /^(present|current)$/i.test(endDate.trim());
  }

  function setCurrentRole(entry: ResumeProfile["experience"][number], current: boolean) {
    entry.endDate = current ? "Present" : "";
    queueAutosave();
  }

  function dateRange(startDate: string, endDate: string): string {
    return [formatResumeDate(startDate), formatResumeDate(endDate)].filter(Boolean).join(" – ");
  }

  function prepareResumeEditor() {
    if (nativeIos && view.kind === "overview") {
      announceLocalNavigation(RESUME_OVERVIEW_SNAPSHOT);
    }
  }

  function openSection(section: DirectSection, captureOverview = true) {
    if (captureOverview) prepareResumeEditor();
    view = { kind: "section", section };
  }

  function openRecord(section: CollectionSection, id: string, captureOverview = true) {
    if (captureOverview) prepareResumeEditor();
    view = { kind: "record", section, id };
  }

  function returnToOverview() {
    if (
      nativeIos
      && view.kind === "record"
      && draftRecord?.section === view.section
      && draftRecord.id === view.id
      && !hasResumeContent(currentDraftValue())
    ) {
      const draftId = view.id;
      if (view.section === "experience") profile.experience = profile.experience.filter((entry) => entry.id !== draftId);
      if (view.section === "education") profile.education = profile.education.filter((entry) => entry.id !== draftId);
      if (view.section === "projects") profile.projects = profile.projects.filter((entry) => entry.id !== draftId);
      draftRecord = null;
    }
    if (nativeIos && draftDirectSection && !hasResumeContent(currentDirectDraftValue())) {
      if (draftDirectSection === "skills") {
        profile.skills = profile.skills.filter((skill) => hasResumeContent(skill));
      } else {
        const draftKind = draftDirectSection;
        profile.optionalSections = profile.optionalSections.filter((section) => section.kind !== draftKind);
      }
      draftDirectSection = null;
    }
    view = { kind: "overview" };
  }

  function handleBack() {
    if (view.kind !== "overview") {
      if (!nativeIos || !requestBack()) returnToOverview();
      return;
    }
    if (!requestBack()) navigate("/you");
  }

  function addExperience() {
    prepareResumeEditor();
    const id = genId();
    profile.experience = [
      ...profile.experience,
      { id, company: "", title: "", location: "", startDate: "", endDate: "", bullets: [""] },
    ];
    if (nativeIos) draftRecord = { section: "experience", id };
    else queueAutosave();
    openRecord("experience", id, false);
  }

  function removeExperience(id: string) {
    const index = profile.experience.findIndex((entry) => entry.id === id);
    removeWithUndo(index, "Position removed", () => profile.experience, (items) => (profile.experience = items));
    view = { kind: "overview" };
  }

  function addEducation() {
    prepareResumeEditor();
    const id = genId();
    profile.education = [
      ...profile.education,
      { id, institution: "", degree: "", degreeType: undefined, fieldOfStudy: "", location: "", startDate: "", endDate: "", gpa: "" },
    ];
    if (nativeIos) draftRecord = { section: "education", id };
    else queueAutosave();
    openRecord("education", id, false);
  }

  function removeEducation(id: string) {
    const index = profile.education.findIndex((entry) => entry.id === id);
    removeWithUndo(index, "Education removed", () => profile.education, (items) => (profile.education = items));
    view = { kind: "overview" };
  }

  function addProject() {
    prepareResumeEditor();
    const id = genId();
    profile.projects = [
      ...profile.projects,
      { id, name: "", url: "", date: "", bullets: [""] },
    ];
    if (nativeIos) draftRecord = { section: "projects", id };
    else queueAutosave();
    openRecord("projects", id, false);
  }

  function removeProject(id: string) {
    const index = profile.projects.findIndex((entry) => entry.id === id);
    removeWithUndo(index, "Project removed", () => profile.projects, (items) => (profile.projects = items));
    view = { kind: "overview" };
  }

  function addSkill() {
    profile.skills = [...profile.skills, { category: "", items: "" }];
    queueAutosave();
  }

  function addSkillAndOpen() {
    prepareResumeEditor();
    if (profile.skills.length === 0) {
      profile.skills = [{ category: "", items: "" }];
    }
    if (nativeIos && !hasResumeContent(profile.skills)) draftDirectSection = "skills";
    else queueAutosave();
    openSection("skills", false);
  }

  function removeSkill(index: number) {
    removeWithUndo(index, "Skill category removed", () => profile.skills, (items) => (profile.skills = items));
  }

  function addOptionalSection(kind: OptionalSectionKind) {
    prepareResumeEditor();
    profile.optionalSections = [
      ...profile.optionalSections,
      { kind, items: [{ category: "", items: "" }] },
    ];
    addSectionOpen = false;
    if (nativeIos) draftDirectSection = kind;
    else queueAutosave();
    openSection(kind, false);
  }

  function removeOptionalSection(kind: OptionalSectionKind) {
    const index = profile.optionalSections.findIndex((section) => section.kind === kind);
    removeWithUndo(
      index,
      `${OPTIONAL_SECTION_LABELS[kind]} removed`,
      () => profile.optionalSections,
      (items) => (profile.optionalSections = items),
    );
    if (draftDirectSection === kind) draftDirectSection = null;
    view = { kind: "overview" };
  }

  function addOptionalItem(kind: OptionalSectionKind) {
    profile.optionalSections = profile.optionalSections.map((section) =>
      section.kind === kind
        ? { ...section, items: [...section.items, { category: "", items: "" }] }
        : section
    );
    queueAutosave();
  }

  function removeOptionalItem(kind: OptionalSectionKind, index: number) {
    removeWithUndo(
      index,
      "Item removed",
      () => optionalSectionFor(kind)?.items ?? [],
      (items) => {
        profile.optionalSections = profile.optionalSections.map((section) =>
          section.kind === kind ? { ...section, items } : section
        );
      },
    );
  }

  function addBullet(items: string[]) {
    queueAutosave();
    return [...items, ""];
  }

  function removeBullet(items: string[], index: number) {
    queueAutosave();
    return items.length <= 1 ? items : items.filter((_, itemIndex) => itemIndex !== index);
  }

  async function loadAll() {
    loading = true;
    error = null;
    notesUnavailable = false;
    try {
      let profileRes: Awaited<ReturnType<typeof api.profile.get>>;
      let corpusRes: Awaited<ReturnType<typeof api.corpus.get>> | null;
      if (nativeIos) {
        const [profileResult, corpusResult] = await Promise.allSettled([
          api.profile.get(),
          api.corpus.get(),
        ]);
        if (profileResult.status === "rejected") throw profileResult.reason;
        profileRes = profileResult.value;
        corpusRes = corpusResult.status === "fulfilled" ? corpusResult.value : null;
        notesUnavailable = corpusResult.status === "rejected";
      } else {
        [profileRes, corpusRes] = await Promise.all([api.profile.get(), api.corpus.get()]);
      }
      const data = profileRes.data;
      let optionalSections = data.optionalSections ?? [];
      if (!optionalSections.length && (data as any).leadership?.length) {
        optionalSections = [{ kind: "leadership" as const, items: (data as any).leadership }];
      }
      profile = {
        ...createEmptyResumeProfile(),
        ...data,
        experience: (data.experience ?? []).filter((entry) => hasResumeContent(entry)),
        education: (data.education ?? []).filter((entry) => hasResumeContent(entry)).map(hydrateEducationEntry),
        projects: (data.projects ?? []).filter((entry) => hasResumeContent(entry)),
        skills: (data.skills ?? []).filter((entry) => hasResumeContent(entry)),
        optionalSections: optionalSections.filter((section) => hasResumeContent(section)),
      };
      savePresentation.hydrate(profileRes.updated_at);
      if (corpusRes) notes = corpusRes.content_md ?? "";
      loaded = true;
    } catch (loadError) {
      error = errorMessage(loadError);
    } finally {
      loading = false;
    }
  }

  async function retryNotes() {
    if (notesRetrying) return;
    notesRetrying = true;
    try {
      const corpusRes = await api.corpus.get();
      notes = corpusRes.content_md ?? "";
      notesUnavailable = false;
    } catch (loadError) {
      feedback.error(errorMessage(loadError, "Couldn’t load tailoring notes."));
    } finally {
      notesRetrying = false;
    }
  }

  async function saveAll(keepalive = false) {
    if (saving) {
      saveAgain = true;
      return;
    }
    saving = true;
    error = null;
    const presentationGeneration = savePresentation.begin();
    try {
      const [profileRes] = await Promise.all([
        api.profile.update(profile, { keepalive }),
        notesUnavailable ? Promise.resolve(null) : api.corpus.update(notes, { keepalive }),
      ]);
      savePresentation.succeed(presentationGeneration, profileRes.updated_at ?? new Date().toISOString());
    } catch (saveError) {
      const message = errorMessage(saveError);
      error = message;
      savePresentation.fail(presentationGeneration, message);
    } finally {
      saving = false;
      if (saveAgain) {
        saveAgain = false;
        void saveAll(keepalive);
      }
    }
  }

  function queueAutosave() {
    if (nativeIos && draftRecord) {
      if (!hasResumeContent(currentDraftValue())) return;
      draftRecord = null;
    }
    if (nativeIos && draftDirectSection) {
      if (!hasResumeContent(currentDirectDraftValue())) return;
      draftDirectSection = null;
    }
    savePresentation.markDirty();
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void saveAll();
    }, 800);
  }

  function flushAutosave() {
    if (autosaveTimer === null) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    void saveAll(true);
  }

  function handleInput() {
    queueAutosave();
  }

  async function handlePdfImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importing = true;
    error = null;
    try {
      const { parsePdfToProfile } = await import("../lib/pdf-to-profile");
      const parsed = await parsePdfToProfile(file);
      if (!hasResumeContent(parsed)) {
        throw new Error("No resume details were found");
      }
      pendingImport = parsed;
    } catch (importError) {
      console.error("Resume PDF import failed", importError);
      error = "This PDF couldn’t be read. Try exporting it again or choose another PDF.";
    } finally {
      importing = false;
      input.value = "";
    }
  }

  function importSummary(parsed: Partial<ResumeProfile>): string {
    const parts = [
      [parsed.experience?.length ?? 0, "role", "roles"],
      [parsed.projects?.length ?? 0, "project", "projects"],
      [parsed.education?.length ?? 0, "education entry", "education entries"],
      [parsed.skills?.length ?? 0, "skill group", "skill groups"],
      [parsed.optionalSections?.length ?? 0, "additional section", "additional sections"],
    ] as const;
    return parts
      .filter(([count]) => count > 0)
      .map(([count, singular, plural]) => `${count} ${count === 1 ? singular : plural}`)
      .join(" · ");
  }

  function applyPdfImport() {
    if (!pendingImport) return;
    if (pendingImport.contact) {
      const keys = ["name", "email", "phone", "location", "linkedin", "github", "website"] as const;
      for (const key of keys) {
        const value = pendingImport.contact[key]?.trim();
        if (value) profile.contact[key] = value;
      }
    }
    if (pendingImport.experience?.length) profile.experience = pendingImport.experience;
    if (pendingImport.education?.length) profile.education = pendingImport.education.map(hydrateEducationEntry);
    if (pendingImport.projects?.length) profile.projects = pendingImport.projects;
    if (pendingImport.skills?.length) profile.skills = pendingImport.skills;
    if (pendingImport.optionalSections?.length) profile.optionalSections = pendingImport.optionalSections;
    pendingImport = null;
    feedback.success("Resume imported");
    queueAutosave();
  }

  onMount(() => {
    void loadAll();
    const unregisterAutosaveFlush = registerAutosaveFlush(flushAutosave);
    const unregisterLocalBack = nativeIos
      ? registerLocalBackHandler({
          snapshotKey: RESUME_OVERVIEW_SNAPSHOT,
          isActive: () => view.kind !== "overview",
          commit: returnToOverview,
        })
      : () => undefined;
    return () => {
      unregisterAutosaveFlush();
      unregisterLocalBack();
      savePresentation.destroy();
    };
  });
</script>

<div class="page pushed-screen" class:native-layout={nativeIos}>
  <ScreenNav
    title={screenTitle}
    collapsible={nativeIos && view.kind === "overview"}
    backLabel={view.kind === "overview" ? "Back to You" : "Back"}
    onBack={handleBack}
  >
    {#snippet trailing()}
      <SaveStatus phase={savePresentation.phase} />
    {/snippet}
  </ScreenNav>

  <div class="page-frame resume-frame">
    {#if error && (!nativeIos || loaded)}<div class="alert alert-error alert-spaced" role="alert">{error}</div>{/if}
    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else if nativeIos && error && !loaded}
      <PageFailure
        title="Your resume didn’t load"
        message="Check your connection and try again."
        onRetry={() => void loadAll()}
      />
    {:else if view.kind === "overview"}
      {#if nativeIos}<h1 class="screen-large-title" data-screen-title-anchor>Resume</h1>{/if}
      <input
        class="visually-hidden-input"
        type="file"
        accept=".pdf"
        bind:this={importInput}
        onchange={handlePdfImport}
      />

      <div class="resume-overview">
        <section class="resume-section" aria-labelledby="contact-heading">
          <header class="resume-section-heading">
            <h2 id="contact-heading">Contact info</h2>
          </header>
          <button type="button" class="identity-button" onclick={() => openSection("contact")}>
            <span class="identity-copy">
              <strong id="resume-name">{profile.contact.name.trim() || "Add your name"}</strong>
              <small>{contactLine() || "Add email, phone, and location"}</small>
            </span>
            <CaretRight size={18} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="import-action"
            onclick={() => importInput?.click()}
            disabled={importing}
          >
            {#if importing}<Spinner size={16} />{:else}<UploadSimple size={17} aria-hidden="true" />{/if}
            <span>Import from PDF</span>
          </button>
        </section>

        <section class="resume-section" aria-labelledby="experience-heading">
          <header class="resume-section-heading">
            <div class="section-heading-copy">
              <h2 id="experience-heading">Experience</h2>
              {#if profile.experience.length}<span>{profile.experience.length}</span>{/if}
            </div>
            {#if profile.experience.length}
              <button type="button" class="section-text-action" onclick={addExperience}>Add</button>
            {/if}
          </header>
          {#if profile.experience.length}
            <div class="resume-entries">
              {#each profile.experience as entry (entry.id)}
                <button type="button" class="resume-entry" onclick={() => openRecord("experience", entry.id)}>
                  <span class="entry-copy">
                    <span class="entry-heading">
                      <strong>{entry.title.trim() || "Untitled position"}</strong>
                      {#if entry.startDate || entry.endDate}<small>{dateRange(entry.startDate, entry.endDate)}</small>{/if}
                    </span>
                    {#if entry.company || entry.location}<span class="entry-meta">{[entry.company, entry.location].filter(Boolean).join(" · ")}</span>{/if}
                    {#if firstBullet(entry.bullets)}<span class="entry-preview">{firstBullet(entry.bullets)}</span>{/if}
                  </span>
                  <CaretRight size={18} weight="bold" aria-hidden="true" />
                </button>
              {/each}
            </div>
          {:else}
            <button type="button" class="section-empty" onclick={addExperience}><Plus size={17} aria-hidden="true" /><span>Add experience</span></button>
          {/if}
        </section>

        <section class="resume-section" aria-labelledby="education-heading">
          <header class="resume-section-heading">
            <div class="section-heading-copy">
              <h2 id="education-heading">Education</h2>
              {#if profile.education.length}<span>{profile.education.length}</span>{/if}
            </div>
            {#if profile.education.length}
              <button type="button" class="section-text-action" onclick={addEducation}>Add</button>
            {/if}
          </header>
          {#if profile.education.length}
            <div class="resume-entries">
              {#each profile.education as entry (entry.id)}
                <button type="button" class="resume-entry" onclick={() => openRecord("education", entry.id)}>
                  <span class="entry-copy">
                    <span class="entry-heading">
                      <strong>{entry.institution.trim() || "Untitled education"}</strong>
                      {#if entry.startDate || entry.endDate}<small>{dateRange(entry.startDate, entry.endDate)}</small>{/if}
                    </span>
                    {#if educationDetail(entry)}<span class="entry-meta">{educationDetail(entry)}</span>{/if}
                  </span>
                  <CaretRight size={18} weight="bold" aria-hidden="true" />
                </button>
              {/each}
            </div>
          {:else}
            <button type="button" class="section-empty" onclick={addEducation}><Plus size={17} aria-hidden="true" /><span>Add education</span></button>
          {/if}
        </section>

        <section class="resume-section" aria-labelledby="projects-heading">
          <header class="resume-section-heading">
            <div class="section-heading-copy">
              <h2 id="projects-heading">Projects</h2>
              {#if profile.projects.length}<span>{profile.projects.length}</span>{/if}
            </div>
            {#if profile.projects.length}
              <button type="button" class="section-text-action" onclick={addProject}>Add</button>
            {/if}
          </header>
          {#if profile.projects.length}
            <div class="resume-entries">
              {#each profile.projects as entry (entry.id)}
                <button type="button" class="resume-entry" onclick={() => openRecord("projects", entry.id)}>
                  <span class="entry-copy">
                    <span class="entry-heading">
                      <strong>{entry.name.trim() || "Untitled project"}</strong>
                      {#if entry.date}<small>{formatResumeDate(entry.date)}</small>{/if}
                    </span>
                    {#if projectDetail(entry)}<span class="entry-meta">{projectDetail(entry)}</span>{/if}
                    {#if entry.url}<span class="entry-meta">{entry.url}</span>{/if}
                    {#if firstBullet(entry.bullets)}<span class="entry-preview">{firstBullet(entry.bullets)}</span>{/if}
                  </span>
                  <CaretRight size={18} weight="bold" aria-hidden="true" />
                </button>
              {/each}
            </div>
          {:else}
            <button type="button" class="section-empty" onclick={addProject}><Plus size={17} aria-hidden="true" /><span>Add project</span></button>
          {/if}
        </section>

        <section class="resume-section" aria-labelledby="skills-heading">
          <header class="resume-section-heading">
            <div class="section-heading-copy">
              <h2 id="skills-heading">Skills</h2>
              {#if profile.skills.length}<span>{profile.skills.length}</span>{/if}
            </div>
          </header>
          {#if profile.skills.length}
            <button type="button" class="section-content" onclick={() => openSection("skills")}>
              <span class="section-content-copy">
                {#each profile.skills as skill}
                  <span class="compact-line"><strong>{skill.category.trim() || "Skills"}</strong><span>{skill.items.trim() || "Add skills"}</span></span>
                {/each}
              </span>
              <CaretRight size={18} weight="bold" aria-hidden="true" />
            </button>
          {:else}
            <button type="button" class="section-empty" onclick={addSkillAndOpen}><Plus size={17} aria-hidden="true" /><span>Add skills</span></button>
          {/if}
        </section>

        {#each profile.optionalSections as section (section.kind)}
          <section class="resume-section" aria-labelledby="{section.kind}-heading">
            <header class="resume-section-heading">
              <h2 id="{section.kind}-heading">{OPTIONAL_SECTION_LABELS[section.kind]}</h2>
            </header>
            <button type="button" class="section-content" onclick={() => openSection(section.kind)}>
              <span class="section-content-copy">
                {#each section.items as item}
                  <span class="compact-line"><strong>{item.category.trim() || "Untitled"}</strong><span>{item.items.trim() || "Add details"}</span></span>
                {/each}
              </span>
              <CaretRight size={18} weight="bold" aria-hidden="true" />
            </button>
          </section>
        {/each}

        <section class="resume-section" aria-labelledby="notes-heading">
          <header class="resume-section-heading">
            <h2 id="notes-heading">Tailoring notes</h2>
          </header>
          {#if notesUnavailable}
            <button type="button" class="section-empty" onclick={retryNotes} disabled={notesRetrying}>
              {notesRetrying ? "Loading notes…" : "Notes didn’t load · Try again"}
            </button>
          {:else}
            {#if notes.trim()}
              <button type="button" class="notes-preview" onclick={() => openSection("notes")}>
                <span>{notes.trim()}</span>
                <CaretRight size={18} weight="bold" aria-hidden="true" />
              </button>
            {:else}
              <button type="button" class="section-empty" onclick={() => openSection("notes")}><Plus size={17} aria-hidden="true" /><span>Add tailoring notes</span></button>
            {/if}
          {/if}
        </section>

        {#if availableOptionalSections.length > 0}
          <button type="button" class="add-section-button" onclick={() => (addSectionOpen = true)}>
            <Plus size={16} aria-hidden="true" />
            <span>Add section</span>
          </button>
        {/if}
      </div>
    {:else if view.kind === "section"}
      {#if view.section === "contact"}
        <form class="editor-form" onsubmit={preventFormSubmit}>
          <section class="editor-section stack-md">
            <h2>Profile</h2>
            <div class="form-grid">
              <label class="field span-2"><span>Full name</span><input class="input-field" name="name" autocomplete="name" bind:value={profile.contact.name} oninput={handleInput} /></label>
              <label class="field"><span>Email</span><input class="input-field" name="email" type="email" autocomplete="email" bind:value={profile.contact.email} oninput={handleInput} /></label>
              <label class="field"><span>Phone</span><input class="input-field" name="phone" type="tel" inputmode="tel" autocomplete="tel" bind:value={profile.contact.phone} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section stack-md">
            <h2>Location</h2>
            <div class="form-grid location-grid">
              <label class="field"><span>City</span><input class="input-field" name="city" autocomplete="address-level2" value={splitUsLocation(profile.contact.location).city} oninput={(event) => updateLocation(profile.contact, "city", event.currentTarget.value)} /></label>
              <label class="field"><span>State</span><span class="select-field-wrap"><select class="input-field" name="state" autocomplete="address-level1" value={splitUsLocation(profile.contact.location).state} onchange={(event) => updateLocation(profile.contact, "state", event.currentTarget.value)}><option value="">Select state</option>{#each US_STATES as state}<option value={state.value}>{state.label}</option>{/each}</select><span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span></span></label>
            </div>
          </section>
          <section class="editor-section stack-md">
            <h2>Links</h2>
            <div class="form-grid">
              <label class="field"><span>LinkedIn</span><input class="input-field" name="linkedin" type="url" inputmode="url" bind:value={profile.contact.linkedin} oninput={handleInput} autocapitalize="off" autocomplete="url" spellcheck="false" /></label>
              <label class="field"><span>GitHub</span><input class="input-field" name="github" type="url" inputmode="url" bind:value={profile.contact.github} oninput={handleInput} autocapitalize="off" autocomplete="url" spellcheck="false" /></label>
              <label class="field span-2"><span>Website</span><input class="input-field" name="website" type="url" inputmode="url" autocomplete="url" bind:value={profile.contact.website} oninput={handleInput} /></label>
            </div>
          </section>
        </form>
      {:else if view.section === "skills"}
        <form class="editor-form" onsubmit={preventFormSubmit}>
          {#each profile.skills as skill, index}
            <div class="editor-item stack-sm">
              <div class="form-grid skill-grid">
                <label class="field"><span>Category</span><input class="input-field" bind:value={skill.category} oninput={handleInput} /></label>
                <label class="field"><span>Skills</span><input class="input-field" bind:value={skill.items} oninput={handleInput} /></label>
              </div>
              <button type="button" class="remove-item" onclick={() => removeSkill(index)}><Trash size={14} aria-hidden="true" /> Remove category</button>
            </div>
          {/each}
          <button type="button" class="add-row inline-add" onclick={addSkill}><Plus size={16} aria-hidden="true" /> <span>Add category</span></button>
        </form>
      {:else if view.section === "notes"}
        <form class="editor-form" onsubmit={preventFormSubmit}>
          <label class="field">
            <span>Notes</span>
            <textarea class="input-field textarea-field notes-field" bind:value={notes} oninput={handleInput}></textarea>
          </label>
        </form>
      {:else}
        {@const optionalSection = optionalSectionFor(view.section)}
        {#if optionalSection}
          <form class="editor-form" onsubmit={preventFormSubmit}>
            {#each optionalSection.items as item, index}
              <div class="editor-item stack-sm">
                <div class="form-grid skill-grid">
                  <label class="field"><span>Label</span><input class="input-field" bind:value={item.category} oninput={handleInput} /></label>
                  <label class="field"><span>Details</span><input class="input-field" bind:value={item.items} oninput={handleInput} /></label>
                </div>
                <button type="button" class="remove-item" onclick={() => removeOptionalItem(optionalSection.kind, index)}><Trash size={14} aria-hidden="true" /> Remove item</button>
              </div>
            {/each}
            <button type="button" class="add-row inline-add" onclick={() => addOptionalItem(optionalSection.kind)}><Plus size={16} aria-hidden="true" /> <span>Add item</span></button>
            <button type="button" class="remove-section prominent-record-remove" onclick={() => removeOptionalSection(optionalSection.kind)}><Trash size={15} aria-hidden="true" /> Remove section</button>
          </form>
        {/if}
      {/if}
    {:else if view.section === "experience"}
      {@const entry = profile.experience.find((candidate) => candidate.id === currentRecordId)}
      {#if entry}
        <form class="editor-form" onsubmit={preventFormSubmit}>
          <section class="editor-section stack-md">
            <h2>Role</h2>
            <div class="form-grid">
              <label class="field"><span>Company</span><input class="input-field" autocomplete="organization" bind:value={entry.company} oninput={handleInput} /></label>
              <label class="field"><span>Title</span><input class="input-field" autocomplete="organization-title" bind:value={entry.title} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section stack-md">
            <h2>Location</h2>
            <div class="form-grid location-grid">
              <label class="field"><span>City</span><input class="input-field" value={splitUsLocation(entry.location).city} oninput={(event) => updateLocation(entry, "city", event.currentTarget.value)} /></label>
              <label class="field"><span>State</span><span class="select-field-wrap"><select class="input-field" value={splitUsLocation(entry.location).state} onchange={(event) => updateLocation(entry, "state", event.currentTarget.value)}><option value="">Select state</option>{#each US_STATES as state}<option value={state.value}>{state.label}</option>{/each}</select><span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span></span></label>
            </div>
          </section>
          <section class="editor-section stack-md">
            <h2>Dates</h2>
            <div class="form-grid">
              <label class="field"><span>Start month</span><input class="input-field" type="month" value={monthInputValue(entry.startDate)} oninput={(event) => { entry.startDate = event.currentTarget.value; handleInput(); }} /></label>
              <label class="field"><span>End month</span><input class="input-field" type="month" value={monthInputValue(entry.endDate)} disabled={isCurrentRole(entry.endDate)} oninput={(event) => { entry.endDate = event.currentTarget.value; handleInput(); }} /></label>
            </div>
            <label class="current-role"><input type="checkbox" checked={isCurrentRole(entry.endDate)} onchange={(event) => setCurrentRole(entry, event.currentTarget.checked)} /><span>Current role</span></label>
          </section>
          <section class="editor-section evidence-section stack-md">
            <h2>Accomplishments</h2>
            {#each entry.bullets as bullet, index}
              <div class="bullet-field">
                <div class="bullet-field-heading">
                  <label for="experience-{entry.id}-bullet-{index}">Accomplishment {index + 1}</label>
                  {#if entry.bullets.length > 1}
                    <button type="button" class="bullet-remove" aria-label="Remove accomplishment {index + 1}" onclick={() => (entry.bullets = removeBullet(entry.bullets, index))}><Trash size={16} aria-hidden="true" /></button>
                  {/if}
                </div>
                <textarea id="experience-{entry.id}-bullet-{index}" class="input-field bullet-input" placeholder="Describe what you changed and the result" bind:value={entry.bullets[index]} oninput={handleInput}></textarea>
              </div>
            {/each}
            <button type="button" class="add-row inline-add" onclick={() => (entry.bullets = addBullet(entry.bullets))}><Plus size={16} aria-hidden="true" /> <span>Add accomplishment</span></button>
          </section>
          <button type="button" class="remove-section prominent-record-remove" onclick={() => removeExperience(entry.id)}><Trash size={15} aria-hidden="true" /> Remove position</button>
        </form>
      {/if}
    {:else if view.section === "education"}
      {@const entry = profile.education.find((candidate) => candidate.id === currentRecordId)}
      {#if entry}
        <form class="editor-form" onsubmit={preventFormSubmit}>
          <section class="editor-section stack-md">
            <h2>School</h2>
            <div class="form-grid">
              <label class="field span-2"><span>Institution</span><input class="input-field" bind:value={entry.institution} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section stack-md">
            <h2>Location</h2>
            <div class="form-grid location-grid">
              <label class="field"><span>City</span><input class="input-field" value={splitUsLocation(entry.location).city} oninput={(event) => updateLocation(entry, "city", event.currentTarget.value)} /></label>
              <label class="field"><span>State</span><span class="select-field-wrap"><select class="input-field" value={splitUsLocation(entry.location).state} onchange={(event) => updateLocation(entry, "state", event.currentTarget.value)}><option value="">Select state</option>{#each US_STATES as state}<option value={state.value}>{state.label}</option>{/each}</select><span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span></span></label>
            </div>
          </section>
          <section class="editor-section stack-md">
            <h2>Degree</h2>
            <div class="form-grid">
              <label class="field"><span>Degree type</span><span class="select-field-wrap"><select class="input-field" value={entry.degreeType ?? ""} onchange={(event) => updateEducationDegree(entry, { degreeType: event.currentTarget.value as DegreeType | "" })}><option value="">Select degree</option>{#each DEGREE_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}</select><span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span></span></label>
              <label class="field"><span>Field of study</span><input class="input-field" value={entry.fieldOfStudy ?? ""} oninput={(event) => updateEducationDegree(entry, { fieldOfStudy: event.currentTarget.value })} /></label>
              <label class="field"><span>GPA</span><input class="input-field" inputmode="decimal" bind:value={entry.gpa} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section stack-md">
            <h2>Dates</h2>
            <div class="form-grid">
              <label class="field"><span>Start month</span><input class="input-field" type="month" value={monthInputValue(entry.startDate)} oninput={(event) => { entry.startDate = event.currentTarget.value; handleInput(); }} /></label>
              <label class="field"><span>End month</span><input class="input-field" type="month" value={monthInputValue(entry.endDate)} oninput={(event) => { entry.endDate = event.currentTarget.value; handleInput(); }} /></label>
            </div>
          </section>
          <button type="button" class="remove-section prominent-record-remove" onclick={() => removeEducation(entry.id)}><Trash size={15} aria-hidden="true" /> Remove education</button>
        </form>
      {/if}
    {:else}
      {@const entry = profile.projects.find((candidate) => candidate.id === currentRecordId)}
      {#if entry}
        <form class="editor-form" onsubmit={preventFormSubmit}>
          <section class="editor-section stack-md">
            <div class="form-grid">
              <label class="field span-2"><span>Name</span><input class="input-field" bind:value={entry.name} oninput={handleInput} /></label>
              <label class="field"><span>Role <span class="label-opt">optional</span></span><input class="input-field" value={entry.role ?? ""} oninput={(event) => { entry.role = event.currentTarget.value; handleInput(); }} /></label>
              <label class="field"><span>Team or organization <span class="label-opt">optional</span></span><input class="input-field" value={entry.teamInfo ?? ""} oninput={(event) => { entry.teamInfo = event.currentTarget.value; handleInput(); }} /></label>
              <label class="field"><span>Date</span><input class="input-field" type="month" value={monthInputValue(entry.date ?? "")} oninput={(event) => { entry.date = event.currentTarget.value; handleInput(); }} /></label>
              <label class="field"><span>URL</span><input class="input-field" type="url" inputmode="url" bind:value={entry.url} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section evidence-section stack-md">
            <h2>Accomplishments</h2>
            {#each entry.bullets as bullet, index}
              <div class="bullet-field">
                <div class="bullet-field-heading">
                  <label for="project-{entry.id}-bullet-{index}">Accomplishment {index + 1}</label>
                  {#if entry.bullets.length > 1}
                    <button type="button" class="bullet-remove" aria-label="Remove accomplishment {index + 1}" onclick={() => (entry.bullets = removeBullet(entry.bullets, index))}><Trash size={16} aria-hidden="true" /></button>
                  {/if}
                </div>
                <textarea id="project-{entry.id}-bullet-{index}" class="input-field bullet-input" placeholder="Describe what you built and why it mattered" bind:value={entry.bullets[index]} oninput={handleInput}></textarea>
              </div>
            {/each}
            <button type="button" class="add-row inline-add" onclick={() => (entry.bullets = addBullet(entry.bullets))}><Plus size={16} aria-hidden="true" /> <span>Add accomplishment</span></button>
          </section>
          <button type="button" class="remove-section prominent-record-remove" onclick={() => removeProject(entry.id)}><Trash size={15} aria-hidden="true" /> Remove project</button>
        </form>
      {/if}
    {/if}
  </div>
</div>

{#if addSectionOpen}
  <Modal title="Add section" onclose={() => (addSectionOpen = false)}>
    <div class="add-section-options">
      {#each availableOptionalSections as kind}
        <button type="button" onclick={() => addOptionalSection(kind)}>
          <span>{OPTIONAL_SECTION_LABELS[kind]}</span>
          <CaretRight size={16} aria-hidden="true" />
        </button>
      {/each}
    </div>
  </Modal>
{/if}

{#if pendingImport}
  <Modal
    title="Import resume?"
    subtitle={importSummary(pendingImport)}
    busy={importing}
    onclose={() => (pendingImport = null)}
  >
    <p class="import-note">Existing details in these sections will be replaced.</p>
    <div class="action-row import-actions">
      <button type="button" class="btn-secondary flex-fill" onclick={() => (pendingImport = null)}>Cancel</button>
      <button type="button" class="btn-primary btn-accent flex-fill" onclick={applyPdfImport}>Import</button>
    </div>
  </Modal>
{/if}

<style>
  .resume-frame {
    padding-top: var(--space-2);
  }

  .resume-overview {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding-bottom: var(--space-8);
  }

  .resume-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .import-action {
    appearance: none;
    min-height: var(--control-height-compact);
    align-self: flex-start;
    margin-block-start: var(--space-1);
    margin-inline-start: calc(var(--space-3) * -1);
    padding-inline: var(--space-3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: 0;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-ink-3);
    font: 600 var(--fs-xs) / 1 var(--font-sans);
    cursor: pointer;
  }

  .native-layout .import-action { min-height: var(--tap-min); }

  .import-action:active {
    transform: scale(0.96);
  }

  .import-action:hover {
    color: var(--color-accent-soft-ink);
  }

  .import-action:disabled {
    cursor: default;
    opacity: 0.64;
  }

  .identity-button,
  .section-text-action,
  .resume-entry,
  .section-content,
  .section-empty,
  .notes-preview,
  .add-section-button,
  .add-row {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--color-ink);
    font: inherit;
    cursor: pointer;
  }

  .identity-button {
    width: 100%;
    min-height: 64px;
    padding: var(--space-2) 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-4);
    text-align: start;
  }

  .identity-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .identity-copy strong {
    font-size: var(--fs-sm);
    font-weight: 600;
    line-height: 1.3;
  }

  .identity-copy small {
    overflow: hidden;
    color: var(--color-ink-4);
    font-size: var(--fs-sm);
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .identity-button > :global(svg) {
    flex: 0 0 auto;
    color: var(--color-ink-4);
  }

  .resume-section-heading {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .resume-section-heading h2 {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.25;
  }

  .section-heading-copy {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .section-heading-copy > span {
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
  }

  .section-text-action {
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    margin-inline-end: calc(var(--space-3) * -1);
    padding-inline: var(--space-3);
    color: var(--color-accent);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  .resume-entries {
    display: flex;
    flex-direction: column;
  }

  .resume-entry {
    width: 100%;
    min-height: 64px;
    padding-block: var(--space-3);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    text-align: start;
  }

  .resume-entry + .resume-entry {
    border-top: 1px solid var(--color-line);
  }

  .entry-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .entry-heading {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .entry-heading strong {
    min-width: 0;
    overflow: hidden;
    font-size: var(--fs-sm);
    font-weight: 600;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resume-entry > :global(svg),
  .section-content > :global(svg),
  .notes-preview > :global(svg) {
    flex: 0 0 auto;
    color: var(--color-ink-4);
  }

  .entry-heading small {
    flex: 0 0 auto;
    color: var(--color-ink-4);
    font-size: var(--fs-2xs);
    line-height: 1.3;
    white-space: nowrap;
  }

  .entry-meta,
  .entry-preview {
    overflow-wrap: anywhere;
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    line-height: 1.35;
  }

  .entry-preview {
    display: -webkit-box;
    overflow: hidden;
    color: var(--color-ink-3);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .section-content,
  .notes-preview {
    width: 100%;
    min-height: 56px;
    padding-block: var(--space-2);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    text-align: start;
  }

  .section-content-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .compact-line {
    display: grid;
    grid-template-columns: minmax(88px, 0.35fr) minmax(0, 1fr);
    gap: var(--space-3);
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.35;
  }

  .compact-line strong {
    overflow: hidden;
    color: var(--color-ink-2);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section-empty {
    width: 100%;
    min-height: 44px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-accent);
    font-size: var(--fs-sm);
    font-weight: 600;
    text-align: start;
  }

  .notes-preview {
    color: var(--color-ink-3);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }

  .notes-preview > span {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .section-text-action:active,
  .add-section-button:active {
    transform: scale(0.96);
  }

  .add-section-button {
    width: 100%;
    min-height: 52px;
    padding: var(--space-2) 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border-top: 1px solid var(--color-line);
    color: var(--color-accent);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  .add-row {
    width: 100%;
    min-height: 52px;
    padding: 10px 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    justify-content: start;
    gap: var(--space-2);
    border-bottom: 1px solid var(--color-line);
    color: var(--color-accent);
    font-size: var(--fs-sm);
    font-weight: 500;
    text-align: start;
  }

  .inline-add {
    align-self: flex-start;
    width: auto;
    min-width: 0;
    border-bottom: 0;
  }

  .editor-form {
    width: 100%;
    padding-top: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .editor-section > h2 {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.2;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3) var(--space-2);
  }

  .field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field > span {
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .field.span-2,
  .span-2 {
    grid-column: 1 / -1;
  }

  .editor-item + .editor-item {
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-line);
  }

  .remove-item,
  .remove-section {
    appearance: none;
    min-height: var(--control-height-compact);
    align-self: flex-start;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    border: 0;
    background: transparent;
    color: var(--color-bad);
    font: 500 var(--fs-xs) / 1 var(--font-sans);
    cursor: pointer;
  }

  .native-layout .remove-item,
  .native-layout .remove-section { min-height: var(--tap-min); }

  .native-layout .prominent-record-remove {
    margin-block-start: var(--space-2);
    padding: 0 var(--space-5);
    justify-content: center;
    border: 1px solid var(--color-bad);
    border-radius: var(--radius-md);
    background: var(--color-bad-soft);
    font-size: var(--fs-sm);
    font-weight: 600;
  }

  .remove-section {
    width: 100%;
    margin-top: var(--space-2);
    padding-top: var(--space-4);
    justify-content: flex-start;
    border-top: 1px solid var(--color-line);
  }

  .evidence-section h2 {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-lg);
    font-weight: 600;
  }

  .current-role {
    min-height: var(--tap-min);
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .current-role input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--color-accent);
  }

  .editor-form :global(.input-field:disabled) {
    opacity: 0.48;
    cursor: default;
  }

  .native-layout .editor-form .input-field {
    background: var(--color-bg-elev);
  }

  .native-layout .editor-form .input-field:focus {
    background: var(--color-bg-elev);
  }

  .bullet-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .bullet-field-heading {
    min-height: var(--tap-min);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .bullet-remove {
    appearance: none;
    width: var(--tap-min);
    height: var(--tap-min);
    margin-inline-end: calc(var(--space-3) * -1);
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-bad);
    cursor: pointer;
  }

  .bullet-input {
    min-height: calc(var(--control-height) * 2);
    padding: var(--space-4);
    line-height: 1.5;
    resize: vertical;
  }

  .notes-field {
    min-height: calc(var(--control-height) * 4);
    padding: var(--space-4);
    line-height: 1.5;
  }

  .add-section-options {
    margin-top: var(--space-2);
  }

  .add-section-options button {
    appearance: none;
    width: 100%;
    min-height: calc(var(--tap-min) + var(--space-2));
    padding: var(--space-2) 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    border: 0;
    border-bottom: 1px solid var(--color-line);
    background: transparent;
    color: var(--color-ink);
    font: 500 var(--fs-sm) / 1.3 var(--font-sans);
    text-align: start;
    cursor: pointer;
  }

  .add-section-options button:last-child {
    border-bottom: 0;
  }

  .add-section-options button > :global(svg) {
    color: var(--color-ink-4);
  }

  .import-note {
    margin: var(--space-3) 0 0;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.45;
  }

  .import-actions {
    margin-top: var(--space-5);
  }

  @media (max-width: 540px) {
    .form-grid,
    .skill-grid {
      grid-template-columns: 1fr;
    }

    .field.span-2,
    .span-2 {
      grid-column: auto;
    }
  }
</style>
