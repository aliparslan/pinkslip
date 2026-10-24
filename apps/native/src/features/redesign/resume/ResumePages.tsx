import type { DegreeType, ResumeProfile } from "@pinkslip/core/api";
import { formatResumeDate, monthInputValue } from "@pinkslip/core/resume-fields";
import { createEmptyResumeProfile, normalizeResumeProfile, type OptionalSectionKind } from "@pinkslip/domain/resume-profile";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Menu } from "../../../kit";
import { clearResumeFile, keepResumeFile, useLocalResumeFile } from "../../../platform/resume-file";
import {
  AddRow, BulletRows, Button, CompanyLogo, DangerRow, EmptyState, FieldGroup, Icon, InlineField, ListGroup, ListItem, MonthRow,
  SHEET_GROUP_RADIUS, SheetHeader, SheetModal, SheetStep, SwitchRow, Text, TextField, toast, UNDO_TOAST_DURATION, useSheet,
} from "../../../ui";
import { ResumeImportFailure, type ImportedResume, type ImportStep } from "../../resume/import";
import { useImportResume } from "../../resume/useImportResume";
import { YouPage } from "../you/Page";
import { endResumeSample, useResumeDraft, useTidyOnLeave } from "./draft";
import { dateRange, PRESENT, shortSchool } from "./facts";

/**
 * The resume editors (owner, 2026-10-14, Paper "Resume and Answers
 * editors"): Resume lists its sections as rows (A); Experience, Education
 * and Projects list their entries (R1a) and open a page each (R2a, R5);
 * Contact (R4) and Skills (R6) are pages of their own. Every change saves as
 * you type. Entries keep date order, so there's no reordering.
 */

const newId = () => Crypto.randomUUID().slice(0, 8);
/** The pages open one another inside You. */
function go(href: Href) {
  router.push(href);
}

/** The editor waits for the resume, or says it didn't load. */
function Loaded({ title, children }: { title: string; children: (profile: ResumeProfile) => ReactNode }) {
  const draft = useResumeDraft();
  if (!draft.profile) {
    return <YouPage title={title}>
      {draft.failed ? <EmptyState title="Your resume didn't load" message="It's safe. Check your connection and try again."
        action={{ label: "Try again", variant: "secondary", onPress: draft.retry }} /> : null}
    </YouPage>;
  }
  return <>{children(draft.profile)}</>;
}

// Resume (A) ------------------------------------------------------------------

const optionalNames: Record<OptionalSectionKind, string> = {
  certifications: "Certifications", awards: "Awards and honors", leadership: "Leadership", publications: "Publications", volunteer: "Volunteering",
};

export function ResumePage() {
  return <Loaded title="Resume">{(profile) => <ResumeOverview profile={profile} />}</Loaded>;
}

