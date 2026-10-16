import type { ResumeProfile } from "@pinkslip/core/api";
import { hasResumeContent } from "@pinkslip/core/resume-fields";
import { normalizeResumeProfile } from "@pinkslip/domain/resume-profile";
import { useResumeProfile, useSaveResume, type SavePhase } from "@pinkslip/data";
import { useEffect, useSyncExternalStore } from "react";

/**
 * One resume, edited across its pages (Resume, Experience, a role, School,
 * Skills…). Each page reads and changes this draft; it saves a moment after
 * you stop typing, one save at a time, and a failure keeps your words and
 * says so on the Resume page.
 */

/** Drops records left empty (a new role you backed out of). */
export function tidyResume(profile: ResumeProfile): ResumeProfile {
  return {
    ...profile,
    experience: profile.experience.filter((entry) => hasResumeContent(entry)).map((entry) => ({ ...entry, bullets: entry.bullets.filter((line) => line.trim()) })),
    education: profile.education.filter((entry) => hasResumeContent(entry)),
    projects: profile.projects.filter((entry) => hasResumeContent(entry)).map((entry) => ({ ...entry, bullets: entry.bullets.filter((line) => line.trim()) })),
    skills: profile.skills.filter((entry) => entry.category.trim() || entry.items.trim()),
    optionalSections: profile.optionalSections.filter((section) => hasResumeContent(section)),
  };
}

interface DraftState {
  profile: ResumeProfile | null;
  phase: SavePhase;
}

let state: DraftState = { profile: null, phase: "clean" };
const listeners = new Set<() => void>();
function set(next: Partial<DraftState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

const DELAY = 800;
let timer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let send: ((profile: ResumeProfile) => Promise<unknown>) | null = null;
let savedKey: string | null = null;
/** The kit's sample: edited here, never saved. */
let sample = false;

/** Opens the editors on a sample resume that's never saved (the kit). */
export function startResumeSample(profile: ResumeProfile) {
  sample = true;
  savedKey = JSON.stringify(tidyResume(profile));
  set({ profile, phase: "clean" });
}

/** Back to your own resume once the sample's Resume page closes. */
export function endResumeSample() {
  if (!sample) return;
  sample = false;
  savedKey = null;
  set({ profile: null, phase: "clean" });
}

async function flush(): Promise<void> {
  if (sample) {
    set({ phase: "saved" });
    return;
  }
  if (saving || !state.profile || !send) return;
  const sending = tidyResume(state.profile);
  const key = JSON.stringify(sending);
  if (key === savedKey) {
    set({ phase: "saved" });
    return;
  }
  saving = true;
  set({ phase: "saving" });
  try {
    await send(sending);
    savedKey = key;
    saving = false;
    // Typed during the save: save again.
    if (JSON.stringify(tidyResume(state.profile)) !== key) await flush();
    else set({ phase: "saved" });
  } catch {
    saving = false;
    set({ phase: "error" });
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, DELAY);
}

/** Saves what's pending now: leaving the editor, or Retry. */
export function saveResumeNow() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  void flush();
}

/** The draft, and a way to change it. Null while the resume loads. */
export function useResumeDraft() {
  const resume = useResumeProfile();
  const save = useSaveResume();
  send = save.mutateAsync;
  const draft = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    // The first load seeds the draft; later loads replace it only while
    // nothing is waiting to be saved.
    if (sample || !resume.data || timer || saving) return;
    const loaded = tidyResume(normalizeResumeProfile(resume.data.data));
    const key = JSON.stringify(loaded);
    if (state.profile && savedKey === key) return;
    savedKey = key;
    set({ profile: loaded, phase: "clean" });
  }, [resume.data]);
  const update = (change: (profile: ResumeProfile) => ResumeProfile) => {
    if (!state.profile) return;
    set({ profile: change(state.profile), phase: "dirty" });
    schedule();
  };
  /** Replaces the whole resume at once (an import, Clear): saved now. */
  const replace = (profile: ResumeProfile) => {
    set({ profile, phase: "dirty" });
    saveResumeNow();
  };
  return { profile: draft.profile, phase: draft.phase, update, replace, loading: resume.isPending, failed: resume.isError && !draft.profile, retry: () => void resume.refetch() };
}

/** Leaving a record's page drops what was left empty, so the saved resume
 * never carries a blank role. */
export function useTidyOnLeave() {
  useEffect(() => () => {
    if (!state.profile) return;
    const tidied = tidyResume(state.profile);
    if (JSON.stringify(tidied) !== JSON.stringify(state.profile)) {
      set({ profile: tidied });
      schedule();
    }
  }, []);
}
