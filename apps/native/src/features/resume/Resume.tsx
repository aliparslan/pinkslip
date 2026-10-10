import type { OptionalSectionKind, ResumeProfile } from "@pinkslip/core/api";
import { DEGREE_OPTIONS, formatDegree, formatResumeDate, hasResumeContent } from "@pinkslip/core/resume-fields";
import { applyImport, importSummary } from "@pinkslip/core/resume-import-apply";
import { createEmptyResumeProfile, normalizeResumeProfile, type DegreeType } from "@pinkslip/domain/resume-profile";
import { useAutosave, useResumeProfile, useSaveResume } from "@pinkslip/data";
import * as Crypto from "expo-crypto";
import { Stack as RouterStack } from "expo-router";
import { Plus, Trash, UploadSimple, WarningCircle } from "phosphor-react-native";
import { useState, type ReactNode } from "react";
import { Alert, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, EmptyState, Field, ListRow, ListSection, SaveStatus, Screen, Select, Sheet, Spinner, Stack, Text, toast, UNDO_TOAST_DURATION } from "../../kit";
import { clearResumeFile, keepResumeFile } from "../../platform/resume-file";
import { Bullets, CityState, DateRange, MonthField, PairList, TextField } from "./fields";
import { ResumeImportFailure, type ImportedResume } from "./import";
import { useImportResume } from "./useImportResume";

const OPTIONAL: Record<OptionalSectionKind, string> = {
  leadership: "Leadership & affiliations", certifications: "Certifications", publications: "Publications", awards: "Awards & honors", volunteer: "Volunteer experience",
};
type Collection = "experience" | "education" | "projects";
type Update = (change: (draft: ResumeProfile) => ResumeProfile) => void;

const newId = () => Crypto.randomUUID().slice(0, 8);
const range = (start: string, end: string) => [formatResumeDate(start), formatResumeDate(end)].filter(Boolean).join(" – ");
const firstBullet = (items: string[]) => items.find((item) => item.trim())?.trim() ?? "";

/** Drops records left empty. */
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

/** The resume editor (`ResumeProfile.svelte`): an overview of every
 * section, each record edited in a sheet (Done or swipe down returns), PDF
 * import with a review step, and Clear. Every change autosaves; empty new
 * records are dropped when their sheet closes. */
export function Resume() {
  const resume = useResumeProfile();
  if (resume.isPending) return <Screen><Spinner label="Loading your resume" /></Screen>;
  if (resume.isError) return <Screen><EmptyState icon={WarningCircle} title="Your resume didn't load" actions={<Button onPress={() => void resume.refetch()}>Try again</Button>} /></Screen>;
  return <Editor initial={tidy(normalizeResumeProfile(resume.data.data))} />;
}