function ResumeOverview({ profile }: { profile: ResumeProfile }) {
  const draft = useResumeDraft();
  const file = useLocalResumeFile();
  const importResume = useImportResume();
  const [step, setStep] = useState<ImportStep | null>(null);
  const [found, setFound] = useState<ImportedResume | null>(null);
  const cancel = useRef<AbortController | null>(null);
  // Leaving the kit's sample returns the editors to your own resume.
  useEffect(() => () => endResumeSample(), []);
  const count = (items: unknown[]) => items.length > 0 ? String(items.length) : "Add";
  const skills = profile.skills.reduce((total, group) => total + group.items.split(",").filter((item) => item.trim()).length, 0);
  const others = profile.optionalSections.reduce((total, section) => total + section.items.length, 0);
  const school = profile.education.length === 1 ? shortSchool(profile.education[0]!.institution) || "1" : count(profile.education);
  const empty = !profile.contact.name && profile.experience.length === 0 && profile.education.length === 0 && profile.projects.length === 0 && skills === 0;

  const runImport = async () => {
    cancel.current = new AbortController();
    try {
      const result = await importResume(setStep, cancel.current.signal);
      if (result) setFound(result);
      setStep(null);
    } catch (error) {
      setStep(null);
      toast.error(error instanceof ResumeImportFailure ? error.message : "Couldn't read that PDF. Try another file.");
    }
  };
  const clear = () => Alert.alert("Clear your resume?", "This removes every section. Applications you've sent keep theirs.", [
    { text: "Cancel", style: "cancel" },
    { text: "Clear resume", style: "destructive", onPress: () => { draft.replace(createEmptyResumeProfile()); clearResumeFile(); } },
  ]);

  // With nothing in it yet, importing is the fast way in, so it comes first.
  const fresh = empty && !file;
  const importButton = <View style={styles.slot}>
    <Button fullWidth onPress={() => void runImport()}>{fresh ? "Import a PDF" : "Import a new PDF"}</Button>
  </View>;

  return <YouPage title="Resume">
    {fresh ? importButton : null}
    <ListGroup surface="fill">
      <ListItem title="Contact" value={profile.contact.name || "Add"} accessory="chevron" onPress={() => go("/you/resume-contact")} />
      <ListItem title="Experience" value={count(profile.experience)} accessory="chevron" onPress={() => go("/you/resume-experience")} />
      <ListItem title="Education" value={school} accessory="chevron" onPress={() => go("/you/resume-education")} />
      <ListItem title="Projects" value={count(profile.projects)} accessory="chevron" onPress={() => go("/you/resume-projects")} />
      <ListItem title="Skills" value={skills > 0 ? String(skills) : "Add"} accessory="chevron" onPress={() => go("/you/resume-skills")} />
      <ListItem title="Certifications and awards" value={others > 0 ? String(others) : "Add"} accessory="chevron" onPress={() => go("/you/resume-more")} />
    </ListGroup>
    {draft.phase === "error" ? <View style={styles.saveFailed}>
      <Text role="subhead" tone="bad">Your last change didn't save.</Text>
      <Pressable onPress={() => draft.update((current) => current)} accessibilityRole="button" hitSlop={8}>
        <Text role="subhead" weight="medium">Try again</Text>
      </Pressable>
    </View> : null}
    {fresh ? null : importButton}
    {empty ? null : <DangerRow label="Clear resume" onPress={clear} />}
    <ImportSheet step={step} found={found} onClosed={() => { cancel.current?.abort(); setStep(null); setFound(null); }} onUse={(accepted) => {
      draft.replace(withImport(profile, accepted.profile));
      void keepResumeFile(accepted.sourceFile).then(() => undefined, () => toast.error("Couldn't keep the PDF for applications."));
    }} />
  </YouPage>;
}

/** An import replaces the sections it found; contact fills in only where
 * yours is empty (R7). */
function withImport(current: ResumeProfile, imported: Partial<ResumeProfile>): ResumeProfile {
  const next = structuredClone(current);
  if (imported.contact) {
    for (const key of Object.keys(next.contact) as (keyof ResumeProfile["contact"])[]) {
      const value = imported.contact[key]?.trim();
      if (value && !next.contact[key].trim()) next.contact[key] = value;
    }
  }
  if (imported.experience?.length) next.experience = imported.experience;
  if (imported.education?.length) next.education = normalizeResumeProfile({ ...next, education: imported.education }).education;
  if (imported.projects?.length) next.projects = imported.projects;
  if (imported.skills?.length) next.skills = imported.skills;
  if (imported.optionalSections?.length) next.optionalSections = imported.optionalSections;
  return next;
}

/** L3 then R7 in one sheet: reading the PDF, then what it found. iOS shows
 * one modal at a time, so a second sheet opened as the first left never
 * appeared and the import seemed to do nothing (owner, 2026-10-19). Closing
 * it while it reads cancels the import. */
