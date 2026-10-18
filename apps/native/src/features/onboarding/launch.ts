import { storage } from "../../platform/storage";

/** Whether this phone ran the app before this launch. Read when the app
 * starts, before anything this launch writes (the root layout imports it). */
export const appRanBefore = storage.getAllKeys().length > 0;

const STARTED = "onboarding.started";
const DONE = "onboarding.done";

// A new install starts onboarding, and keeps it until it's finished: quit
// halfway and it starts again from the hook. Anyone who had the app before
// is set up already.
if (!appRanBefore) storage.set(STARTED, true);

/** Onboarding plays at launch: a new install that hasn't finished it. */
export function onboardingDue(): boolean {
  return storage.getBoolean(STARTED) === true && storage.getBoolean(DONE) !== true;
}

export function finishOnboarding() {
  storage.set(DONE, true);
}

const replays = new Set<(saves: boolean) => void>();

/** The kit's replay of the whole flow over Jobs. It saves nothing, or with
 * `saves` it saves the answers to your search as a new install does, so the
 * feed changes behind the questions. */
export function replayOnboarding(saves = false) {
  for (const listener of replays) listener(saves);
}

export function onReplayOnboarding(listener: (saves: boolean) => void): () => void {
  replays.add(listener);
  return () => {
    replays.delete(listener);
  };
}