function Editor({ initial }: { initial: ResumeProfile }) {
  const importResume = useImportResume();
  const save = useSaveResume();
  const [profile, setProfile] = useState(initial);
  const [edit, setEdit] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [failure, setFailure] = useState<ResumeImportFailure | null>(null);
  const [pending, setPending] = useState<ImportedResume | null>(null);
  const autosave = useAutosave({ value: profile, ready: true, save: (next) => save.mutateAsync(next) });
  const update: Update = (change) => setProfile((current) => change(current));
  const close = () => { setProfile(tidy); setEdit(null); };

  const remove = (section: Collection, id: string, label: string) => {
    const index = profile[section].findIndex((entry) => entry.id === id);
    const removed = profile[section][index];
    update((draft) => ({ ...draft, [section]: draft[section].filter((entry) => entry.id !== id) }));
    setEdit(null);
    if (!removed || !hasResumeContent(removed)) return;
    toast.show({ message: `${label} removed`, duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => update((draft) => {
      const items = [...draft[section]] as typeof draft[typeof section];
      items.splice(index, 0, removed as never);
      return { ...draft, [section]: items };
    }) } });
  };
  const add = (section: Collection) => {
    const id = newId();
    const blank = section === "experience" ? { id, company: "", title: "", location: "", startDate: "", endDate: "", bullets: [""] }
      : section === "education" ? { id, institution: "", credentials: [{ id: newId(), fieldsOfStudy: [""] }], minors: [], location: "", startDate: "", endDate: "", gpa: "" }
      : { id, name: "", url: "", date: "", bullets: [""] };
    update((draft) => ({ ...draft, [section]: [...draft[section], blank] }));
    setEdit(`${section}:${id}`);
  };
  const runImport = async () => {
    setImporting(true);
    setFailure(null);
    try {
      const result = await importResume();
      if (result) setPending(result);
    } catch (error) {
      setFailure(error instanceof ResumeImportFailure ? error : new ResumeImportFailure("unknown"));
    } finally {
      setImporting(false);
    }
  };
  const clearAll = () => Alert.alert("Clear your resume?", "This removes every section. Resumes you've already tailored stay.", [
    { text: "Cancel", style: "cancel" },
    { text: "Clear resume", style: "destructive", onPress: () => save.mutate(createEmptyResumeProfile(), {
      onSuccess: (saved) => { setProfile(normalizeResumeProfile(saved.data)); clearResumeFile(); toast.success("Resume cleared"); },
      onError: () => toast.error("Couldn't clear your resume. Try again."),
    }) },
  ]);

  const { contact } = profile;
  const contactLine = [contact.email, contact.phone, contact.location].map((value) => value.trim()).filter(Boolean).join(" · ");
  const missing = (Object.keys(OPTIONAL) as OptionalSectionKind[]).filter((kind) => !profile.optionalSections.some((section) => section.kind === kind));
  const [kind, id] = edit?.split(":") ?? [];

  return <Screen>
    {/* An empty header item still draws a glass button, so it appears only with a status. */}
    <RouterStack.Screen options={{ headerRight: autosave.phase !== "error" ? undefined : () => <SaveStatus phase={autosave.phase} onRetry={autosave.retry} /> }} />
    <Stack gap="3">
      <View><Button variant="primary" icon={UploadSimple} pending={importing} onPress={() => void runImport()}>{importing ? "Reading your resume…" : "Import from PDF"}</Button></View>
      {failure && <Text size="sm" tone="bad">{failure.message}</Text>}
    </Stack>
    <ListSection label="Contact info"><ListRow title={contact.name || "Add your name"} detail={contactLine || "Email, phone, location and links"} onPress={() => setEdit("contact")} /></ListSection>
    <Section title="Experience" addLabel="Add experience" onAdd={() => add("experience")}>
      {profile.experience.map((entry) => <ListRow key={entry.id} title={entry.title || "Untitled role"} onPress={() => setEdit(`experience:${entry.id}`)}
        detail={[entry.company, range(entry.startDate, entry.endDate), firstBullet(entry.bullets)].filter(Boolean).join(" · ")} />)}
    </Section>
    <Section title="Education" addLabel="Add education" onAdd={() => add("education")}>
      {profile.education.map((entry) => <ListRow key={entry.id} title={entry.institution || "Untitled school"} onPress={() => setEdit(`education:${entry.id}`)}
        detail={[entry.credentials.map((credential) => formatDegree(credential.degreeType ?? "", credential.fieldsOfStudy.join(" and "))).filter(Boolean).join(" · "), range(entry.startDate, entry.endDate)].filter(Boolean).join(" · ")} />)}
    </Section>
    <Section title="Projects" addLabel="Add project" onAdd={() => add("projects")}>
      {profile.projects.map((entry) => <ListRow key={entry.id} title={entry.name || "Untitled project"} onPress={() => setEdit(`projects:${entry.id}`)}
        detail={[entry.role, formatResumeDate(entry.date ?? ""), firstBullet(entry.bullets)].filter(Boolean).join(" · ")} />)}
    </Section>
    {profile.skills.length > 0
      ? <ListSection label="Skills"><ListRow title={profile.skills.map((skill) => skill.category).filter(Boolean).join(", ") || "Skills"}
        detail={profile.skills.map((skill) => skill.items).filter(Boolean).join(" · ")} onPress={() => setEdit("skills")} /></ListSection>
      : <Stack gap="2"><Text size="xs" weight="semibold" tone="ink-4">Skills</Text><View><Button size="compact" icon={Plus} onPress={() => setEdit("skills")}>Add skills</Button></View></Stack>}
    {profile.optionalSections.map((section) => <ListSection key={section.kind} label={OPTIONAL[section.kind]}>
      <ListRow title={section.items.map((item) => item.category).filter(Boolean).join(", ") || OPTIONAL[section.kind]}
        detail={section.items.map((item) => item.items).filter(Boolean).join(" · ")} onPress={() => setEdit(`opt:${section.kind}`)} />
    </ListSection>)}
    {missing.length > 0 && <Stack gap="2">
      <Text size="sm" weight="medium" tone="ink-3">More sections</Text>
      <View style={styles.chips}>{missing.map((option) => <Button key={option} size="compact" icon={Plus} onPress={() => setEdit(`opt:${option}`)}>{OPTIONAL[option]}</Button>)}</View>
    </Stack>}
    {hasResumeContent(profile) && <View><Button variant="danger" icon={Trash} onPress={clearAll}>Clear resume</Button></View>}

    <RecordSheet kind={kind} id={id} profile={profile} update={update} onClose={close} onRemove={remove} />

    <Sheet open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }} title="Use this resume?"
      subtitle={pending ? importSummary(pending.profile) || "Contact details" : undefined}
      footer={<View style={styles.footer}>
        <View style={styles.half}><Button fullWidth onPress={() => setPending(null)}>Cancel</Button></View>
        <View style={styles.half}><Button variant="primary" fullWidth onPress={() => {
          if (!pending?.isCurrent()) { setPending(null); return; }
          const accepted = pending;
          setProfile(applyImport(profile, accepted.profile, normalizeResumeProfile));
          setPending(null);
          void keepResumeFile(accepted.sourceFile).then(() => toast.success("Resume imported"), () => {
            clearResumeFile();
            toast.error("Resume imported, but the PDF couldn't be kept for applications. Import it again.");
          });
        }}>Use this resume</Button></View>
      </View>}>
      {pending && <Stack gap="3">
        <Text tone="ink-2">Imported sections replace yours. Contact details fill in where the PDF has them.</Text>
        {(pending.warnings.length > 0 || (pending.assessment?.fields.some((field) => field.confidence !== "high") ?? false)) && <Stack gap="2">
          <Text weight="medium" tone="warn">Worth a look after importing</Text>
          {pending.warnings.map((warning) => <Text key={warning} size="sm" tone="ink-2">• {warning}</Text>)}
          {pending.assessment?.fields.filter((field) => field.confidence !== "high").slice(0, 6).map((field) =>
            <Text key={field.path} size="sm" tone="ink-2">• {field.label}{field.value ? `: ${field.value}` : ""}</Text>)}
        </Stack>}
      </Stack>}
    </Sheet>
  </Screen>;
}