function ImportSheet({ step, found, onClosed, onUse }: {
  step: ImportStep | null; found: ImportedResume | null; onClosed: () => void; onUse: (found: ImportedResume) => void;
}) {
  return <SheetModal open={step !== null || found !== null} onClosed={onClosed}>
    {found ? <UseThisResumeStep found={found} onUse={onUse} /> : step ? <ImportingStep step={step} /> : null}
  </SheetModal>;
}

/** L3: what the import is doing, a bar that fills by real steps, and Cancel.
 * Never a time estimate. */
function ImportingStep({ step }: { step: ImportStep }) {
  const sheet = useSheet();
  return <SheetStep id="importing">
    <View style={styles.lead}>
      <SheetHeader title={`Reading ${step.name}`} />
      <Text tone="ink-2">{step.step === "reading" ? "Finding your experience and skills." : "It's a scan, so reading it page by page."}</Text>
    </View>
    <View style={styles.track}><View style={[styles.fillBar, { width: step.step === "reading" ? "45%" : "75%" }]} /></View>
    <Button variant="text" fullWidth onPress={sheet.close}>Cancel</Button>
  </SheetStep>;
}

/** R7: what was found, before it replaces anything. */
function UseThisResumeStep({ found, onUse }: { found: ImportedResume; onUse: (found: ImportedResume) => void }) {
  const sheet = useSheet();
  const { profile } = found;
  const rows: [string, string][] = [];
  if (profile.experience?.length) rows.push(["Experience", String(profile.experience.length)]);
  if (profile.education?.length) rows.push(["Education", profile.education.length === 1 ? shortSchool(profile.education[0]!.institution ?? "") : String(profile.education.length)]);
  if (profile.projects?.length) rows.push(["Projects", String(profile.projects.length)]);
  const skills = profile.skills?.reduce((total, group) => total + group.items.split(",").filter((item) => item.trim()).length, 0) ?? 0;
  if (skills) rows.push(["Skills", String(skills)]);
  return <SheetStep id="use-this">
    <View style={styles.lead}>
      <SheetHeader title="Use this resume?" />
      <Text tone="ink-2">{`What's in ${found.sourceFile.name} replaces those sections. Contact fills in only where yours is empty.`}</Text>
    </View>
    {rows.length > 0 ? <View style={styles.sheetGroup}>
      {rows.map(([title, value], index) => <View key={title} style={[styles.sheetRow, index > 0 && styles.sheetRule]}>
        <Text flex>{title}</Text>
        <Text tone="ink-3">{value}</Text>
      </View>)}
    </View> : null}
    <View style={styles.answers}>
      <Button variant="primary" fullWidth onPress={() => {
        if (found.isCurrent()) onUse(found);
        sheet.close();
      }}>Use this resume</Button>
      <Button variant="text" fullWidth onPress={sheet.close}>Keep mine</Button>
    </View>
  </SheetStep>;
}

// Contact (R4) ----------------------------------------------------------------

export function ContactPage() {
  return <Loaded title="Contact">{(profile) => <ContactForm contact={profile.contact} />}</Loaded>;
}

function ContactForm({ contact }: { contact: ResumeProfile["contact"] }) {
  const { update } = useResumeDraft();
  const set = (key: keyof ResumeProfile["contact"]) => (value: string) => update((profile) => ({ ...profile, contact: { ...profile.contact, [key]: value } }));
  return <YouPage title="Contact">
    <FieldGroup>
      <TextField label="Name" value={contact.name} onChangeText={set("name")} autoCapitalize="words" textContentType="name" />
      <TextField label="Email" value={contact.email} onChangeText={set("email")} keyboardType="email-address" textContentType="emailAddress" />
      <TextField label="Phone" value={contact.phone} onChangeText={set("phone")} keyboardType="phone-pad" textContentType="telephoneNumber" />
      <TextField label="City" value={contact.location} onChangeText={set("location")} autoCapitalize="words" />
    </FieldGroup>
    <FieldGroup label="Links">
      <TextField label="LinkedIn" value={contact.linkedin} onChangeText={set("linkedin")} keyboardType="url" />
      <TextField label="GitHub" value={contact.github} onChangeText={set("github")} keyboardType="url" />
      <TextField label="Website" value={contact.website} onChangeText={set("website")} keyboardType="url" />
    </FieldGroup>
  </YouPage>;
}

