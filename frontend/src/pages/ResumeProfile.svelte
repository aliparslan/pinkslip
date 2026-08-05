<script lang="ts">
  import { onMount } from "svelte";
  import { api, type ResumeProfile, type OptionalSectionKind } from "../lib/api";
  import { errorMessage } from "../lib/utils";
  import { navigate } from "../router";
  import { requestBack } from "../lib/nav-back";
  import Plus from "phosphor-svelte/lib/Plus";
  import Trash from "phosphor-svelte/lib/Trash";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import UploadSimple from "phosphor-svelte/lib/UploadSimple";
  import Spinner from "../components/Spinner.svelte";
  import ScreenNav from "../components/ScreenNav.svelte";
  import SaveStatus from "../components/SaveStatus.svelte";
  import Modal from "../components/Modal.svelte";
  import { feedback } from "../lib/feedback.svelte";
  import { SavePresentation } from "../lib/task-presentation.svelte";
  import { createEmptyResumeProfile } from "../../../shared/resume-profile";
  import { registerAutosaveFlush } from "../lib/autosave-lifecycle";

  const OPTIONAL_SECTION_LABELS: Record<OptionalSectionKind, string> = {
    leadership: "Leadership & affiliations",
    certifications: "Certifications",
    publications: "Publications",
    awards: "Awards & honors",
    volunteer: "Volunteer experience",
  };

  type CollectionSection = "experience" | "education" | "projects";
  type ResumeSection = "contact" | CollectionSection | "skills" | "notes" | OptionalSectionKind;
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
    if (view.section === "experience") {
      const item = profile.experience.find((entry) => entry.id === currentRecordId);
      return item?.company || item?.title || "Position";
    }
    if (view.section === "education") {
      const item = profile.education.find((entry) => entry.id === currentRecordId);
      return item?.institution || "Education";
    }
    const item = profile.projects.find((entry) => entry.id === currentRecordId);
    return item?.name || "Project";
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

  function itemCount(count: number, singular: string, plural = `${singular}s`): string {
    if (count === 0) return "Not added";
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function contactSummary(): string {
    return profile.contact.name.trim() || profile.contact.email.trim() || "Not added";
  }

  function experienceDetail(entry: ResumeProfile["experience"][number]): string {
    const dates = [entry.startDate, entry.endDate].filter(Boolean).join(" – ");
    return [entry.title, dates].filter(Boolean).join(" · ");
  }

  function educationDetail(entry: ResumeProfile["education"][number]): string {
    return [entry.degree, entry.endDate].filter(Boolean).join(" · ");
  }

  function projectDetail(entry: ResumeProfile["projects"][number]): string {
    return [entry.role, entry.teamInfo].filter(Boolean).join(" · ");
  }

  function optionalSectionFor(section: ResumeSection) {
    return profile.optionalSections.find((candidate) => candidate.kind === section);
  }

  function openSection(section: ResumeSection) {
    view = { kind: "section", section };
  }

  function openRecord(section: CollectionSection, id: string) {
    view = { kind: "record", section, id };
  }

  function handleBack() {
    if (view.kind === "record") {
      view = { kind: "section", section: view.section };
      return;
    }
    if (view.kind === "section") {
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
    view = { kind: "section", section: "experience" };
  }

  function addEducation() {
    const id = genId();
    profile.education = [
      ...profile.education,
      { id, institution: "", degree: "", location: "", startDate: "", endDate: "", gpa: "" },
    ];
    queueAutosave();
    openRecord("education", id);
  }

  function removeEducation(id: string) {
    profile.education = profile.education.filter((entry) => entry.id !== id);
    queueAutosave();
    view = { kind: "section", section: "education" };
  }

  function addProject() {
    const id = genId();
    profile.projects = [
      ...profile.projects,
      { id, name: "", role: "", teamInfo: "", url: "", bullets: [""] },
    ];
    queueAutosave();
    openRecord("projects", id);
  }

  function removeProject(id: string) {
    profile.projects = profile.projects.filter((entry) => entry.id !== id);
    queueAutosave();
    view = { kind: "section", section: "projects" };
  }

  function addSkill() {
    profile.skills = [...profile.skills, { category: "", items: "" }];
    queueAutosave();
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
      profile = { ...createEmptyResumeProfile(), ...data, optionalSections };
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
      if (parsed.contact) {
        const contact = parsed.contact;
        if (contact.name && !profile.contact.name) profile.contact.name = contact.name;
        if (contact.email && !profile.contact.email) profile.contact.email = contact.email;
        if (contact.phone && !profile.contact.phone) profile.contact.phone = contact.phone;
        if (contact.location && !profile.contact.location) profile.contact.location = contact.location;
        if (contact.linkedin && !profile.contact.linkedin) profile.contact.linkedin = contact.linkedin;
        if (contact.github && !profile.contact.github) profile.contact.github = contact.github;
        if (contact.website && !profile.contact.website) profile.contact.website = contact.website;
      }
      if (parsed.experience?.length && !profile.experience.length) profile.experience = parsed.experience;
      if (parsed.education?.length && !profile.education.length) profile.education = parsed.education;
      if (parsed.projects?.length && !profile.projects.length) profile.projects = parsed.projects;
      if (parsed.skills?.length && !profile.skills.length) profile.skills = parsed.skills;
      feedback.success("PDF imported. Review the details.");
      queueAutosave();
    } catch (importError) {
      error = `Could not parse PDF: ${errorMessage(importError)}`;
    } finally {
      importing = false;
      input.value = "";
    }
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

{#snippet sectionRow(label: string, detail: string, section: ResumeSection)}
  <button type="button" class="resume-row" onclick={() => openSection(section)}>
    <span class="resume-row-copy">
      <strong>{label}</strong>
      <small>{detail}</small>
    </span>
    <CaretRight size={16} aria-hidden="true" />
  </button>
{/snippet}

{#snippet recordRow(title: string, detail: string, section: CollectionSection, id: string)}
  <button type="button" class="resume-row record-row" onclick={() => openRecord(section, id)}>
    <span class="resume-row-copy">
      <strong>{title}</strong>
      {#if detail}<small>{detail}</small>{/if}
    </span>
    <CaretRight size={16} aria-hidden="true" />
  </button>
{/snippet}

<div class="page pushed-screen">
  <ScreenNav
    title={screenTitle}
    backLabel={view.kind === "overview" ? "Back to You" : "Back"}
    onBack={handleBack}
  >
    {#snippet trailing()}<SaveStatus phase={savePresentation.phase} />{/snippet}
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

      <button type="button" class="resume-import" onclick={() => importInput?.click()} disabled={importing}>
        <span class="resume-import-icon">
          {#if importing}<Spinner />{:else}<UploadSimple size={18} />{/if}
        </span>
        <span class="resume-row-copy">
          <strong>{importing ? "Importing…" : "Import PDF"}</strong>
          <small>Fill empty fields</small>
        </span>
        <CaretRight size={16} aria-hidden="true" />
      </button>

      <div class="resume-list" aria-label="Resume sections">
        {@render sectionRow("Contact info", contactSummary(), "contact")}
        {@render sectionRow("Work experience", itemCount(profile.experience.length, "position"), "experience")}
        {@render sectionRow("Education", itemCount(profile.education.length, "entry", "entries"), "education")}
        {@render sectionRow("Projects", itemCount(profile.projects.length, "project"), "projects")}
        {@render sectionRow("Skills", itemCount(profile.skills.length, "category", "categories"), "skills")}
        {#each profile.optionalSections as section (section.kind)}
          {@render sectionRow(OPTIONAL_SECTION_LABELS[section.kind], itemCount(section.items.length, "item"), section.kind)}
        {/each}
        {@render sectionRow("Tailoring notes", notes.trim() ? "Added" : "Not added", "notes")}
      </div>

      {#if availableOptionalSections.length > 0}
        <button type="button" class="add-row" onclick={() => (addSectionOpen = true)}>
          <Plus size={16} aria-hidden="true" />
          <span>Add section</span>
        </button>
      {/if}
    {:else if view.kind === "section"}
      {#if view.section === "contact"}
        <div class="editor-form">
          <div class="form-grid">
            <label class="field"><span>Full name</span><input class="input-field" name="name" autocomplete="name" bind:value={profile.contact.name} oninput={handleInput} placeholder="Jane Doe" /></label>
            <label class="field"><span>Email</span><input class="input-field" name="email" type="email" autocomplete="email" bind:value={profile.contact.email} oninput={handleInput} placeholder="jane@example.com" /></label>
            <label class="field"><span>Phone</span><input class="input-field" name="phone" type="tel" inputmode="tel" autocomplete="tel" bind:value={profile.contact.phone} oninput={handleInput} placeholder="555-123-4567" /></label>
            <label class="field"><span>Location</span><input class="input-field" name="location" autocomplete="address-level2" bind:value={profile.contact.location} oninput={handleInput} placeholder="City, ST" /></label>
            <label class="field"><span>LinkedIn</span><input class="input-field" name="linkedin" type="url" inputmode="url" bind:value={profile.contact.linkedin} oninput={handleInput} autocapitalize="off" autocomplete="url" spellcheck="false" placeholder="linkedin.com/in/jane" /></label>
            <label class="field"><span>GitHub</span><input class="input-field" name="github" type="url" inputmode="url" bind:value={profile.contact.github} oninput={handleInput} autocapitalize="off" autocomplete="url" spellcheck="false" placeholder="github.com/jane" /></label>
            <label class="field span-2"><span>Website</span><input class="input-field" name="website" type="url" inputmode="url" autocomplete="url" bind:value={profile.contact.website} oninput={handleInput} placeholder="yoursite.com" /></label>
          </div>
        </div>
      {:else if view.section === "experience"}
        <div class="record-list">
          {#each profile.experience as entry (entry.id)}
            {@render recordRow(entry.company || entry.title || "New position", experienceDetail(entry), "experience", entry.id)}
          {/each}
          <button type="button" class="add-row" onclick={addExperience}><Plus size={16} /> <span>Add position</span></button>
        </div>
      {:else if view.section === "education"}
        <div class="record-list">
          {#each profile.education as entry (entry.id)}
            {@render recordRow(entry.institution || "New education", educationDetail(entry), "education", entry.id)}
          {/each}
          <button type="button" class="add-row" onclick={addEducation}><Plus size={16} /> <span>Add education</span></button>
        </div>
      {:else if view.section === "projects"}
        <div class="record-list">
          {#each profile.projects as entry (entry.id)}
            {@render recordRow(entry.name || "New project", projectDetail(entry), "projects", entry.id)}
          {/each}
          <button type="button" class="add-row" onclick={addProject}><Plus size={16} /> <span>Add project</span></button>
        </div>
      {:else if view.section === "skills"}
        <div class="editor-form">
          {#each profile.skills as skill, index}
            <div class="editor-item">
              <div class="form-grid skill-grid">
                <label class="field"><span>Category</span><input class="input-field" bind:value={skill.category} oninput={handleInput} placeholder="Languages" /></label>
                <label class="field"><span>Skills</span><input class="input-field" bind:value={skill.items} oninput={handleInput} placeholder="TypeScript, Python" /></label>
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
            <textarea class="input-field textarea-field notes-field" bind:value={notes} oninput={handleInput} placeholder="Context to consider when tailoring…"></textarea>
          </label>
        </div>
      {:else}
        {@const optionalSection = optionalSectionFor(view.section)}
        {#if optionalSection}
          <div class="editor-form">
            {#each optionalSection.items as item, index}
              <div class="editor-item">
                <div class="form-grid skill-grid">
                  <label class="field"><span>Label</span><input class="input-field" bind:value={item.category} oninput={handleInput} placeholder="Organization or title" /></label>
                  <label class="field"><span>Details</span><input class="input-field" bind:value={item.items} oninput={handleInput} placeholder="Role, date, or result" /></label>
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
          <div class="form-grid">
            <label class="field"><span>Company</span><input class="input-field" bind:value={entry.company} oninput={handleInput} placeholder="Company name" /></label>
            <label class="field"><span>Title</span><input class="input-field" bind:value={entry.title} oninput={handleInput} placeholder="Job title" /></label>
            <label class="field span-2"><span>Location</span><input class="input-field" bind:value={entry.location} oninput={handleInput} placeholder="City, ST" /></label>
            <label class="field"><span>Start</span><input class="input-field" bind:value={entry.startDate} oninput={handleInput} placeholder="Month Year" /></label>
            <label class="field"><span>End</span><input class="input-field" bind:value={entry.endDate} oninput={handleInput} placeholder="Present" /></label>
          </div>
          <section class="evidence-section">
            <h2>Accomplishments</h2>
            {#each entry.bullets as bullet, index}
              <div class="bullet-row">
                <span class="bullet-dot" aria-hidden="true"></span>
                <textarea class="input-field bullet-input" aria-label="Accomplishment {index + 1}" bind:value={entry.bullets[index]} oninput={handleInput} placeholder="What changed because of your work?"></textarea>
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
          <div class="form-grid">
            <label class="field span-2"><span>Institution</span><input class="input-field" bind:value={entry.institution} oninput={handleInput} placeholder="University name" /></label>
            <label class="field span-2"><span>Degree</span><input class="input-field" bind:value={entry.degree} oninput={handleInput} placeholder="B.S. Computer Science" /></label>
            <label class="field"><span>Location</span><input class="input-field" bind:value={entry.location} oninput={handleInput} placeholder="City, ST" /></label>
            <label class="field"><span>GPA</span><input class="input-field" bind:value={entry.gpa} oninput={handleInput} placeholder="3.9" /></label>
            <label class="field"><span>Start</span><input class="input-field" bind:value={entry.startDate} oninput={handleInput} placeholder="Month Year" /></label>
            <label class="field"><span>End</span><input class="input-field" bind:value={entry.endDate} oninput={handleInput} placeholder="Month Year" /></label>
          </div>
          <button type="button" class="remove-section" onclick={() => removeEducation(entry.id)}><Trash size={15} /> Remove education</button>
        </div>
      {/if}
    {:else}
      {@const entry = profile.projects.find((candidate) => candidate.id === currentRecordId)}
      {#if entry}
        <div class="editor-form">
          <div class="form-grid">
            <label class="field"><span>Name</span><input class="input-field" bind:value={entry.name} oninput={handleInput} placeholder="Project name" /></label>
            <label class="field"><span>Role</span><input class="input-field" bind:value={entry.role} oninput={handleInput} placeholder="Full Stack" /></label>
            <label class="field"><span>Team</span><input class="input-field" bind:value={entry.teamInfo} oninput={handleInput} placeholder="Solo or team size" /></label>
            <label class="field"><span>URL</span><input class="input-field" bind:value={entry.url} oninput={handleInput} placeholder="project-url.com" /></label>
          </div>
          <section class="evidence-section">
            <h2>Accomplishments</h2>
            {#each entry.bullets as bullet, index}
              <div class="bullet-row">
                <span class="bullet-dot" aria-hidden="true"></span>
                <textarea class="input-field bullet-input" aria-label="Project accomplishment {index + 1}" bind:value={entry.bullets[index]} oninput={handleInput} placeholder="What did you build or improve?"></textarea>
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

<style>
  .resume-frame {
    padding-top: var(--space-2);
  }

  .resume-import,
  .resume-row,
  .add-row {
    appearance: none;
    width: 100%;
    min-height: 58px;
    padding: 10px 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    border: 0;
    border-bottom: 1px solid var(--color-line);
    background: transparent;
    color: var(--color-ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .resume-import {
    grid-template-columns: 34px minmax(0, 1fr) auto;
  }

  .resume-import:disabled {
    cursor: default;
    opacity: 0.64;
  }

  .resume-import-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md);
    background: var(--color-bg-sunken);
    color: var(--color-ink-2);
  }

  .resume-row-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .resume-row-copy strong {
    overflow: hidden;
    color: var(--color-ink);
    font-size: var(--fs-sm);
    font-weight: 600;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resume-row-copy small {
    overflow: hidden;
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resume-import > :global(svg),
  .resume-row > :global(svg) {
    color: var(--color-ink-4);
  }

  .resume-import:hover,
  .resume-row:hover {
    color: var(--color-accent);
  }

  .add-row {
    min-height: 52px;
    grid-template-columns: auto minmax(0, 1fr);
    justify-content: start;
    gap: var(--space-2);
    color: var(--color-accent);
    font-size: var(--fs-sm);
    font-weight: 500;
  }

  .add-row:hover {
    color: var(--color-accent-soft-ink);
  }

  .inline-add {
    align-self: flex-start;
    width: auto;
    min-width: 0;
    border-bottom: 0;
  }

  .record-list,
  .editor-form {
    width: 100%;
  }

  .editor-form {
    padding-top: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
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
    color: var(--color-ink-4);
    font-size: var(--fs-xs);
    font-weight: 500;
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
    color: var(--color-ink-2);
    font-size: var(--fs-sm);
    font-weight: 600;
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
