import { router } from "expo-router";
import { useEffect, useState } from "react";
import { finishOnboarding, onboardingDue, onReplayOnboarding } from "./launch";
import { Welcome } from "./Welcome";

interface Run {
  /** A new install's own run, which counts; not the kit's replay. */
  real: boolean;
  saves: boolean;
}

/** Onboarding over Jobs at a new install's first launch (and until it's
 * finished), or the kit's replay of it. */
export function OnboardingOnLaunch() {
  const [run, setRun] = useState<Run | null>(() => (onboardingDue() ? { real: true, saves: true } : null));
  const [replays, setReplays] = useState(0);
  useEffect(() => onReplayOnboarding((saves) => {
    setRun({ real: false, saves });
    setReplays((count) => count + 1);
  }), []);
  if (!run) return null;
  const done = () => {
    if (run.real) finishOnboarding();
    setRun(null);
  };
  const account = () => {
    done();
    if (run.real) router.push("/you/account");
  };
  return <Welcome key={replays} saves={run.saves} counts={run.real} onDone={done} onAccount={account} />;
}