// Lists (R1a) -----------------------------------------------------------------

/** An entry in Experience, Education or Projects: the logo's letter, the
 * name, where, and when. */
function EntryRow({ initial, title, line, when, onPress }: { initial: string; title: string; line?: string; when?: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}>
    <View style={styles.entryLogo}><CompanyLogo name={initial || "?"} /></View>
    <View style={styles.entryText}>
      <View style={styles.entryLines}>
        <Text weight="medium" lines={2}>{title}</Text>
        {line ? <Text role="subhead" tone="ink-2" lines={1}>{line}</Text> : null}
        {when ? <Text role="subhead" tone="ink-3">{when}</Text> : null}
      </View>
      <Icon name="disclosure" size={12} tone="ink-4" />
    </View>
  </Pressable>;
}

/** Newest first, by when it started (an ongoing one first of all). */
function byDate<T>(items: T[], start: (item: T) => string, end: (item: T) => string): T[] {
  const key = (item: T) => PRESENT.test(end(item).trim()) ? "9999-99" : monthInputValue(start(item)) || "0000-00";
  return [...items].sort((a, b) => key(b).localeCompare(key(a)));
}

export function ExperienceListPage() {
  return <Loaded title="Experience">{(profile) => {
    const add = () => go({ pathname: "/you/resume-role", params: { id: "new" } });
    return <YouPage title="Experience" bar={<Button fullWidth icon="add" onPress={add}>Add experience</Button>}>
      {profile.experience.length === 0
        ? <EmptyState title="No experience yet" message="Jobs, internships, clubs: anything you'd put on a resume." />
        : <View>{byDate(profile.experience, (entry) => entry.startDate, (entry) => entry.endDate).map((entry) =>
          <EntryRow key={entry.id} initial={entry.company} title={entry.title || "Untitled role"}
            line={[entry.company, entry.location].filter((part) => part.trim()).join(" · ")} when={dateRange(entry.startDate, entry.endDate)}
            onPress={() => go({ pathname: "/you/resume-role", params: { id: entry.id } })} />)}</View>}
    </YouPage>;
  }}</Loaded>;
}

export function EducationListPage() {
  return <Loaded title="Education">{(profile) => {
    const add = () => go({ pathname: "/you/resume-school", params: { id: "new" } });
    return <YouPage title="Education" bar={<Button fullWidth icon="add" onPress={add}>Add a school</Button>}>
      {profile.education.length === 0
        ? <EmptyState title="No schools yet" message="Where you studied, with your degree." />
        : <View>{byDate(profile.education, (entry) => entry.startDate, (entry) => entry.endDate).map((entry) => {
          const credential = entry.credentials[0];
          const degree = [credential?.degreeType ? degreeShort[credential.degreeType] : "", credential?.fieldsOfStudy.filter(Boolean).join(" and ")].filter(Boolean).join(", ");
          return <EntryRow key={entry.id} initial={entry.institution} title={entry.institution || "Untitled school"} line={degree}
            when={dateRange(entry.startDate, entry.endDate)} onPress={() => go({ pathname: "/you/resume-school", params: { id: entry.id } })} />;
        })}</View>}
    </YouPage>;
  }}</Loaded>;
}

export function ProjectListPage() {
  return <Loaded title="Projects">{(profile) => {
    const add = () => go({ pathname: "/you/resume-project", params: { id: "new" } });
    return <YouPage title="Projects" bar={<Button fullWidth icon="add" onPress={add}>Add a project</Button>}>
      {profile.projects.length === 0
        ? <EmptyState title="No projects yet" message="Things you built on your own or with a team." />
        : <View>{byDate(profile.projects, (entry) => entry.date ?? "", () => "").map((entry) =>
          <EntryRow key={entry.id} initial={entry.name} title={entry.name || "Untitled project"} line={entry.role}
            when={formatResumeDate(entry.date ?? "")} onPress={() => go({ pathname: "/you/resume-project", params: { id: entry.id } })} />)}</View>}
    </YouPage>;
  }}</Loaded>;
}

