import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { CaretRight, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import type { OptionalSectionKind, ResumeProfile } from "@pinkslip/core/api";
import {
  DEGREE_OPTIONS, formatDegree, formatResumeDate, hasResumeContent,
} from "@pinkslip/core/resume-fields";
import { createEmptyResumeProfile, normalizeResumeProfile, type DegreeType } from "@pinkslip/domain/resume-profile";
import { useApi, useResumeProfile, useSaveResume } from "@pinkslip/data";
import {
  Alert, AlertDialog, Button, Dialog, Field, Heading, SaveStatus, Select, Separator, Stack, Surface, Text,
  toast, UNDO_TOAST_DURATION,
} from "../../kit";
import { useAutosave } from "../settings/useAutosave";
import { PageFailure, PageLoading } from "../states/LoadStates";
import { Bullets, CityState, DateRange, MonthField, PairList, TextField } from "./fields";
import { applyImport, importResume, importSummary, ResumeImportFailure, type ImportedResume } from "./import/run";
import { clearResumeFile, saveResumeFile } from "./resume-file";
import settings from "../settings/Settings.module.css";
import styles from "./Resume.module.css";

const OPTIONAL: Record<OptionalSectionKind, string> = {
  leadership: "Leadership & affiliations",
  certifications: "Certifications",
  publications: "Publications",
  awards: "Awards & honors",
  volunteer: "Volunteer experience",
};

type Collection = "experience" | "education" | "projects";

const newId = () => crypto.randomUUID().slice(0, 8);
const range = (start: string, end: string) => [formatResumeDate(start), formatResumeDate(end)].filter(Boolean).join(" – ");
const firstBullet = (items: string[]) => items.find((item) => item.trim())?.trim() ?? "";

/** The resume editor (`ResumeProfile.svelte`): an overview of every section,
 * each record edited on its own view (`?edit=…`, so Back returns to the
 * overview), PDF import with a review step, and Clear. Every change
 * autosaves. Empty new records are dropped on the way back. */
export function Resume() {
  const resume = useResumeProfile();
  if (resume.isPending) return <PageLoading label="Loading your resume" />;
  if (resume.isError) return <PageFailure title="Your resume didn't load" onRetry={() => void resume.refetch()} retrying={resume.isFetching} />;
  return <Editor initial={tidy(normalizeResumeProfile(resume.data.data))} />;
}

/** Drops records the person left empty. */
function tidy(profile: ResumeProfile): ResumeProfile {
  return {
    ...profile,
    experience: profile.experience.filter((entry) => hasResumeContent(entry)),
    education: profile.education.filter((entry) => hasResumeContent(entry)),
    projects: profile.projects.filter((entry) => hasResumeContent(entry)),
    skills: profile.skills.filter((entry) => hasResumeContent(entry)),
    optionalSections: profile.optionalSections.filter((section) => hasResumeContent(section)),
  };
}

function Editor({ initial }: { initial: ResumeProfile }) {
  const api = useApi();
  const router = useRouter();
  const navigate = useNavigate();
  const { edit } = useSearch({ strict: false }) as { edit?: string };
  const save = useSaveResume();
  const [profile, setProfile] = useState(initial);
  const autosave = useAutosave({ value: profile, ready: true, save: (next) => save.mutateAsync(next) });
  const update = (change: (draft: ResumeProfile) => ResumeProfile) => setProfile((current) => change(current));

  const open = (target: string) => void navigate({ to: "/you/resume", search: { edit: target } });
  const close = () => {
    setProfile(tidy);
    if (router.history.canGoBack()) router.history.back();
    else void navigate({ to: "/you/resume", search: {}, replace: true });
  };

  const remove = (section: Collection, id: string, label: string) => {
    const index = profile[section].findIndex((entry) => entry.id === id);
    const removed = profile[section][index];
    update((draft) => ({ ...draft, [section]: draft[section].filter((entry) => entry.id !== id) }));
    close();
    if (!removed || !hasResumeContent(removed)) return;
    toast.show({
      message: `${label} removed`, duration: UNDO_TOAST_DURATION,
      action: { label: "Undo", run: () => update((draft) => {
        const items = [...draft[section]] as typeof draft[typeof section];
        items.splice(index, 0, removed as never);
        return { ...draft, [section]: items };
      }) },
    });
  };

  const add = (section: Collection) => {
    const id = newId();
    const blank = section === "experience" ? { id, company: "", title: "", location: "", startDate: "", endDate: "", bullets: [""] }
      : section === "education" ? { id, institution: "", credentials: [{ id: newId(), fieldsOfStudy: [""] }], minors: [], location: "", startDate: "", endDate: "", gpa: "" }
        : { id, name: "", url: "", date: "", bullets: [""] };
    update((draft) => ({ ...draft, [section]: [...draft[section], blank] }));
    open(`${section}:${id}`);
  };

  const title = <div className={settings.titleRow}>
    <Heading level={1} variant="screen">Resume</Heading>
    <SaveStatus phase={autosave.phase} onRetry={autosave.retry} />
  </div>;

  if (edit) {
    const done = <Button variant="primary" onClick={close}>Done</Button>;
    const [kind, id] = edit.split(":");
    if (kind === "contact") return <View title={title} heading="Contact info" done={done}><ContactEditor profile={profile} update={update} /></View>;
    if (kind === "skills") {
      return <View title={title} heading="Skills" done={done}>
        <PairList titleLabel="Group" detailLabel="Skills" detailPlaceholder="TypeScript, React, Postgres" items={profile.skills}
          onChange={(skills) => update((draft) => ({ ...draft, skills }))} />
      </View>;
    }
    if (kind === "opt" && id in OPTIONAL) {
      const sectionKind = id as OptionalSectionKind;
      const section = profile.optionalSections.find((candidate) => candidate.kind === sectionKind);
      return <View title={title} heading={OPTIONAL[sectionKind]} done={done}
        remove={() => {
          update((draft) => ({ ...draft, optionalSections: draft.optionalSections.filter((candidate) => candidate.kind !== sectionKind) }));
          close();
        }}>
        <PairList titleLabel="Title" detailLabel="Details" detailPlaceholder="Organization, dates, what you did" items={section?.items ?? []}
          onChange={(items) => update((draft) => ({
            ...draft,
            optionalSections: draft.optionalSections.some((candidate) => candidate.kind === sectionKind)
              ? draft.optionalSections.map((candidate) => (candidate.kind === sectionKind ? { ...candidate, items } : candidate))
              : [...draft.optionalSections, { kind: sectionKind, items }],
          }))} />
      </View>;
    }
    if (kind === "experience" || kind === "education" || kind === "projects") {
      const exists = profile[kind].some((entry) => entry.id === id);
      if (exists) {
        const label = kind === "experience" ? "Position" : kind === "education" ? "School" : "Project";
        return <View title={title} heading={kind === "experience" ? "Experience" : kind === "education" ? "Education" : "Project"}
          done={done} remove={() => remove(kind, id, label)}>
          {kind === "experience" && <ExperienceEditor profile={profile} id={id} update={update} />}
          {kind === "education" && <EducationEditor profile={profile} id={id} update={update} />}
          {kind === "projects" && <ProjectEditor profile={profile} id={id} update={update} />}
        </View>;
      }
    }
  }

  return <Overview title={title} profile={profile} open={open} add={add}
    onImported={(next) => setProfile(next)}
    onCleared={(next) => setProfile(next)}
    api={api} />;
}

function View({ title, heading, done, remove, children }: { title: ReactNode; heading: string; done: ReactNode; remove?: () => void; children: ReactNode }) {
  return <Stack gap="6">
    {title}
    <Surface variant="card">
      <Stack gap="5">
        <Heading level={2} variant="section">{heading}</Heading>
        {children}
      </Stack>
    </Surface>
    <div className={styles.viewActions}>
      {remove && <Button variant="danger" icon={Trash} onClick={remove}>Remove</Button>}
      {done}
    </div>
  </Stack>;
}

type Update = (change: (draft: ResumeProfile) => ResumeProfile) => void;

function ContactEditor({ profile, update }: { profile: ResumeProfile; update: Update }) {
  const set = (key: keyof ResumeProfile["contact"]) => (value: string) => update((draft) => ({ ...draft, contact: { ...draft.contact, [key]: value } }));
  const { contact } = profile;
  return <Stack gap="4">
    <TextField label="Name" value={contact.name} autoComplete="name" onChange={set("name")} />
    <div className={styles.pair}>
      <TextField label="Email" type="email" value={contact.email} autoComplete="email" onChange={set("email")} />
      <TextField label="Phone" type="tel" optional value={contact.phone} autoComplete="tel" onChange={set("phone")} />
    </div>
    <CityState value={contact.location} onChange={set("location")} />
    <TextField label="LinkedIn" type="url" optional value={contact.linkedin} placeholder="linkedin.com/in/…" onChange={set("linkedin")} />
    <TextField label="GitHub" type="url" optional value={contact.github} placeholder="github.com/…" onChange={set("github")} />
    <TextField label="Website" type="url" optional value={contact.website} onChange={set("website")} />
  </Stack>;
}

function useEntry<K extends Collection>(profile: ResumeProfile, section: K, id: string, update: Update) {
  const entry = profile[section].find((candidate) => candidate.id === id) as ResumeProfile[K][number];
  const patch = (change: Partial<ResumeProfile[K][number]>) => update((draft) => ({
    ...draft,
    [section]: draft[section].map((candidate) => (candidate.id === id ? { ...candidate, ...change } : candidate)),
  }));
  return { entry, patch };
}

function ExperienceEditor({ profile, id, update }: { profile: ResumeProfile; id: string; update: Update }) {
  const { entry, patch } = useEntry(profile, "experience", id, update);
  return <Stack gap="4">
    <TextField label="Title" value={entry.title} onChange={(title) => patch({ title })} />
    <TextField label="Company" value={entry.company} onChange={(company) => patch({ company })} />
    <CityState value={entry.location} onChange={(location) => patch({ location })} />
    <DateRange start={entry.startDate} end={entry.endDate} currentLabel="I work here now"
      onChange={(startDate, endDate) => patch({ startDate, endDate })} />
    <Bullets label="Accomplishments" items={entry.bullets} placeholder="What you changed and the result"
      onChange={(bullets) => patch({ bullets })} />
  </Stack>;
}

function EducationEditor({ profile, id, update }: { profile: ResumeProfile; id: string; update: Update }) {
  const { entry, patch } = useEntry(profile, "education", id, update);
  const setCredential = (index: number, change: { degreeType?: DegreeType | ""; fieldsOfStudy?: string[] }) => patch({
    credentials: entry.credentials.map((credential, at) => (at !== index ? credential : {
      ...credential,
      ...(change.fieldsOfStudy ? { fieldsOfStudy: change.fieldsOfStudy } : {}),
      ...("degreeType" in change ? { degreeType: change.degreeType || undefined } : {}),
    })),
  });
  return <Stack gap="4">
    <TextField label="School" value={entry.institution} onChange={(institution) => patch({ institution })} />
    {entry.credentials.map((credential, index) => <div key={credential.id} className={styles.group}>
      <div className={styles.pair}>
        <Field label={entry.credentials.length > 1 ? `Degree ${index + 1}` : "Degree"}>
          <Select value={credential.degreeType ?? ""} onChange={(event) => setCredential(index, { degreeType: event.target.value as DegreeType | "" })}>
            <option value="">Choose</option>
            {DEGREE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <TextField label="Field of study" optional value={credential.fieldsOfStudy.join(", ")} placeholder="Computer Science"
          onChange={(value) => setCredential(index, { fieldsOfStudy: value.split(",").map((part) => part.trimStart()) })} />
      </div>
      {entry.credentials.length > 1 && <div><Button variant="secondary" size="compact" icon={Trash}
        onClick={() => patch({ credentials: entry.credentials.filter((_, at) => at !== index) })}>Remove degree</Button></div>}
    </div>)}
    <div><Button variant="secondary" size="compact" icon={Plus}
      onClick={() => patch({ credentials: [...entry.credentials, { id: newId(), fieldsOfStudy: [""] }] })}>Add another degree</Button></div>
    <TextField label="Minors" optional value={entry.minors.join(", ")} placeholder="Mathematics, Design"
      onChange={(value) => patch({ minors: value ? value.split(",").map((part) => part.trimStart()) : [] })} />
    <CityState value={entry.location} onChange={(location) => patch({ location })} />
    <DateRange start={entry.startDate} end={entry.endDate} onChange={(startDate, endDate) => patch({ startDate, endDate })} />
    <TextField label="GPA" optional inputMode="decimal" value={entry.gpa ?? ""} onChange={(gpa) => patch({ gpa })} />
  </Stack>;
}

function ProjectEditor({ profile, id, update }: { profile: ResumeProfile; id: string; update: Update }) {
  const { entry, patch } = useEntry(profile, "projects", id, update);
  return <Stack gap="4">
    <TextField label="Name" value={entry.name} onChange={(name) => patch({ name })} />
    <div className={styles.pair}>
      <TextField label="Your role" optional value={entry.role ?? ""} onChange={(role) => patch({ role })} />
      <TextField label="Team" optional value={entry.teamInfo ?? ""} placeholder="Solo, team of 4…" onChange={(teamInfo) => patch({ teamInfo })} />
    </div>
    <TextField label="Link" type="url" optional value={entry.url} onChange={(url) => patch({ url })} />
    <MonthField label="When" value={entry.date ?? ""} onChange={(date) => patch({ date })} />
    <Bullets label="Highlights" items={entry.bullets} placeholder="What you built and why it mattered" onChange={(bullets) => patch({ bullets })} />
  </Stack>;
}

/** One section on the overview: its records as rows, then Add. */
function Section({ title, count, children, addLabel, onAdd }: { title: string; count: number; children?: ReactNode; addLabel: string; onAdd: () => void }) {
  return <Stack as="section" gap="2">
    <Heading level={2} variant="section">{title}</Heading>
    {count > 0 && <Surface variant="list" bleedOnPhone as="ul">{children}</Surface>}
    <div><Button variant="secondary" size="compact" icon={Plus} onClick={onAdd}>{addLabel}</Button></div>
  </Stack>;
}

function Row({ title, detail, preview, onOpen, first }: { title: string; detail?: string; preview?: string; onOpen: () => void; first: boolean }) {
  return <>
    {!first && <li aria-hidden><Separator /></li>}
    <li>
      <button type="button" className={styles.row} onClick={onOpen}>
        <span className={styles.rowCopy}>
          <Text as="span" weight="medium" truncate>{title}</Text>
          {detail && <Text as="span" size="sm" tone="ink-3" truncate>{detail}</Text>}
          {preview && <Text as="span" size="sm" tone="ink-4" truncate>{preview}</Text>}
        </span>
        <CaretRight size={16} weight="bold" aria-hidden className={styles.chevron} />
      </button>
    </li>
  </>;
}

function Overview({ title, profile, open, add, onImported, onCleared, api }: {
  title: ReactNode;
  profile: ResumeProfile;
  open: (target: string) => void;
  add: (section: Collection) => void;
  onImported: (profile: ResumeProfile) => void;
  onCleared: (profile: ResumeProfile) => void;
  api: ReturnType<typeof useApi>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [failure, setFailure] = useState<ResumeImportFailure | null>(null);
  const [pending, setPending] = useState<{ file: File; result: ImportedResume } | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [clearing, setClearing] = useState(false);
  const save = useSaveResume();
  const { contact } = profile;
  const contactLine = [contact.email, contact.phone, contact.location].map((value) => value.trim()).filter(Boolean).join(" · ");
  const missingSections = (Object.keys(OPTIONAL) as OptionalSectionKind[])
    .filter((kind) => !profile.optionalSections.some((section) => section.kind === kind));

  const run = async (file: File) => {
    setImporting(true);
    setFailure(null);
    setLastFile(file);
    try {
      setPending({ file, result: await importResume(api, file) });
    } catch (error) {
      setFailure(error instanceof ResumeImportFailure ? error : new ResumeImportFailure("unknown"));
    } finally {
      setImporting(false);
    }
  };

  const recovery = failure && failure.code !== "import_rate_limited"
    ? ["file_too_large", "unsupported_type", "invalid_pdf", "protected_pdf", "no_extractable_text"].includes(failure.code)
      ? { label: "Choose another PDF", run: () => fileInput.current?.click() }
      : failure.code === "authentication_required" ? null
        : { label: "Try again", run: () => { if (lastFile) void run(lastFile); } }
    : null;

  return <Stack gap="6">
    {title}
    <Stack gap="3">
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className={styles.hidden} aria-hidden tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void run(file);
        }} />
      <div><Button variant="primary" icon={UploadSimple} pending={importing} onClick={() => fileInput.current?.click()}>
        {importing ? "Reading your resume…" : "Import from PDF"}
      </Button></div>
      {failure && <Alert tone="error" action={recovery && <Button variant="secondary" size="compact" onClick={recovery.run}>{recovery.label}</Button>}>
        {failure.message}
      </Alert>}
    </Stack>

    <Stack as="section" gap="2">
      <Heading level={2} variant="section">Contact info</Heading>
      <Surface variant="list" bleedOnPhone as="ul">
        <Row first title={contact.name || "Add your name"} detail={contactLine || "Email, phone, location and links"} onOpen={() => open("contact")} />
      </Surface>
    </Stack>

    <Section title="Experience" count={profile.experience.length} addLabel="Add experience" onAdd={() => add("experience")}>
      {profile.experience.map((entry, index) => <Row key={entry.id} first={index === 0}
        title={entry.title || "Untitled role"}
        detail={[entry.company, range(entry.startDate, entry.endDate)].filter(Boolean).join(" · ")}
        preview={firstBullet(entry.bullets)} onOpen={() => open(`experience:${entry.id}`)} />)}
    </Section>

    <Section title="Education" count={profile.education.length} addLabel="Add education" onAdd={() => add("education")}>
      {profile.education.map((entry, index) => <Row key={entry.id} first={index === 0}
        title={entry.institution || "Untitled school"}
        detail={[entry.credentials.map((credential) => formatDegree(credential.degreeType ?? "", credential.fieldsOfStudy.join(" and "))).filter(Boolean).join(" · "),
          range(entry.startDate, entry.endDate)].filter(Boolean).join(" · ")}
        onOpen={() => open(`education:${entry.id}`)} />)}
    </Section>

    <Section title="Projects" count={profile.projects.length} addLabel="Add project" onAdd={() => add("projects")}>
      {profile.projects.map((entry, index) => <Row key={entry.id} first={index === 0}
        title={entry.name || "Untitled project"} detail={[entry.role, formatResumeDate(entry.date ?? "")].filter(Boolean).join(" · ")}
        preview={firstBullet(entry.bullets)} onOpen={() => open(`projects:${entry.id}`)} />)}
    </Section>

    <Stack as="section" gap="2">
      <Heading level={2} variant="section">Skills</Heading>
      {profile.skills.length > 0
        ? <Surface variant="list" bleedOnPhone as="ul">
          <Row first title={profile.skills.map((skill) => skill.category).filter(Boolean).join(", ") || "Skills"}
            detail={profile.skills.map((skill) => skill.items).filter(Boolean).join(" · ")} onOpen={() => open("skills")} />
        </Surface>
        : <div><Button variant="secondary" size="compact" icon={Plus} onClick={() => open("skills")}>Add skills</Button></div>}
    </Stack>

    {profile.optionalSections.map((section) => <Stack key={section.kind} as="section" gap="2">
      <Heading level={2} variant="section">{OPTIONAL[section.kind]}</Heading>
      <Surface variant="list" bleedOnPhone as="ul">
        <Row first title={section.items.map((item) => item.category).filter(Boolean).join(", ") || OPTIONAL[section.kind]}
          detail={section.items.map((item) => item.items).filter(Boolean).join(" · ")} onOpen={() => open(`opt:${section.kind}`)} />
      </Surface>
    </Stack>)}

    {missingSections.length > 0 && <Stack gap="2">
      <Text size="sm" weight="medium" tone="ink-3">More sections</Text>
      <div className={styles.chips}>
        {missingSections.map((kind) => <Button key={kind} variant="secondary" size="compact" icon={Plus} onClick={() => open(`opt:${kind}`)}>{OPTIONAL[kind]}</Button>)}
      </div>
    </Stack>}

    {hasResumeContent(profile) && <div><Button variant="danger" icon={Trash} onClick={() => setClearing(true)}>Clear resume</Button></div>}

    <Dialog open={pending !== null} onOpenChange={(next) => { if (!next) setPending(null); }} title="Use this resume?"
      subtitle={pending ? importSummary(pending.result.profile) || "Contact details" : undefined}>
      {pending && <Stack gap="4">
        <Text size="sm" tone="ink-2">Imported sections replace yours. Contact details fill in where the PDF has them.</Text>
        {(pending.result.warnings.length > 0 || (pending.result.assessment?.reviewPaths.length ?? 0) > 0) && <Alert tone="warning" title="Worth a look after importing">
          <ul className={styles.review}>
            {pending.result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            {pending.result.assessment?.fields.filter((field) => field.confidence !== "high").slice(0, 6)
              .map((field) => <li key={field.path}>{field.label}{field.value ? `: ${field.value}` : ""}</li>)}
          </ul>
        </Alert>}
        <div className={styles.viewActions}>
          <Button variant="secondary" onClick={() => setPending(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            onImported(applyImport(profile, pending.result.profile, normalizeResumeProfile));
            // Kept on this device so applications can attach it.
            void saveResumeFile(pending.file).catch(() => undefined);
            setPending(null);
            toast.success("Resume imported");
          }}>Use this resume</Button>
        </div>
      </Stack>}
    </Dialog>

    <AlertDialog open={clearing} onOpenChange={setClearing} title="Clear your resume?"
      description="This removes every section. Resumes you've already tailored stay."
      confirmLabel="Clear resume" tone="danger" pending={save.isPending}
      onConfirm={() => save.mutate(createEmptyResumeProfile(), {
        onSuccess: (saved) => {
          onCleared(normalizeResumeProfile(saved.data));
          void clearResumeFile();
          setClearing(false);
          toast.success("Resume cleared");
        },
        onError: () => toast.error("Couldn't clear your resume. Try again."),
      })} />
  </Stack>;
}
