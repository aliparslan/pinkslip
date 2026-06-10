<script lang="ts">
  import { onMount } from "svelte";
  import { api, type ResumeProfile, type OptionalSection, type OptionalSectionKind } from "../lib/api";
  import { parsePdfToProfile } from "../lib/pdf-to-profile";
  import Plus from "phosphor-svelte/lib/Plus";
  import Trash from "phosphor-svelte/lib/Trash";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import UploadSimple from "phosphor-svelte/lib/UploadSimple";

  const EMPTY_PROFILE: ResumeProfile = {
    contact: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
    experience: [],
    education: [],
    projects: [],
    skills: [],
    optionalSections: [],
  };

  const OPTIONAL_SECTION_LABELS: Record<OptionalSectionKind, string> = {
    leadership: "Leadership & Affiliations",
    certifications: "Certifications",
    publications: "Publications",
    awards: "Awards & Honors",
    volunteer: "Volunteer Experience",
  };

  let loading = $state(true);
  let saving = $state(false);
  let error: string | null = $state(null);
  let success: string | null = $state(null);
  let profile: ResumeProfile = $state({ ...EMPTY_PROFILE });
  let notes = $state("");
  let savedAt = $state<string | null>(null);
  let autosaveTimer: number | null = $state(null);
  let saveAgain = false;
  let importing = $state(false);
  let importInput: HTMLInputElement | null = $state(null);

  type SectionId = "contact" | "experience" | "education" | "projects" | "skills" | "notes" | OptionalSectionKind;
  let expandedSections = $state<Set<string>>(new Set(["contact", "experience", "education", "projects", "skills", "notes"]));

  let availableOptionalSections = $derived.by(() => {
    const active = new Set(profile.optionalSections.map(s => s.kind));
    return (Object.keys(OPTIONAL_SECTION_LABELS) as OptionalSectionKind[]).filter(k => !active.has(k));
  });

  function toggleSection(id: string) {
    const next = new Set(expandedSections);
    if (next.has(id)) next.delete(id); else next.add(id);
    expandedSections = next;
  }

  function genId(): string { return crypto.randomUUID().slice(0, 8); }

  function addExperience() {
    profile.experience = [...profile.experience, { id: genId(), company: "", title: "", location: "", startDate: "", endDate: "", bullets: [""] }];
    queueAutosave();
  }
  function removeExperience(id: string) { profile.experience = profile.experience.filter(e => e.id !== id); queueAutosave(); }

  function addBullet(arr: string[], idx: number) { const next = [...arr]; next.splice(idx + 1, 0, ""); return next; }
  function removeBullet(arr: string[], idx: number) { return arr.length <= 1 ? arr : arr.filter((_, i) => i !== idx); }

  function addEducation() {
    profile.education = [...profile.education, { id: genId(), institution: "", degree: "", location: "", startDate: "", endDate: "", gpa: "" }];
    queueAutosave();
  }
  function removeEducation(id: string) { profile.education = profile.education.filter(e => e.id !== id); queueAutosave(); }

  function addProject() {
    profile.projects = [...profile.projects, { id: genId(), name: "", role: "", teamInfo: "", url: "", bullets: [""] }];
    queueAutosave();
  }
  function removeProject(id: string) { profile.projects = profile.projects.filter(p => p.id !== id); queueAutosave(); }

  function addSkill() { profile.skills = [...profile.skills, { category: "", items: "" }]; queueAutosave(); }
  function removeSkill(idx: number) { profile.skills = profile.skills.filter((_, i) => i !== idx); queueAutosave(); }

  function addOptionalSection(kind: OptionalSectionKind) {
    profile.optionalSections = [...profile.optionalSections, { kind, items: [{ category: "", items: "" }] }];
    expandedSections = new Set([...expandedSections, kind]);
    queueAutosave();
  }
  function removeOptionalSection(kind: OptionalSectionKind) {
    profile.optionalSections = profile.optionalSections.filter(s => s.kind !== kind);
    queueAutosave();
  }
  function addOptionalItem(kind: OptionalSectionKind) {
    profile.optionalSections = profile.optionalSections.map(s =>
      s.kind === kind ? { ...s, items: [...s.items, { category: "", items: "" }] } : s
    );
    queueAutosave();
  }
  function removeOptionalItem(kind: OptionalSectionKind, idx: number) {
    profile.optionalSections = profile.optionalSections.map(s =>
      s.kind === kind ? { ...s, items: s.items.filter((_, i) => i !== idx) } : s
    );
    queueAutosave();
  }

  async function loadAll() {
    loading = true; error = null;
    try {
      const [profileRes, corpusRes] = await Promise.all([api.profile.get(), api.corpus.get()]);
      const d = profileRes.data;
      let optSections = d.optionalSections ?? [];
      if (!optSections.length && (d as any).leadership?.length) {
        optSections = [{ kind: "leadership" as const, items: (d as any).leadership }];
      }
      profile = { ...EMPTY_PROFILE, ...d, optionalSections: optSections };
      savedAt = profileRes.updated_at;
      notes = corpusRes.content_md ?? "";
    } catch (e: any) { error = e.message; } finally { loading = false; }
  }

  async function saveAll(keepalive = false) {
    if (saving) {
      saveAgain = true;
      return;
    }
    saving = true; error = null;
    try {
      const [profileRes] = await Promise.all([
        api.profile.update(profile, { keepalive }),
        api.corpus.update(notes, { keepalive }),
      ]);
      savedAt = profileRes.updated_at;
      success = "Saved"; setTimeout(() => { success = null; }, 1600);
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
      if (saveAgain) {
        saveAgain = false;
        void saveAll(keepalive);
      }
    }
  }

  function queueAutosave() {
    if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => { autosaveTimer = null; saveAll(); }, 2000);
  }
  // Flush any pending autosave immediately. Called on unmount / backgrounding so
  // edits made within the debounce window aren't silently dropped on navigation.
  function flushAutosave() {
    if (autosaveTimer === null) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    void saveAll(true);
  }
  function handleInput() { queueAutosave(); }

  async function handlePdfImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importing = true; error = null;
    try {
      const parsed = await parsePdfToProfile(file);
      if (parsed.contact) {
        const c = parsed.contact;
        if (c.name && !profile.contact.name) profile.contact.name = c.name;
        if (c.email && !profile.contact.email) profile.contact.email = c.email;
        if (c.phone && !profile.contact.phone) profile.contact.phone = c.phone;
        if (c.location && !profile.contact.location) profile.contact.location = c.location;
        if (c.linkedin && !profile.contact.linkedin) profile.contact.linkedin = c.linkedin;
        if (c.github && !profile.contact.github) profile.contact.github = c.github;
        if (c.website && !profile.contact.website) profile.contact.website = c.website;
      }
      if (parsed.experience?.length && !profile.experience.length) profile.experience = parsed.experience;
      if (parsed.education?.length && !profile.education.length) profile.education = parsed.education;
      if (parsed.projects?.length && !profile.projects.length) profile.projects = parsed.projects;
      if (parsed.skills?.length && !profile.skills.length) profile.skills = parsed.skills;
      success = "Imported from PDF. Review and correct any fields that need fixing.";
      setTimeout(() => { success = null; }, 4000);
      queueAutosave();
    } catch (e: any) { error = `Could not parse PDF: ${e.message}`; } finally { importing = false; input.value = ""; }
  }

  onMount(() => {
    loadAll();
    const onHidden = () => { if (document.visibilityState === "hidden") flushAutosave(); };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flushAutosave);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flushAutosave);
      flushAutosave();
    };
  });