// A record's page -------------------------------------------------------------

type Collection = "experience" | "education" | "projects";

/** The record a page edits; "new" adds a blank one on arrival. */
function useRecord<K extends Collection>(collection: K, blank: () => ResumeProfile[K][number]) {
  const { id: param } = useLocalSearchParams<{ id?: string }>();
  const draft = useResumeDraft();
  const [id] = useState(() => (param && param !== "new" ? param : newId()));
  const created = useRef(param === "new");
  useEffect(() => {
    if (!created.current || !draft.profile) return;
    if ((draft.profile[collection] as { id: string }[]).some((entry) => entry.id === id)) return;
    draft.update((profile) => ({ ...profile, [collection]: [...profile[collection], { ...blank(), id }] }));
  }, [draft.profile, collection, id]);
  useTidyOnLeave();
  const record = (draft.profile?.[collection] as { id: string }[] | undefined)?.find((entry) => entry.id === id) as ResumeProfile[K][number] | undefined;
  const change = (patch: Partial<ResumeProfile[K][number]>) => draft.update((profile) => ({
    ...profile, [collection]: (profile[collection] as { id: string }[]).map((entry) => entry.id === id ? { ...entry, ...patch } : entry),
  }));
  /** Removes it and goes back, with Undo. */
  const remove = (label: string) => {
    const before = draft.profile;
    if (!before) return;
    draft.update((profile) => ({ ...profile, [collection]: (profile[collection] as { id: string }[]).filter((entry) => entry.id !== id) }));
    router.back();
    toast.show({ message: `${label} deleted`, icon: "remove", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => draft.update(() => before) } });
  };
  return { record, change, remove, isNew: created.current, ready: Boolean(draft.profile) };
}

/** Which date wheel is open; one at a time. */
function useOpenWheel() {
  const [open, setOpen] = useState<string | null>(null);
  return { isOpen: (key: string) => open === key, toggle: (key: string) => setOpen((current) => current === key ? null : key) };
}

export function RolePage() {
  const { record, change, remove, isNew } = useRecord("experience", () => ({ id: "", company: "", title: "", location: "", startDate: "", endDate: "", bullets: [] }));
  const wheel = useOpenWheel();
  if (!record) return <YouPage title={isNew ? "New role" : "Role"}>{null}</YouPage>;
  const current = PRESENT.test(record.endDate.trim());
  return <YouPage title={isNew ? "New role" : "Role"}>
    <FieldGroup>
      <TextField label="Title" value={record.title} onChangeText={(title) => change({ title })} autoCapitalize="words" autoFocus={isNew} />
      <TextField label="Company" value={record.company} onChangeText={(company) => change({ company })} autoCapitalize="words" />
      <TextField label="Location" value={record.location} onChangeText={(location) => change({ location })} autoCapitalize="words" />
    </FieldGroup>
    <FieldGroup>
      <MonthRow label="Started" value={monthInputValue(record.startDate)} onChange={(startDate) => change({ startDate })} open={wheel.isOpen("start")} onToggle={() => wheel.toggle("start")} />
      {current ? null : <MonthRow label="Ended" value={monthInputValue(record.endDate)} onChange={(endDate) => change({ endDate })} open={wheel.isOpen("end")} onToggle={() => wheel.toggle("end")} />}
      <SwitchRow label="I work here now" value={current} onChange={(on) => change({ endDate: on ? "Present" : "" })} />
    </FieldGroup>
    <FieldGroup label="What you did">
      <BulletRows items={record.bullets} onChange={(bullets) => change({ bullets })} />
    </FieldGroup>
    {isNew ? null : <DangerRow label="Delete experience" onPress={() => remove("Experience")} />}
  </YouPage>;
}

