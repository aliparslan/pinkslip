<script lang="ts">
  import { onMount } from "svelte";
  import { api, type ResumeProfile, type OptionalSectionKind, type DegreeType } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import Plus from "phosphor-svelte/lib/Plus";
  import Trash from "phosphor-svelte/lib/Trash";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import UploadSimple from "phosphor-svelte/lib/UploadSimple";
  import Spinner from "../components/Spinner.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import SaveStatus from "../components/SaveStatus.svelte";
  import Modal from "../components/Modal.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import { SavePresentation } from "../lib/task-presentation.svelte";
  import { createEmptyResumeProfile } from "../../../shared/resume-profile";
  import { registerAutosaveFlush } from "../lib/autosave-lifecycle";
  import {
    DEGREE_OPTIONS,
    US_STATES,
    formatDegree,
    formatResumeDate,
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
  type ResumeSection = DirectSection | CollectionSection;
  type ResumeView =
    | { kind: "overview" }
    | { kind: "section"; section: ResumeSection }
    | { kind: "record"; section: CollectionSection; id: string };

  let loading = $state(true);
  let saving = $state(false);
  let error: string | null = $state(null);
  const savePresentation = new SavePresentation();
  let profile: ResumeProfile = $state(createEmptyResumeProfile());
  let notes = $state("");
  let autosaveTimer: number | null = null;
  let saveAgain = false;
  let importing = $state(false);
  let importInput: HTMLInputElement | null = $state(null);
  let pendingImport: Partial<ResumeProfile> | null = $state(null);
  let view: ResumeView = $state({ kind: "overview" });
  let addSectionOpen = $state(false);

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

  function sectionLabel(section: ResumeSection): string {
    if (section === "contact") return "Contact info";
    if (section === "experience") return "Work experience";
    if (section === "education") return "Education";
    if (section === "projects") return "Projects";
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

  function firstBullet(items: string[]): string {
    return items.find((item) => item.trim())?.trim() ?? "";
  }

  function optionalSectionFor(section: ResumeSection) {
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

  function openSection(section: DirectSection) {
    view = { kind: "section", section };
  }

  function openRecord(section: CollectionSection, id: string) {
    view = { kind: "record", section, id };
  }

  function handleBack() {
    if (view.kind !== "overview") {
      view = { kind: "overview" };
      return;
    }
    if (!requestBack()) navigate("/you");
  }

  function addExperience() {
    const id = genId();
    profile.experience = [
      ...profile.experience,
      { id, company: "", title: "", location: "", startDate: "", endDate: "", bullets: [""] },
    ];
    queueAutosave();
    openRecord("experience", id);
  }

  function removeExperience(id: string) {
    profile.experience = profile.experience.filter((entry) => entry.id !== id);
    queueAutosave();
    view = { kind: "overview" };
  }

  function addEducation() {
    const id = genId();
    profile.education = [
      ...profile.education,
      { id, institution: "", degree: "", degreeType: undefined, fieldOfStudy: "", location: "", startDate: "", endDate: "", gpa: "" },
    ];
    queueAutosave();
    openRecord("education", id);
  }

  function removeEducation(id: string) {
    profile.education = profile.education.filter((entry) => entry.id !== id);
    queueAutosave();
    view = { kind: "overview" };
  }

  function addProject() {
    const id = genId();
    profile.projects = [
      ...profile.projects,
      { id, name: "", url: "", date: "", bullets: [""] },
    ];
    queueAutosave();
    openRecord("projects", id);
  }

  function removeProject(id: string) {
    profile.projects = profile.projects.filter((entry) => entry.id !== id);
    queueAutosave();
    view = { kind: "overview" };
  }

  function addSkill() {
    profile.skills = [...profile.skills, { category: "", items: "" }];
    queueAutosave();
  }

  function addSkillAndOpen() {
    addSkill();
    openSection("skills");
  }

  function removeSkill(index: number) {
    profile.skills = profile.skills.filter((_, itemIndex) => itemIndex !== index);
    queueAutosave();
  }

  function addOptionalSection(kind: OptionalSectionKind) {
    profile.optionalSections = [
      ...profile.optionalSections,
      { kind, items: [{ category: "", items: "" }] },
    ];
    addSectionOpen = false;
    queueAutosave();
    openSection(kind);
  }

  function removeOptionalSection(kind: OptionalSectionKind) {
    profile.optionalSections = profile.optionalSections.filter((section) => section.kind !== kind);
    queueAutosave();
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
    profile.optionalSections = profile.optionalSections.map((section) =>
      section.kind === kind
        ? { ...section, items: section.items.filter((_, itemIndex) => itemIndex !== index) }
        : section
    );
    queueAutosave();
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
    try {
      const [profileRes, corpusRes] = await Promise.all([api.profile.get(), api.corpus.get()]);
      const data = profileRes.data;
      let optionalSections = data.optionalSections ?? [];
      if (!optionalSections.length && (data as any).leadership?.length) {
        optionalSections = [{ kind: "leadership" as const, items: (data as any).leadership }];
      }
      profile = {
        ...createEmptyResumeProfile(),
        ...data,
        education: (data.education ?? []).map(hydrateEducationEntry),
        optionalSections,
      };
      savePresentation.hydrate(profileRes.updated_at);
      notes = corpusRes.content_md ?? "";
    } catch (loadError) {
      error = errorMessage(loadError);
    } finally {
      loading = false;
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
        api.corpus.update(notes, { keepalive }),
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
      const importedItemCount = (parsed.experience?.length ?? 0)
        + (parsed.education?.length ?? 0)
        + (parsed.projects?.length ?? 0)
        + (parsed.skills?.length ?? 0);
      if (!parsed.contact?.name && !parsed.contact?.email && importedItemCount === 0) {
        throw new Error("No resume details were found");
      }
      pendingImport = parsed;
    } catch (importError) {
      error = `Could not parse PDF: ${errorMessage(importError)}`;
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
    pendingImport = null;
    feedback.success("Resume imported");
    queueAutosave();
  }

  onMount(() => {
    void loadAll();
    const unregisterAutosaveFlush = registerAutosaveFlush(flushAutosave);
    return () => {
      unregisterAutosaveFlush();
      savePresentation.destroy();
    };
  });
</script>

<div class="page pushed-screen">
  <ScreenNav
    title={screenTitle}
    backLabel={view.kind === "overview" ? "Back to You" : "Back"}
    onBack={handleBack}
  >
    {#snippet trailing()}
      <div class="resume-nav-actions">
        {#if view.kind === "overview" && !loading}
          <button
            type="button"
            class="import-action"
            aria-label="Import PDF"
            title="Import PDF"
            onclick={() => importInput?.click()}
            disabled={importing}
          >
            {#if importing}<Spinner size={16} />{:else}<UploadSimple size={17} aria-hidden="true" />{/if}
            <span>Import</span>
          </button>
        {/if}
        <SaveStatus phase={savePresentation.phase} />
      </div>
    {/snippet}
  </ScreenNav>

  <div class="page-frame resume-frame">
    {#if error}<div class="alert alert-error alert-spaced" role="alert">{error}</div>{/if}
    {#if loading}
      <div class="page-loading" aria-busy="true"><Spinner size={22} label="Loading" /></div>
    {:else if view.kind === "overview"}
      <input
        class="visually-hidden-input"
        type="file"
        accept=".pdf"
        bind:this={importInput}
        onchange={handlePdfImport}
      />

      <div class="resume-overview">
        <section class="resume-identity" aria-labelledby="resume-name">
          <button type="button" class="identity-button" onclick={() => openSection("contact")}>
            <span class="identity-copy">
              <strong id="resume-name">{profile.contact.name.trim() || "Add your name"}</strong>
              <small>{contactLine() || "Add contact details"}</small>
            </span>
            <PencilSimple size={17} aria-hidden="true" />
          </button>
        </section>

        <section class="resume-section" aria-labelledby="experience-heading">
          <header class="resume-section-heading">
            <h2 id="experience-heading">Experience</h2>
            <button type="button" class="section-action" onclick={addExperience} aria-label="Add experience"><Plus size={18} /></button>
          </header>
          {#if profile.experience.length}
            <div class="resume-entries">
              {#each profile.experience as entry (entry.id)}
                <button type="button" class="resume-entry" onclick={() => openRecord("experience", entry.id)}>
                  <span class="entry-heading">
                    <strong>{entry.title.trim() || "Untitled position"}</strong>
                    {#if entry.startDate || entry.endDate}<small>{dateRange(entry.startDate, entry.endDate)}</small>{/if}
                  </span>
                  {#if entry.company || entry.location}<span class="entry-meta">{[entry.company, entry.location].filter(Boolean).join(" · ")}</span>{/if}
                  {#if firstBullet(entry.bullets)}<span class="entry-preview">{firstBullet(entry.bullets)}</span>{/if}
                  <span class="entry-edit" aria-hidden="true"><PencilSimple size={15} /></span>
                </button>
              {/each}
            </div>
          {:else}
            <button type="button" class="section-empty" onclick={addExperience}>Add experience</button>
          {/if}
        </section>

        <section class="resume-section" aria-labelledby="education-heading">
          <header class="resume-section-heading">
            <h2 id="education-heading">Education</h2>
            <button type="button" class="section-action" onclick={addEducation} aria-label="Add education"><Plus size={18} /></button>
          </header>
          {#if profile.education.length}
            <div class="resume-entries">
              {#each profile.education as entry (entry.id)}
                <button type="button" class="resume-entry" onclick={() => openRecord("education", entry.id)}>
                  <span class="entry-heading">
                    <strong>{entry.institution.trim() || "Untitled education"}</strong>
                    {#if entry.startDate || entry.endDate}<small>{dateRange(entry.startDate, entry.endDate)}</small>{/if}
                  </span>
                  {#if educationDetail(entry)}<span class="entry-meta">{educationDetail(entry)}</span>{/if}
                  <span class="entry-edit" aria-hidden="true"><PencilSimple size={15} /></span>
                </button>
              {/each}
            </div>
          {:else}
            <button type="button" class="section-empty" onclick={addEducation}>Add education</button>
          {/if}
        </section>

        <section class="resume-section" aria-labelledby="projects-heading">
          <header class="resume-section-heading">
            <h2 id="projects-heading">Projects</h2>
            <button type="button" class="section-action" onclick={addProject} aria-label="Add project"><Plus size={18} /></button>
          </header>
          {#if profile.projects.length}
            <div class="resume-entries">
              {#each profile.projects as entry (entry.id)}
                <button type="button" class="resume-entry" onclick={() => openRecord("projects", entry.id)}>
                  <span class="entry-heading">
                    <strong>{entry.name.trim() || "Untitled project"}</strong>
                    {#if entry.date}<small>{formatResumeDate(entry.date)}</small>{/if}
                  </span>
                  {#if entry.url}<span class="entry-meta">{entry.url}</span>{/if}
                  {#if firstBullet(entry.bullets)}<span class="entry-preview">{firstBullet(entry.bullets)}</span>{/if}
                  <span class="entry-edit" aria-hidden="true"><PencilSimple size={15} /></span>
                </button>
              {/each}
            </div>
          {:else}
            <button type="button" class="section-empty" onclick={addProject}>Add project</button>
          {/if}
        </section>

        <section class="resume-section" aria-labelledby="skills-heading">
          <header class="resume-section-heading">
            <h2 id="skills-heading">Skills</h2>
            <button type="button" class="section-action" onclick={addSkillAndOpen} aria-label="Add skill category"><Plus size={18} /></button>
          </header>
          {#if profile.skills.length}
            <button type="button" class="section-content" onclick={() => openSection("skills")}>
              {#each profile.skills as skill}
                <span class="compact-line"><strong>{skill.category.trim() || "Skills"}</strong><span>{skill.items.trim() || "Add skills"}</span></span>
              {/each}
            </button>
          {:else}
            <button type="button" class="section-empty" onclick={addSkillAndOpen}>Add skills</button>
          {/if}
        </section>

        {#each profile.optionalSections as section (section.kind)}
          <section class="resume-section" aria-labelledby="{section.kind}-heading">
            <header class="resume-section-heading">
              <h2 id="{section.kind}-heading">{OPTIONAL_SECTION_LABELS[section.kind]}</h2>
              <button type="button" class="section-action" onclick={() => openSection(section.kind)} aria-label="Edit {OPTIONAL_SECTION_LABELS[section.kind]}"><PencilSimple size={17} /></button>
            </header>
            <button type="button" class="section-content" onclick={() => openSection(section.kind)}>
              {#each section.items as item}
                <span class="compact-line"><strong>{item.category.trim() || "Untitled"}</strong><span>{item.items.trim() || "Add details"}</span></span>
              {/each}
            </button>
          </section>
        {/each}

        <section class="resume-section" aria-labelledby="notes-heading">
          <header class="resume-section-heading">
            <h2 id="notes-heading">Tailoring notes</h2>
            <button type="button" class="section-action" onclick={() => openSection("notes")} aria-label="Edit tailoring notes"><PencilSimple size={17} /></button>
          </header>
          <button type="button" class:section-empty={!notes.trim()} class:notes-preview={notes.trim()} onclick={() => openSection("notes")}>
            {notes.trim() || "Add notes"}
          </button>
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
        <div class="editor-form">
          <section class="editor-section">
            <h2>Profile</h2>
            <div class="form-grid">
              <label class="field span-2"><span>Full name</span><input class="input-field" name="name" autocomplete="name" bind:value={profile.contact.name} oninput={handleInput} /></label>
              <label class="field"><span>Email</span><input class="input-field" name="email" type="email" autocomplete="email" bind:value={profile.contact.email} oninput={handleInput} /></label>
              <label class="field"><span>Phone</span><input class="input-field" name="phone" type="tel" inputmode="tel" autocomplete="tel" bind:value={profile.contact.phone} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section">
            <h2>Location</h2>
            <div class="form-grid location-grid">
              <label class="field"><span>City</span><input class="input-field" name="city" autocomplete="address-level2" value={splitUsLocation(profile.contact.location).city} oninput={(event) => updateLocation(profile.contact, "city", event.currentTarget.value)} /></label>
              <label class="field"><span>State</span><span class="select-field-wrap"><select class="input-field" name="state" autocomplete="address-level1" value={splitUsLocation(profile.contact.location).state} onchange={(event) => updateLocation(profile.contact, "state", event.currentTarget.value)}><option value="">Select state</option>{#each US_STATES as state}<option value={state.value}>{state.label}</option>{/each}</select><span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span></span></label>
            </div>
          </section>
          <section class="editor-section">
            <h2>Links</h2>
            <div class="form-grid">
              <label class="field"><span>LinkedIn</span><input class="input-field" name="linkedin" type="url" inputmode="url" bind:value={profile.contact.linkedin} oninput={handleInput} autocapitalize="off" autocomplete="url" spellcheck="false" /></label>
              <label class="field"><span>GitHub</span><input class="input-field" name="github" type="url" inputmode="url" bind:value={profile.contact.github} oninput={handleInput} autocapitalize="off" autocomplete="url" spellcheck="false" /></label>
              <label class="field span-2"><span>Website</span><input class="input-field" name="website" type="url" inputmode="url" autocomplete="url" bind:value={profile.contact.website} oninput={handleInput} /></label>
            </div>
          </section>
        </div>
      {:else if view.section === "skills"}
        <div class="editor-form">
          {#each profile.skills as skill, index}
            <div class="editor-item">
              <div class="form-grid skill-grid">
                <label class="field"><span>Category</span><input class="input-field" bind:value={skill.category} oninput={handleInput} /></label>
                <label class="field"><span>Skills</span><input class="input-field" bind:value={skill.items} oninput={handleInput} /></label>
              </div>
              <button type="button" class="remove-item" onclick={() => removeSkill(index)}><Trash size={14} /> Remove category</button>
            </div>
          {/each}
          <button type="button" class="add-row inline-add" onclick={addSkill}><Plus size={16} /> <span>Add category</span></button>
        </div>
      {:else if view.section === "notes"}
        <div class="editor-form">
          <label class="field">
            <span>Notes</span>
            <textarea class="input-field textarea-field notes-field" bind:value={notes} oninput={handleInput}></textarea>
          </label>
        </div>
      {:else}
        {@const optionalSection = optionalSectionFor(view.section)}
        {#if optionalSection}
          <div class="editor-form">
            {#each optionalSection.items as item, index}
              <div class="editor-item">
                <div class="form-grid skill-grid">
                  <label class="field"><span>Label</span><input class="input-field" bind:value={item.category} oninput={handleInput} /></label>
                  <label class="field"><span>Details</span><input class="input-field" bind:value={item.items} oninput={handleInput} /></label>
                </div>
                <button type="button" class="remove-item" onclick={() => removeOptionalItem(optionalSection.kind, index)}><Trash size={14} /> Remove item</button>
              </div>
            {/each}
            <button type="button" class="add-row inline-add" onclick={() => addOptionalItem(optionalSection.kind)}><Plus size={16} /> <span>Add item</span></button>
            <button type="button" class="remove-section" onclick={() => removeOptionalSection(optionalSection.kind)}><Trash size={15} /> Remove section</button>
          </div>
        {/if}
      {/if}
    {:else if view.section === "experience"}
      {@const entry = profile.experience.find((candidate) => candidate.id === currentRecordId)}
      {#if entry}
        <div class="editor-form">
          <section class="editor-section">
            <h2>Role</h2>
            <div class="form-grid">
              <label class="field"><span>Company</span><input class="input-field" autocomplete="organization" bind:value={entry.company} oninput={handleInput} /></label>
              <label class="field"><span>Title</span><input class="input-field" autocomplete="organization-title" bind:value={entry.title} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section">
            <h2>Location</h2>
            <div class="form-grid location-grid">
              <label class="field"><span>City</span><input class="input-field" value={splitUsLocation(entry.location).city} oninput={(event) => updateLocation(entry, "city", event.currentTarget.value)} /></label>
              <label class="field"><span>State</span><span class="select-field-wrap"><select class="input-field" value={splitUsLocation(entry.location).state} onchange={(event) => updateLocation(entry, "state", event.currentTarget.value)}><option value="">Select state</option>{#each US_STATES as state}<option value={state.value}>{state.label}</option>{/each}</select><span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span></span></label>
            </div>
          </section>
          <section class="editor-section">
            <h2>Dates</h2>
            <div class="form-grid">
              <label class="field"><span>Start month</span><input class="input-field" type="month" value={monthInputValue(entry.startDate)} oninput={(event) => { entry.startDate = event.currentTarget.value; handleInput(); }} /></label>
              <label class="field"><span>End month</span><input class="input-field" type="month" value={monthInputValue(entry.endDate)} disabled={isCurrentRole(entry.endDate)} oninput={(event) => { entry.endDate = event.currentTarget.value; handleInput(); }} /></label>
            </div>
            <label class="current-role"><input type="checkbox" checked={isCurrentRole(entry.endDate)} onchange={(event) => setCurrentRole(entry, event.currentTarget.checked)} /><span>Current role</span></label>
          </section>
          <section class="editor-section evidence-section">
            <h2>Accomplishments</h2>
            {#each entry.bullets as bullet, index}
              <div class="bullet-row">
                <span class="bullet-dot" aria-hidden="true"></span>
                <textarea class="input-field bullet-input" aria-label="Accomplishment {index + 1}" bind:value={entry.bullets[index]} oninput={handleInput}></textarea>
                <button type="button" class="icon-btn icon-btn-xs bullet-remove" aria-label="Remove accomplishment {index + 1}" disabled={entry.bullets.length <= 1} onclick={() => (entry.bullets = removeBullet(entry.bullets, index))}><Trash size={13} /></button>
              </div>
            {/each}
            <button type="button" class="add-row inline-add" onclick={() => (entry.bullets = addBullet(entry.bullets))}><Plus size={16} /> <span>Add accomplishment</span></button>
          </section>
          <button type="button" class="remove-section" onclick={() => removeExperience(entry.id)}><Trash size={15} /> Remove position</button>
        </div>
      {/if}
    {:else if view.section === "education"}
      {@const entry = profile.education.find((candidate) => candidate.id === currentRecordId)}
      {#if entry}
        <div class="editor-form">
          <section class="editor-section">
            <h2>School</h2>
            <div class="form-grid">
              <label class="field span-2"><span>Institution</span><input class="input-field" bind:value={entry.institution} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section">
            <h2>Location</h2>
            <div class="form-grid location-grid">
              <label class="field"><span>City</span><input class="input-field" value={splitUsLocation(entry.location).city} oninput={(event) => updateLocation(entry, "city", event.currentTarget.value)} /></label>
              <label class="field"><span>State</span><span class="select-field-wrap"><select class="input-field" value={splitUsLocation(entry.location).state} onchange={(event) => updateLocation(entry, "state", event.currentTarget.value)}><option value="">Select state</option>{#each US_STATES as state}<option value={state.value}>{state.label}</option>{/each}</select><span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span></span></label>
            </div>
          </section>
          <section class="editor-section">
            <h2>Degree</h2>
            <div class="form-grid">
              <label class="field"><span>Degree type</span><span class="select-field-wrap"><select class="input-field" value={entry.degreeType ?? ""} onchange={(event) => updateEducationDegree(entry, { degreeType: event.currentTarget.value as DegreeType | "" })}><option value="">Select degree</option>{#each DEGREE_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}</select><span class="select-chevron" aria-hidden="true"><CaretDown size={14} /></span></span></label>
              <label class="field"><span>Field of study</span><input class="input-field" value={entry.fieldOfStudy ?? ""} oninput={(event) => updateEducationDegree(entry, { fieldOfStudy: event.currentTarget.value })} /></label>
              <label class="field"><span>GPA</span><input class="input-field" inputmode="decimal" bind:value={entry.gpa} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section">
            <h2>Dates</h2>
            <div class="form-grid">
              <label class="field"><span>Start month</span><input class="input-field" type="month" value={monthInputValue(entry.startDate)} oninput={(event) => { entry.startDate = event.currentTarget.value; handleInput(); }} /></label>
              <label class="field"><span>End month</span><input class="input-field" type="month" value={monthInputValue(entry.endDate)} oninput={(event) => { entry.endDate = event.currentTarget.value; handleInput(); }} /></label>
            </div>
          </section>
          <button type="button" class="remove-section" onclick={() => removeEducation(entry.id)}><Trash size={15} /> Remove education</button>
        </div>
      {/if}
    {:else}
      {@const entry = profile.projects.find((candidate) => candidate.id === currentRecordId)}
      {#if entry}
        <div class="editor-form">
          <section class="editor-section">
            <div class="form-grid">
              <label class="field span-2"><span>Name</span><input class="input-field" bind:value={entry.name} oninput={handleInput} /></label>
              <label class="field"><span>Date</span><input class="input-field" type="month" value={monthInputValue(entry.date ?? "")} oninput={(event) => { entry.date = event.currentTarget.value; handleInput(); }} /></label>
              <label class="field"><span>URL</span><input class="input-field" type="url" inputmode="url" bind:value={entry.url} oninput={handleInput} /></label>
            </div>
          </section>
          <section class="editor-section evidence-section">
            <h2>Accomplishments</h2>
            {#each entry.bullets as bullet, index}
              <div class="bullet-row">
                <span class="bullet-dot" aria-hidden="true"></span>
                <textarea class="input-field bullet-input" aria-label="Project accomplishment {index + 1}" bind:value={entry.bullets[index]} oninput={handleInput}></textarea>
                <button type="button" class="icon-btn icon-btn-xs bullet-remove" aria-label="Remove project accomplishment {index + 1}" disabled={entry.bullets.length <= 1} onclick={() => (entry.bullets = removeBullet(entry.bullets, index))}><Trash size={13} /></button>
              </div>
            {/each}
            <button type="button" class="add-row inline-add" onclick={() => (entry.bullets = addBullet(entry.bullets))}><Plus size={16} /> <span>Add accomplishment</span></button>
          </section>
          <button type="button" class="remove-section" onclick={() => removeProject(entry.id)}><Trash size={15} /> Remove project</button>
        </div>
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
    padding-bottom: var(--space-6);
  }

  .resume-nav-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .import-action {
    appearance: none;
    min-width: 44px;
    height: 44px;
    padding-inline: 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 0;
    border-radius: var(--radius-full);
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-ink);
    font: 600 var(--fs-xs) / 1 var(--font-sans);
    cursor: pointer;
  }

  .import-action:active {
    transform: scale(0.96);
  }

  .import-action:disabled {
    cursor: default;
    opacity: 0.64;
  }

  .identity-button,
  .section-action,
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

  .resume-identity {
    position: relative;
    padding-block: var(--space-3) var(--space-5);
  }

  .resume-identity::after {
    content: "";
    position: absolute;
    inset-block-end: 0;
    inset-inline-start: 0;
    width: 48px;
    height: 3px;
    border-radius: var(--radius-full);
    background: var(--color-accent);
  }

  .identity-button {
    width: 100%;
    min-height: 56px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    text-align: start;
  }

  .identity-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .identity-copy strong {
    font-size: var(--fs-xl);
    font-weight: 600;
    line-height: 1.15;
  }

  .identity-copy small {
    overflow: hidden;
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .identity-button > :global(svg) {
    flex: 0 0 auto;
    color: var(--color-accent);
  }

  .resume-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .resume-section-heading {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .resume-section-heading::before {
    content: "";
    width: 3px;
    height: 18px;
    flex: 0 0 auto;
    border-radius: var(--radius-full);
    background: var(--color-accent);
  }

  .resume-section-heading h2 {
    margin: 0;
    margin-inline-end: auto;
    color: var(--color-ink);
    font-size: var(--fs-lg);
    font-weight: 600;
    line-height: 1.25;
  }

  .section-action {
    width: 44px;
    height: 44px;
    margin-inline-end: -11px;
    padding: 0;
    display: grid;
    place-items: center;
    color: var(--color-accent);
  }

  .resume-entries {
    display: flex;
    flex-direction: column;
    padding-inline-start: var(--space-3);
    border-inline-start: 2px solid var(--color-line);
  }

  .resume-entry {
    position: relative;
    width: 100%;
    min-height: 56px;
    padding-block: 10px;
    padding-inline: 0 32px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-align: start;
  }

  .resume-entry + .resume-entry {
    border-top: 1px solid var(--color-line);
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

  .entry-edit {
    position: absolute;
    top: 13px;
    inset-inline-end: 5px;
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
    min-height: 44px;
    padding-block: 6px;
    padding-inline: var(--space-3) 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
    text-align: start;
    border-inline-start: 2px solid var(--color-line);
  }

  .compact-line {
    display: grid;
    grid-template-columns: minmax(80px, 0.35fr) minmax(0, 1fr);
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
    width: max-content;
    min-height: 44px;
    margin-inline-start: var(--space-3);
    padding: 0;
    color: var(--color-accent);
    font-size: var(--fs-xs);
    font-weight: 600;
    text-align: start;
  }

  .notes-preview {
    display: -webkit-box;
    overflow: hidden;
    color: var(--color-ink-3);
    font-size: var(--fs-xs);
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .section-action:active,
  .add-section-button:active {
    transform: scale(0.96);
  }

  .add-section-button {
    min-height: 44px;
    align-self: flex-start;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--color-accent);
    font-size: var(--fs-xs);
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

  .editor-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
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
    gap: 12px 10px;
  }

  .field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
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

  .editor-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .editor-item + .editor-item {
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-line);
  }

  .remove-item,
  .remove-section {
    appearance: none;
    min-height: 40px;
    align-self: flex-start;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: transparent;
    color: var(--color-bad);
    font: 500 var(--fs-xs) / 1 var(--font-sans);
    cursor: pointer;
  }

  .remove-section {
    width: 100%;
    margin-top: var(--space-2);
    padding-top: var(--space-4);
    justify-content: flex-start;
    border-top: 1px solid var(--color-line);
  }

  .evidence-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .evidence-section h2 {
    margin: 0;
    color: var(--color-ink);
    font-size: var(--fs-lg);
    font-weight: 600;
  }

  .current-role {
    min-height: 44px;
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 9px;
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

  .bullet-row {
    display: grid;
    grid-template-columns: 5px minmax(0, 1fr) 36px;
    align-items: start;
    gap: var(--space-2);
  }

  .bullet-dot {
    width: 5px;
    height: 5px;
    margin-top: 20px;
    border-radius: 50%;
    background: var(--color-accent);
  }

  .bullet-input {
    min-height: 72px;
    resize: vertical;
  }

  .bullet-remove {
    margin-top: 5px;
  }

  .notes-field {
    min-height: 220px;
  }

  .add-section-options {
    margin-top: var(--space-2);
  }

  .add-section-options button {
    appearance: none;
    width: 100%;
    min-height: 52px;
    padding: 8px 0;
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

  @media (max-width: 420px) {
    .import-action {
      padding-inline: 0;
    }

    .import-action span {
      display: none;
    }
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
