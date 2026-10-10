import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BellRinging, CaretLeft, Check } from "@phosphor-icons/react";
import { normalizeSearchProfile, ONBOARDING_VERSION } from "@pinkslip/domain/search-profile";
import { useApi, usePreferences, useUpdatePreferences, useUpdatePushSettings } from "@pinkslip/data";
import { Alert, Button, IconButton, Progress, Stack, Text, toast } from "../../kit";
import { enablePush, readPushStatus, type PushStatus } from "../alerts/push";
import { MetroField, RoleField, StageField, WorkFields } from "../preferences/ProfileFields";
import type { Profile } from "../preferences/profile";
import { PageFailure, PageLoading } from "../states/LoadStates";
import { BrandMark } from "../shell/BrandMark";
import styles from "./Onboarding.module.css";

const STEPS = 3;

/** Onboarding, rebuilt (port plan 4.7): only what changes your matches, one
 * short step at a time, then alerts. No helper text. It never blocks
 * browsing: the feed offers it until it's done, and finishing (or saving the
 * search on step 2) is what starts a visitor's guest session. A skippable
 * resume step joins when resume import lands (4.10). */
export function Onboarding() {
  const preferences = usePreferences();
  if (preferences.isPending) return <PageLoading label="Loading" />;
  if (preferences.isError) return <PageFailure title="Setup didn't load" onRetry={() => void preferences.refetch()} retrying={preferences.isFetching} />;
  return <Steps initial={normalizeSearchProfile(preferences.data.search_profile)} />;
}

function Steps({ initial }: { initial: Profile }) {
  const api = useApi();
  const navigate = useNavigate();
  const save = useUpdatePreferences();
  const updatePush = useUpdatePushSettings();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(initial);
  const [push, setPush] = useState<PushStatus | "error" | null>(null);
  const [enabling, setEnabling] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  const change = (patch: Partial<Profile>) => setProfile((current) => ({ ...current, ...patch }));
  const event = (name: string, properties: Record<string, string | number | boolean> = {}) =>
    void api.interactions.event({ event_name: name, entity_type: "onboarding", properties: { onboarding_version: ONBOARDING_VERSION, ...properties } })
      .catch(() => undefined);

  useEffect(() => { void readPushStatus().then((status) => { if (status === "enabled") setPush("enabled"); }); }, []);
  // Each step starts at the top with its title focused for screen readers.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (step > 1) heading.current?.focus();
  }, [step]);

  const next = async () => {
    if (step === 1) {
      if (!started.current) {
        started.current = true;
        event("onboarding_started");
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      try {
        const saved = await save.mutateAsync({ search_profile: profile });
        setProfile(normalizeSearchProfile(saved.search_profile));
        setStep(3);
      } catch {
        toast.error("Couldn't save your search. Try again.");
      }
      return;
    }
    try {
      await save.mutateAsync({ search_profile: {
        ...profile,
        notifications_enabled: push === "enabled",
        onboarding_version: ONBOARDING_VERSION,
        onboarding_completed_at: new Date().toISOString(),
      } });
      event("onboarding_completed", { notifications_enabled: push === "enabled" });
      void navigate({ to: "/" });
    } catch {
      toast.error("Couldn't finish setup. Try again.");
    }
  };

  const turnOnAlerts = async () => {
    setEnabling(true);
    try {
      const result = await enablePush(api);
      setPush(result);
      if (result === "enabled") await updatePush.mutateAsync(true);
    } catch {
      setPush("error");
    } finally {
      setEnabling(false);
    }
  };

  return <div className={styles.root}>
    <header className={styles.header}>
      <div className={styles.headerRow}>
        <span className={styles.back}>
          {step > 1 && <IconButton icon={CaretLeft} label="Back" iconSize={22} onClick={() => setStep(step - 1)} />}
        </span>
        <BrandMark size={28} />
        <span className={styles.back} />
      </div>
      <Progress label="Setup progress" variant="steps" value={step} max={STEPS} valueText={`Step ${step} of ${STEPS}`} />
    </header>

    <main id="main" tabIndex={-1} className={styles.body}>
      <section key={step} className={styles.step} aria-labelledby="onboarding-title">
        {step === 1 && <Stack gap="6">
          <h1 ref={heading} tabIndex={-1} id="onboarding-title" className={styles.title}>What are you looking for?</h1>
          <StageField profile={profile} onChange={change} />
          <RoleField profile={profile} onChange={change} />
        </Stack>}
        {step === 2 && <Stack gap="6">
          <h1 ref={heading} tabIndex={-1} id="onboarding-title" className={styles.title}>Where can you work?</h1>
          <WorkFields profile={profile} onChange={change} />
          <MetroField profile={profile} onChange={change} />
        </Stack>}
        {step === 3 && <Stack gap="6">
          <h1 ref={heading} tabIndex={-1} id="onboarding-title" className={styles.title}>Hear about new jobs first</h1>
          <Text tone="ink-2">We’ll send an alert when a new posting fits your search.</Text>
          {push === "enabled"
            ? <p className={styles.done}><Check size={18} weight="bold" aria-hidden /> Alerts are on for this device</p>
            : push === "requires-install"
              ? <Alert tone="warning">On iPhone, add Pinkslip to your Home Screen first (Share, then Add to Home Screen). You can turn alerts on later in You.</Alert>
              : push === "denied" || push === "unsupported"
                ? <Alert tone="warning">Alerts aren’t available in this browser right now. You can turn them on later in You.</Alert>
                : <Button variant="secondary" fullWidth icon={BellRinging} pending={enabling} onClick={() => void turnOnAlerts()}>Turn on alerts</Button>}
          {push === "error" && <Alert tone="error">Couldn’t turn on alerts. Try again, or later in You.</Alert>}
        </Stack>}
      </section>
    </main>

    <footer className={styles.footer}>
      <Button variant="primary" fullWidth pending={save.isPending} disabled={enabling} onClick={() => void next()}>
        {step === STEPS ? "Show my jobs" : "Continue"}
      </Button>
      {step === 1 && <Button variant="secondary" fullWidth onClick={() => void navigate({ to: "/" })}>Not now</Button>}
    </footer>
  </div>;
}