</script>

<div class="page">
  <div class="page-frame">
    <div class="page-hero">
      <div class="page-hero-copy">
        <h1 class="h-display" style="font-size: 28px; margin: 0;">Resume profile</h1>
        <p class="page-subtitle">Source of truth for tailored PDFs. Links and contact info are pulled directly from here.</p>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
        <input type="file" accept=".pdf" bind:this={importInput} onchange={handlePdfImport} style="display: none;" />
        <button class="btn-secondary" style="height: 36px; padding: 0 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;" onclick={() => importInput?.click()} disabled={importing}>
          <UploadSimple size={14} />
          {importing ? "Importing..." : "Import PDF"}
        </button>
        <button class="btn-primary btn-accent" style="height: 36px; padding: 0 14px; font-size: 12px;" onclick={() => saveAll()} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>

    {#if error}<div class="msg msg-error">{error}</div>{/if}
    {#if success}<div class="msg msg-success">{success}</div>{/if}

    {#if loading}
      <div style="padding: 48px 0; text-align: center; color: var(--color-ink-3); font-family: var(--font-mono); font-size: 12px;">Loading...</div>
    {:else}
      <!-- Contact -->
      <div class="card">
        <button class="card-header" onclick={() => toggleSection("contact")}>
          {#if expandedSections.has("contact")}<CaretDown size={14} />{:else}<CaretRight size={14} />{/if}
          <span class="card-title">Contact Info</span>
        </button>
        {#if expandedSections.has("contact")}
          <div class="card-body">
            <div class="grid-2">
              <label class="field"><span>Full name <em class="req">*</em></span><input class="input-field" bind:value={profile.contact.name} oninput={handleInput} placeholder="Jane Doe" /></label>
              <label class="field"><span>Email <em class="req">*</em></span><input class="input-field" type="email" bind:value={profile.contact.email} oninput={handleInput} placeholder="jane@example.com" /></label>
              <label class="field"><span>Phone <em class="req">*</em></span><input class="input-field" bind:value={profile.contact.phone} oninput={handleInput} placeholder="555-123-4567" /></label>
              <label class="field"><span>Location <em class="req">*</em></span><input class="input-field" bind:value={profile.contact.location} oninput={handleInput} placeholder="City, ST" /></label>
              <label class="field"><span>LinkedIn</span>
                <div class="prefixed-input">
                  <span class="input-prefix">linkedin.com/in/</span>
                  <input class="input-field prefixed" bind:value={profile.contact.linkedin} oninput={handleInput} placeholder="username" />
                </div>
              </label>
              <label class="field"><span>GitHub</span>
                <div class="prefixed-input">
                  <span class="input-prefix">github.com/</span>
                  <input class="input-field prefixed" bind:value={profile.contact.github} oninput={handleInput} placeholder="username" />
                </div>
              </label>
              <label class="field span-2"><span>Website</span><input class="input-field" bind:value={profile.contact.website} oninput={handleInput} placeholder="https://yoursite.com" /></label>
            </div>
          </div>
        {/if}
      </div>

      <!-- Experience -->
      <div class="card">
        <button class="card-header" onclick={() => toggleSection("experience")}>
          {#if expandedSections.has("experience")}<CaretDown size={14} />{:else}<CaretRight size={14} />{/if}
          <span class="card-title">Work Experience</span>
          <span class="card-count">{profile.experience.length}</span>
        </button>
        {#if expandedSections.has("experience")}
          <div class="card-body">
            {#each profile.experience as exp, expIdx (exp.id)}
              <div class="entry">
                <div class="entry-top">
                  <span class="entry-title">{exp.company || exp.title || "New position"}</span>
                  <button class="icon-btn icon-btn-surface" style="width: 28px; height: 28px;" aria-label="Remove" onclick={() => removeExperience(exp.id)}><Trash size={13} /></button>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Company <em class="req">*</em></span><input class="input-field" bind:value={exp.company} oninput={handleInput} placeholder="Company name" /></label>
                  <label class="field"><span>Title <em class="req">*</em></span><input class="input-field" bind:value={exp.title} oninput={handleInput} placeholder="Job title" /></label>
                  <label class="field"><span>Location</span><input class="input-field" bind:value={exp.location} oninput={handleInput} placeholder="City, ST" /></label>
                  <label class="field"><span>Start</span><input class="input-field" bind:value={exp.startDate} oninput={handleInput} placeholder="Month Year" /></label>
                  <label class="field"><span>End</span><input class="input-field" bind:value={exp.endDate} oninput={handleInput} placeholder="Present" /></label>
                </div>
                <div class="bullets">
                  <span class="bullets-label">Bullets</span>
                  {#each exp.bullets as bullet, bIdx}
                    <div class="bullet-row">
                      <span class="bullet-dot"></span>
                      <input class="input-field bullet-input" bind:value={exp.bullets[bIdx]} oninput={handleInput} placeholder="Accomplishment or responsibility..."
                        onkeydown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); profile.experience[expIdx].bullets = addBullet(exp.bullets, bIdx); }
                          if (e.key === "Backspace" && !bullet && exp.bullets.length > 1) { e.preventDefault(); profile.experience[expIdx].bullets = removeBullet(exp.bullets, bIdx); }
                        }} />
                    </div>
                  {/each}
                  <button class="btn-add-bullet" onclick={() => { profile.experience[expIdx].bullets = [...exp.bullets, ""]; queueAutosave(); }}><Plus size={11} /> Add bullet</button>
                </div>
              </div>
            {/each}
            <button class="btn-secondary add-btn" onclick={addExperience}><Plus size={13} /> Add position</button>
          </div>
        {/if}
      </div>

      <!-- Education -->
      <div class="card">
        <button class="card-header" onclick={() => toggleSection("education")}>
          {#if expandedSections.has("education")}<CaretDown size={14} />{:else}<CaretRight size={14} />{/if}
          <span class="card-title">Education</span>
          <span class="card-count">{profile.education.length}</span>
        </button>
        {#if expandedSections.has("education")}
          <div class="card-body">
            {#each profile.education as edu (edu.id)}
              <div class="entry">
                <div class="entry-top">
                  <span class="entry-title">{edu.institution || "New entry"}</span>
                  <button class="icon-btn icon-btn-surface" style="width: 28px; height: 28px;" aria-label="Remove" onclick={() => removeEducation(edu.id)}><Trash size={13} /></button>
                </div>
                <div class="grid-2">
                  <label class="field span-2"><span>Institution <em class="req">*</em></span><input class="input-field" bind:value={edu.institution} oninput={handleInput} placeholder="University name" /></label>
                  <label class="field span-2"><span>Degree</span><input class="input-field" bind:value={edu.degree} oninput={handleInput} placeholder="B.S. Computer Science" /></label>
                  <label class="field"><span>Location</span><input class="input-field" bind:value={edu.location} oninput={handleInput} placeholder="City, ST" /></label>
                  <label class="field"><span>GPA</span><input class="input-field" bind:value={edu.gpa} oninput={handleInput} placeholder="3.9" /></label>
                  <label class="field"><span>Start</span><input class="input-field" bind:value={edu.startDate} oninput={handleInput} placeholder="Month Year" /></label>
                  <label class="field"><span>End</span><input class="input-field" bind:value={edu.endDate} oninput={handleInput} placeholder="Month Year" /></label>
                </div>
              </div>
            {/each}
            <button class="btn-secondary add-btn" onclick={addEducation}><Plus size={13} /> Add education</button>
          </div>
        {/if}
      </div>

      <!-- Projects -->
      <div class="card">
        <button class="card-header" onclick={() => toggleSection("projects")}>
          {#if expandedSections.has("projects")}<CaretDown size={14} />{:else}<CaretRight size={14} />{/if}
          <span class="card-title">Projects</span>
          <span class="card-count">{profile.projects.length}</span>
        </button>
        {#if expandedSections.has("projects")}
          <div class="card-body">
            {#each profile.projects as proj, projIdx (proj.id)}
              <div class="entry">
                <div class="entry-top">
                  <span class="entry-title">{proj.name || "New project"}</span>
                  <button class="icon-btn icon-btn-surface" style="width: 28px; height: 28px;" aria-label="Remove" onclick={() => removeProject(proj.id)}><Trash size={13} /></button>
                </div>
                <div class="grid-2">
                  <label class="field"><span>Name <em class="req">*</em></span><input class="input-field" bind:value={proj.name} oninput={handleInput} placeholder="Project name" /></label>
                  <label class="field"><span>Role</span><input class="input-field" bind:value={proj.role} oninput={handleInput} placeholder="Full Stack" /></label>
                  <label class="field"><span>Team</span><input class="input-field" bind:value={proj.teamInfo} oninput={handleInput} placeholder="Solo / Team of 5" /></label>
                  <label class="field"><span>URL</span><input class="input-field" bind:value={proj.url} oninput={handleInput} placeholder="https://project-url.com" /></label>
                </div>
                <div class="bullets">
                  <span class="bullets-label">Bullets</span>
                  {#each proj.bullets as bullet, bIdx}
                    <div class="bullet-row">
                      <span class="bullet-dot"></span>
                      <input class="input-field bullet-input" bind:value={proj.bullets[bIdx]} oninput={handleInput} placeholder="What you built or achieved..."
                        onkeydown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); profile.projects[projIdx].bullets = addBullet(proj.bullets, bIdx); }
                          if (e.key === "Backspace" && !bullet && proj.bullets.length > 1) { e.preventDefault(); profile.projects[projIdx].bullets = removeBullet(proj.bullets, bIdx); }
                        }} />
                    </div>
                  {/each}
                  <button class="btn-add-bullet" onclick={() => { profile.projects[projIdx].bullets = [...proj.bullets, ""]; queueAutosave(); }}><Plus size={11} /> Add bullet</button>
                </div>
              </div>
            {/each}
            <button class="btn-secondary add-btn" onclick={addProject}><Plus size={13} /> Add project</button>
          </div>
        {/if}
      </div>

      <!-- Skills -->
      <div class="card">
        <button class="card-header" onclick={() => toggleSection("skills")}>
          {#if expandedSections.has("skills")}<CaretDown size={14} />{:else}<CaretRight size={14} />{/if}
          <span class="card-title">Skills</span>
          <span class="card-count">{profile.skills.length}</span>
        </button>
        {#if expandedSections.has("skills")}
          <div class="card-body">
            {#each profile.skills as skill, idx}
              <div class="kv-row">
                <input class="input-field kv-key" bind:value={skill.category} oninput={handleInput} placeholder="Category" />
                <input class="input-field kv-val" bind:value={skill.items} oninput={handleInput} placeholder="Comma-separated items" />
                <button class="icon-btn icon-btn-surface" style="width: 28px; height: 28px; flex-shrink: 0;" aria-label="Remove" onclick={() => removeSkill(idx)}><Trash size={13} /></button>
              </div>
            {/each}
            <button class="btn-secondary add-btn" onclick={addSkill}><Plus size={13} /> Add category</button>
          </div>
        {/if}
      </div>

      <!-- Optional sections -->
      {#each profile.optionalSections as section}
        <div class="card">
          <div class="card-header" role="button" tabindex="0" onclick={() => toggleSection(section.kind)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSection(section.kind); }}>
            {#if expandedSections.has(section.kind)}<CaretDown size={14} />{:else}<CaretRight size={14} />{/if}
            <span class="card-title">{OPTIONAL_SECTION_LABELS[section.kind]}</span>
            <span class="card-count">{section.items.length}</span>
            <button class="icon-btn icon-btn-surface" style="width: 24px; height: 24px; margin-left: 4px;" aria-label="Remove section" onclick={(e) => { e.stopPropagation(); removeOptionalSection(section.kind); }}><Trash size={12} /></button>
          </div>
          {#if expandedSections.has(section.kind)}
            <div class="card-body">
              {#each section.items as item, idx}
                <div class="kv-row">
                  <input class="input-field kv-key" bind:value={item.category} oninput={handleInput} placeholder="Label" />
                  <input class="input-field kv-val" bind:value={item.items} oninput={handleInput} placeholder="Details" />
                  <button class="icon-btn icon-btn-surface" style="width: 28px; height: 28px; flex-shrink: 0;" aria-label="Remove" onclick={() => removeOptionalItem(section.kind, idx)}><Trash size={13} /></button>
                </div>
              {/each}
              <button class="btn-secondary add-btn" onclick={() => addOptionalItem(section.kind)}><Plus size={13} /> Add item</button>
            </div>
          {/if}
        </div>
      {/each}

      <!-- Add section menu -->
      {#if availableOptionalSections.length > 0}
        <div class="add-section-area">
          <span class="add-section-label">Add section:</span>
          {#each availableOptionalSections as kind}
            <button class="btn-secondary add-btn" onclick={() => addOptionalSection(kind)}>
              <Plus size={12} /> {OPTIONAL_SECTION_LABELS[kind]}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Notes -->
      <div class="card">
        <button class="card-header" onclick={() => toggleSection("notes")}>
          {#if expandedSections.has("notes")}<CaretDown size={14} />{:else}<CaretRight size={14} />{/if}
          <span class="card-title">Notes & Extra Context</span>
        </button>
        {#if expandedSections.has("notes")}
          <div class="card-body">
            <p style="font-size: 11px; color: var(--color-ink-4); margin: 0 0 8px; line-height: 1.5;">
              Free-form notes for the AI — extra context, narrative details, things that don't fit in the structured fields above.
            </p>
            <textarea class="input-field" style="min-height: 160px; resize: vertical; height: auto;" bind:value={notes} oninput={handleInput} placeholder="Add supplementary context..."></textarea>
          </div>
        {/if}
      </div>

      {#if savedAt}
        <div style="text-align: right; font-size: 11px; color: var(--color-ink-4); margin-top: 10px; font-family: var(--font-mono);">
          saved {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .card { border: 1px solid var(--color-line); border-radius: 14px; overflow: hidden; margin-bottom: 10px; }
  .card-header { width: 100%; display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: transparent; border: none; cursor: pointer; font-size: 13px; color: var(--color-ink); text-align: left; }
  .card-header:hover { background: color-mix(in oklch, var(--color-bg-sunken) 50%, transparent); }
  .card-title { font-weight: 600; font-size: 13px; }
  .card-count { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--color-ink-4); }
  .card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 12px; border-top: 0.5px solid var(--color-line); }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .field { display: flex; flex-direction: column; gap: 3px; }
  .field > span { font-size: 11px; font-weight: 500; color: var(--color-ink-4); letter-spacing: 0.01em; }
  .field.span-2, .span-2 { grid-column: 1 / -1; }
  .req { font-style: normal; color: var(--color-accent); }

  .prefixed-input { display: flex; align-items: center; border: 1px solid var(--color-line); border-radius: 10px; background: var(--color-bg-sunken); overflow: hidden; height: 40px; }
  .input-prefix { padding: 0 0 0 12px; font-size: 12px; color: var(--color-ink-4); white-space: nowrap; flex-shrink: 0; user-select: none; }
  .input-field.prefixed { border: none; background: transparent; border-radius: 0; padding-left: 2px; height: 100%; }

  .entry { padding: 12px; border: 1px solid var(--color-line); border-radius: 10px; display: flex; flex-direction: column; gap: 10px; }
  .entry-top { display: flex; align-items: center; justify-content: space-between; }
  .entry-title { font-size: 12px; font-weight: 600; color: var(--color-ink-2); }

  .bullets { display: flex; flex-direction: column; gap: 5px; }
  .bullets-label { font-size: 11px; font-weight: 500; color: var(--color-ink-4); }
  .bullet-row { display: flex; align-items: center; gap: 6px; }
  .bullet-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--color-ink-4); flex-shrink: 0; }
  .bullet-input { flex: 1; font-size: 12px; height: 34px; }
  .btn-add-bullet { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--color-ink-4); font-size: 11px; cursor: pointer; padding: 4px 0; margin-top: 2px; }
  .btn-add-bullet:hover { color: var(--color-ink-2); }

  .add-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 12px; font-size: 12px; }

  .kv-row { display: flex; gap: 8px; align-items: center; }
  .kv-key { width: 120px; flex-shrink: 0; font-size: 12px; height: 34px; }
  .kv-val { flex: 1; font-size: 12px; height: 34px; }

  .add-section-area { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; padding: 10px 0; }
  .add-section-label { font-size: 11px; font-weight: 500; color: var(--color-ink-4); }

  .msg { padding: 12px 14px; border-radius: 12px; margin-bottom: 14px; font-size: 13px; }
  .msg-error { background: color-mix(in oklch, var(--color-bad) 14%, transparent); color: var(--color-bad); }
  .msg-success { background: color-mix(in oklch, var(--color-good) 14%, transparent); color: var(--color-good); }

  @media (max-width: 540px) {
    .grid-2 { grid-template-columns: 1fr; }
    .kv-row { flex-wrap: wrap; }
    .kv-key { width: 100%; }
  }
</style>