function Section({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: ReactNode[] }) {
  return <Stack gap="2">
    {children.length > 0 ? <ListSection label={title}>{children}</ListSection> : <Text size="xs" weight="semibold" tone="ink-4">{title}</Text>}
    <View><Button size="compact" icon={Plus} onPress={onAdd}>{addLabel}</Button></View>
  </Stack>;
}

function RecordSheet({ kind, id, profile, update, onClose, onRemove }: {
  kind?: string; id?: string; profile: ResumeProfile; update: Update; onClose: () => void; onRemove: (section: Collection, id: string, label: string) => void;
}) {
  const collection = kind === "experience" || kind === "education" || kind === "projects" ? kind : null;
  const exists = collection && id ? profile[collection].some((entry) => entry.id === id) : false;
  const open = kind === "contact" || kind === "skills" || (kind === "opt" && Boolean(id && id in OPTIONAL)) || exists;
  const title = kind === "contact" ? "Contact info" : kind === "skills" ? "Skills" : kind === "opt" && id ? OPTIONAL[id as OptionalSectionKind]
    : kind === "experience" ? "Experience" : kind === "education" ? "Education" : "Project";
  const removeLabel = collection === "experience" ? "Position" : collection === "education" ? "School" : "Project";
  const removeOptional = () => { update((draft) => ({ ...draft, optionalSections: draft.optionalSections.filter((section) => section.kind !== id) })); onClose(); };

  return <Sheet open={Boolean(open)} onOpenChange={(next) => { if (!next) onClose(); }} title={title}
    footer={<View style={styles.footer}>
      {(exists || kind === "opt") && <Button variant="danger" icon={Trash} onPress={() => (collection && id ? onRemove(collection, id, removeLabel) : removeOptional())}>Remove</Button>}
      <View style={{ flex: 1 }}><Button variant="primary" fullWidth onPress={onClose}>Done</Button></View>
    </View>}>
    {kind === "contact" && <ContactEditor profile={profile} update={update} />}
    {kind === "skills" && <PairList titleLabel="Group" detailLabel="Skills" detailPlaceholder="TypeScript, React, Postgres" items={profile.skills} onChange={(skills) => update((draft) => ({ ...draft, skills }))} />}
    {kind === "opt" && id && id in OPTIONAL && <PairList titleLabel="Title" detailLabel="Details" detailPlaceholder="Organization, dates, what you did"
      items={profile.optionalSections.find((section) => section.kind === id)?.items ?? []}
      onChange={(items) => update((draft) => ({
        ...draft,
        optionalSections: draft.optionalSections.some((section) => section.kind === id)
          ? draft.optionalSections.map((section) => (section.kind === id ? { ...section, items } : section))
          : [...draft.optionalSections, { kind: id as OptionalSectionKind, items }],
      }))} />}
    {exists && collection === "experience" && id && <ExperienceEditor profile={profile} id={id} update={update} />}
    {exists && collection === "education" && id && <EducationEditor profile={profile} id={id} update={update} />}
    {exists && collection === "projects" && id && <ProjectEditor profile={profile} id={id} update={update} />}
  </Sheet>;
}