const degreeShort: Record<DegreeType, string> = {
  high_school: "High school", associate: "Associate's", bachelor: "Bachelor's", master: "Master's",
  doctorate: "Doctorate", professional: "Professional", certificate: "Certificate", other: "Other",
};

export function SchoolPage() {
  const { record, change, remove, isNew } = useRecord("education", () => ({
    id: "", institution: "", credentials: [{ id: newId(), fieldsOfStudy: [""] }], minors: [], location: "", startDate: "", endDate: "", gpa: "",
  }));
  const wheel = useOpenWheel();
  const [secondMajor, setSecondMajor] = useState(false);
  if (!record) return <YouPage title="School">{null}</YouPage>;
  const credential = record.credentials[0] ?? { id: newId(), fieldsOfStudy: [] };
  const fields = credential.fieldsOfStudy;
  const setCredential = (patch: Partial<typeof credential>) => change({ credentials: [{ ...credential, ...patch }, ...record.credentials.slice(1)] });
  const setField = (index: number) => (value: string) => {
    const next = [...fields];
    next[index] = value;
    setCredential({ fieldsOfStudy: next });
  };
  const showSecond = secondMajor || (fields[1]?.trim().length ?? 0) > 0;
  return <YouPage title="School">
    <FieldGroup>
      <TextField label="School" value={record.institution} onChangeText={(institution) => change({ institution })} autoCapitalize="words" autoFocus={isNew} />
      <TextField label="City" value={record.location} onChangeText={(location) => change({ location })} autoCapitalize="words" />
    </FieldGroup>
    <FieldGroup>
      <PickRow label="Degree" value={credential.degreeType ? degreeShort[credential.degreeType] : "Choose"}
        options={(Object.keys(degreeShort) as DegreeType[]).map((type) => ({ id: type, title: degreeShort[type], checked: credential.degreeType === type, onSelect: () => setCredential({ degreeType: type }) }))} />
      <TextField label="Major" value={fields[0] ?? ""} onChangeText={setField(0)} autoCapitalize="words" />
      {showSecond
        ? <TextField label="Second major" value={fields[1] ?? ""} onChangeText={setField(1)} autoCapitalize="words" autoFocus={secondMajor && !fields[1]} />
        : <AddRow label="Add a second major" onPress={() => setSecondMajor(true)} />}
      <TextField label="Minor" value={record.minors[0] ?? ""} onChangeText={(minor) => change({ minors: minor ? [minor, ...record.minors.slice(1)] : record.minors.slice(1) })} autoCapitalize="words" />
    </FieldGroup>
    <FieldGroup>
      <MonthRow label="Started" value={monthInputValue(record.startDate)} onChange={(startDate) => change({ startDate })} open={wheel.isOpen("start")} onToggle={() => wheel.toggle("start")} />
      <MonthRow label="Graduating" value={monthInputValue(record.endDate)} onChange={(endDate) => change({ endDate })} open={wheel.isOpen("end")} onToggle={() => wheel.toggle("end")} />
      <InlineField label="GPA" value={record.gpa ?? ""} onChangeText={(gpa) => change({ gpa })} keyboardType="decimal-pad" />
    </FieldGroup>
    {isNew ? null : <DangerRow label="Delete school" onPress={() => remove("School")} />}
  </YouPage>;
}