function ContactEditor({ profile, update }: { profile: ResumeProfile; update: Update }) {
  const set = (key: keyof ResumeProfile["contact"]) => (value: string) => update((draft) => ({ ...draft, contact: { ...draft.contact, [key]: value } }));
  const { contact } = profile;
  return <Stack gap="4">
    <TextField label="Name" value={contact.name} autoComplete="name" onChange={set("name")} />
    <TextField label="Email" keyboardType="email-address" value={contact.email} autoComplete="email" onChange={set("email")} />
    <TextField label="Phone" keyboardType="phone-pad" optional value={contact.phone} autoComplete="tel" onChange={set("phone")} />
    <CityState value={contact.location} onChange={set("location")} />
    <TextField label="LinkedIn" keyboardType="url" optional value={contact.linkedin} placeholder="linkedin.com/in/…" onChange={set("linkedin")} />
    <TextField label="GitHub" keyboardType="url" optional value={contact.github} placeholder="github.com/…" onChange={set("github")} />
    <TextField label="Website" keyboardType="url" optional value={contact.website} onChange={set("website")} />
  </Stack>;
}

function useEntry<K extends Collection>(profile: ResumeProfile, section: K, id: string, update: Update) {
  const entry = profile[section].find((candidate) => candidate.id === id) as ResumeProfile[K][number];
  const patch = (change: Partial<ResumeProfile[K][number]>) => update((draft) => ({
    ...draft, [section]: draft[section].map((candidate) => (candidate.id === id ? { ...candidate, ...change } : candidate)),
  }));
  return { entry, patch };
}

function ExperienceEditor({ profile, id, update }: { profile: ResumeProfile; id: string; update: Update }) {
  const { entry, patch } = useEntry(profile, "experience", id, update);
  return <Stack gap="4">
    <TextField label="Title" value={entry.title} onChange={(title) => patch({ title })} />
    <TextField label="Company" value={entry.company} onChange={(company) => patch({ company })} />
    <CityState value={entry.location} onChange={(location) => patch({ location })} />
    <DateRange start={entry.startDate} end={entry.endDate} currentLabel="I work here now" onChange={(startDate, endDate) => patch({ startDate, endDate })} />
    <Bullets label="Accomplishments" items={entry.bullets} placeholder="What you changed and the result" onChange={(bullets) => patch({ bullets })} />
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
    {entry.credentials.map((credential, index) => <Stack key={credential.id} gap="3">
      <Field label={entry.credentials.length > 1 ? `Degree ${index + 1}` : "Degree"}>
        <Select label="Degree" value={credential.degreeType ?? ""} onValueChange={(degreeType) => setCredential(index, { degreeType: degreeType as DegreeType })}
          options={DEGREE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} />
      </Field>
      <TextField label="Field of study" optional value={credential.fieldsOfStudy.join(", ")} placeholder="Computer Science"
        onChange={(value) => setCredential(index, { fieldsOfStudy: value.split(",").map((part) => part.trimStart()) })} />
      {entry.credentials.length > 1 && <View><Button size="compact" icon={Trash} onPress={() => patch({ credentials: entry.credentials.filter((_, at) => at !== index) })}>Remove degree</Button></View>}
    </Stack>)}
    <View><Button size="compact" icon={Plus} onPress={() => patch({ credentials: [...entry.credentials, { id: newId(), fieldsOfStudy: [""] }] })}>Add another degree</Button></View>
    <TextField label="Minors" optional value={entry.minors.join(", ")} placeholder="Mathematics, Design" onChange={(value) => patch({ minors: value ? value.split(",").map((part) => part.trimStart()) : [] })} />
    <CityState value={entry.location} onChange={(location) => patch({ location })} />
    <DateRange start={entry.startDate} end={entry.endDate} onChange={(startDate, endDate) => patch({ startDate, endDate })} />
    <TextField label="GPA" optional keyboardType="decimal-pad" value={entry.gpa ?? ""} onChange={(gpa) => patch({ gpa })} />
  </Stack>;
}

function ProjectEditor({ profile, id, update }: { profile: ResumeProfile; id: string; update: Update }) {
  const { entry, patch } = useEntry(profile, "projects", id, update);
  return <Stack gap="4">
    <TextField label="Name" value={entry.name} onChange={(name) => patch({ name })} />
    <TextField label="Your role" optional value={entry.role ?? ""} onChange={(role) => patch({ role })} />
    <TextField label="Team" optional value={entry.teamInfo ?? ""} placeholder="Solo, team of 4…" onChange={(teamInfo) => patch({ teamInfo })} />
    <TextField label="Link" keyboardType="url" optional value={entry.url} onChange={(url) => patch({ url })} />
    <MonthField label="When" value={entry.date ?? ""} onChange={(date) => patch({ date })} />
    <Bullets label="Highlights" items={entry.bullets} placeholder="What you built and why it mattered" onChange={(bullets) => patch({ bullets })} />
  </Stack>;
}

const styles = StyleSheet.create((theme) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.space["2"] },
  footer: { flexDirection: "row", gap: theme.space["3"] },
  half: { flex: 1 },
}));