export function ProjectPage() {
  const { record, change, remove, isNew } = useRecord("projects", () => ({ id: "", name: "", role: "", url: "", date: "", bullets: [] }));
  const wheel = useOpenWheel();
  if (!record) return <YouPage title="Project">{null}</YouPage>;
  return <YouPage title={isNew ? "New project" : "Project"}>
    <FieldGroup>
      <TextField label="Name" value={record.name} onChangeText={(name) => change({ name })} autoCapitalize="words" autoFocus={isNew} />
      <TextField label="Your role" value={record.role ?? ""} onChangeText={(role) => change({ role })} autoCapitalize="words" />
      <TextField label="Link" value={record.url} onChangeText={(url) => change({ url })} keyboardType="url" />
    </FieldGroup>
    <FieldGroup>
      <MonthRow label="When" value={monthInputValue(record.date ?? "")} onChange={(date) => change({ date })} open={wheel.isOpen("date")} onToggle={() => wheel.toggle("date")} />
    </FieldGroup>
    <FieldGroup label="What you did">
      <BulletRows items={record.bullets} onChange={(bullets) => change({ bullets })} />
    </FieldGroup>
    {isNew ? null : <DangerRow label="Delete project" onPress={() => remove("Project")} />}
  </YouPage>;
}

/** A row whose value opens the iPhone's menu in place (Degree). */
function PickRow({ label, value, options }: { label: string; value: string; options: { id: string; title: string; checked: boolean; onSelect: () => void }[] }) {
  return <View style={styles.pickRow}>
    <Text flex>{label}</Text>
    <Menu title="" items={options}>
      <View style={styles.pickValue} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`}>
        <Text tone="ink-3">{value}</Text>
        <Icon name="pick" size={12} tone="ink-4" />
      </View>
    </Menu>
  </View>;
}

// Skills (R6) and Certifications and awards -----------------------------------

const splitItems = (items: string) => items.split(",").map((item) => item.trim()).filter(Boolean);

/** Tags: filled, since they aren't filters (owner, 2026-10-15, Q9). Tapping
 * one offers to remove it. */
function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityHint="Removes it" onPress={() => Alert.alert(label, undefined, [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: onRemove },
  ])} style={({ pressed }) => [styles.tag, pressed && styles.entryPressed]}>
    <Text role="subhead">{label}</Text>
  </Pressable>;
}

/** The dashed Add chip (owner, 2026-10-14): 1.5 ink-4, 5 on and 4 off. */
function AddTag({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={onPress} style={({ pressed }) => [styles.tag, styles.addTag, pressed && styles.entryPressed]}>
    <Icon name="add" size={14} tone="ink-3" />
    <Text role="subhead" tone="ink-3">Add</Text>
  </Pressable>;
}

function TagGroup({ title, tags, onAdd, onRemove }: { title: string; tags: string[]; onAdd: () => void; onRemove: (index: number) => void }) {
  return <View style={styles.tagGroup}>
    <Text role="footnote" weight="medium" tone="ink-2">{title}</Text>
    <View style={styles.tags}>
      {tags.map((tag, index) => <Tag key={`${tag}-${index}`} label={tag} onRemove={() => onRemove(index)} />)}
      <AddTag onPress={onAdd} />
    </View>
  </View>;
}

export function SkillsPage() {
  return <Loaded title="Skills">{(profile) => <Skills skills={profile.skills} />}</Loaded>;
}

function Skills({ skills }: { skills: ResumeProfile["skills"] }) {
  const { update } = useResumeDraft();
  const setGroup = (index: number, items: string[]) => update((profile) => ({
    ...profile, skills: profile.skills.map((group, at) => at === index ? { ...group, items: items.join(", ") } : group),
  }));
  const addTo = (index: number) => Alert.prompt(`Add to ${skills[index]?.category || "skills"}`, "Separate several with commas.", (text) => {
    const added = splitItems(text ?? "");
    if (added.length) setGroup(index, [...splitItems(skills[index]?.items ?? ""), ...added]);
  });
  const addGroup = () => Alert.prompt("Name the group", "Languages, Frameworks, Tools…", (name) => {
    const category = name?.trim();
    if (category) update((profile) => ({ ...profile, skills: [...profile.skills, { category, items: "" }] }));
  });
  return <YouPage title="Skills" bar={<Button fullWidth icon="add" onPress={addGroup}>Add a group</Button>}>
    {skills.length === 0 ? <EmptyState title="No skills yet" message="Group them: languages, frameworks, tools." /> : null}
    {skills.map((group, index) => <TagGroup key={index} title={group.category || "Skills"} tags={splitItems(group.items)}
      onAdd={() => addTo(index)} onRemove={(at) => setGroup(index, splitItems(group.items).filter((_, position) => position !== at))} />)}
  </YouPage>;
}

const MORE_KINDS: OptionalSectionKind[] = ["certifications", "awards", "leadership", "publications", "volunteer"];

export function MorePage() {
  return <Loaded title="Certifications and awards">{(profile) => <More sections={profile.optionalSections} />}</Loaded>;
}

/** Certifications and awards follow Skills: a group per kind, each item a tag. */
function More({ sections }: { sections: ResumeProfile["optionalSections"] }) {
  const { update } = useResumeDraft();
  const shown = MORE_KINDS.filter((kind) => kind === "certifications" || kind === "awards" || sections.some((section) => section.kind === kind));
  const itemsOf = (kind: OptionalSectionKind) => sections.find((section) => section.kind === kind)?.items ?? [];
  const setItems = (kind: OptionalSectionKind, items: { category: string; items: string }[]) => update((profile) => {
    const rest = profile.optionalSections.filter((section) => section.kind !== kind);
    return { ...profile, optionalSections: items.length ? [...rest, { kind, items }] : rest };
  });
  const add = (kind: OptionalSectionKind) => Alert.prompt(`Add to ${optionalNames[kind]}`, undefined, (text) => {
    const title = text?.trim();
    if (title) setItems(kind, [...itemsOf(kind), { category: title, items: "" }]);
  });
  const others = MORE_KINDS.filter((kind) => !shown.includes(kind));
  const addGroup = () => Alert.alert("Add a group", undefined, [
    ...others.map((kind) => ({ text: optionalNames[kind], onPress: () => add(kind) })),
    { text: "Cancel", style: "cancel" as const },
  ]);
  return <YouPage title="Certifications and awards" bar={others.length ? <Button fullWidth icon="add" onPress={addGroup}>Add a group</Button> : undefined}>
    {shown.map((kind) => <TagGroup key={kind} title={optionalNames[kind]} tags={itemsOf(kind).map((item) => item.category)}
      onAdd={() => add(kind)} onRemove={(at) => setItems(kind, itemsOf(kind).filter((_, position) => position !== at))} />)}
  </YouPage>;
}

const styles = StyleSheet.create((theme) => ({
  slot: { paddingHorizontal: theme.ui.size.gutter },
  saveFailed: { flexDirection: "row", gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter + theme.ui.space["4"] },
  lead: { gap: theme.ui.space["2"] },
  answers: { gap: theme.ui.space["2"] },
  track: { height: 6, borderRadius: 3, backgroundColor: theme.ui.color.fill, overflow: "hidden" },
  fillBar: { height: 6, borderRadius: 3, backgroundColor: theme.ui.color.ink },
  sheetGroup: { paddingHorizontal: theme.ui.space["4"], borderRadius: SHEET_GROUP_RADIUS, borderCurve: "continuous", backgroundColor: theme.ui.color["sheet-group"] },
  sheetRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  sheetRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator },
  entry: { flexDirection: "row", alignItems: "flex-start" },
  entryPressed: { opacity: 0.6 },
  entryLogo: { width: theme.ui.size.keyline, paddingLeft: theme.ui.size.gutter, paddingTop: theme.ui.space["3"] },
  entryText: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"],
    paddingVertical: theme.ui.space["3"], paddingRight: theme.ui.size.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.ui.color.separator,
  },
  entryLines: { flex: 1, gap: 0 },
  pickRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  pickValue: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], minHeight: 44 },
  tagGroup: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: theme.ui.space["2"] },
  tag: {
    height: 32, flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"],
    paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color.fill,
  },
  addTag: { backgroundColor: "transparent", borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.ui.color["ink-4"], paddingHorizontal: theme.ui.space["3"] },
}));
