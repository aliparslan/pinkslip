import { applyImport, importSummary } from "@pinkslip/core/resume-import-apply";
import type { Profile } from "@pinkslip/core/profile-fields";
import { normalizeResumeProfile } from "@pinkslip/domain/resume-profile";
import { normalizeSearchProfile, ONBOARDING_VERSION } from "@pinkslip/domain/search-profile";
import { useApi, usePreferences, useSaveResume, useUpdatePreferences, useUpdatePushSettings } from "@pinkslip/data";
import { router } from "expo-router";
import { BellRinging, CaretLeft, Check, UploadSimple, WarningCircle } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, EmptyState, Heading, IconButton, Spinner, Stack, Text, toast } from "../../kit";
import { haptics } from "../../platform/haptics";
import { devicePushStatus, enableDevicePush, type DevicePushStatus } from "../../platform/push";
import { MetroField, RoleField, StageField, WorkFields } from "../preferences/ProfileFields";
import { pickAndImportResume, ResumeImportFailure } from "../resume/import";

const STEPS = 4;

/** Onboarding (port plan 4.7), full screen: what you're looking for, where,
 * a skippable resume, then alerts. Keeps the version/completion stamp and
 * the started/completed events. Never blocks browsing ("Not now"). */
export function Onboarding() {
  const preferences = usePreferences();
  if (preferences.isPending) return <View style={styles.center}><Spinner label="Loading" /></View>;
  if (preferences.isError) {
    return <View style={styles.center}><EmptyState icon={WarningCircle} title="Setup didn't load" actions={<Button onPress={() => void preferences.refetch()}>Try again</Button>} /></View>;
  }
  return <Steps initial={normalizeSearchProfile(preferences.data.search_profile)} />;
}

function Steps({ initial }: { initial: Profile }) {
  const { theme } = useUnistyles();
  const api = useApi();
  const save = useUpdatePreferences();
  const updatePush = useUpdatePushSettings();
  const saveResume = useSaveResume();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(initial);
  const [push, setPush] = useState<DevicePushStatus | "error" | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [resume, setResume] = useState<{ state: "idle" | "importing" } | { state: "done"; summary: string } | { state: "error"; message: string }>({ state: "idle" });
  const started = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const change = (patch: Partial<Profile>) => setProfile((current) => ({ ...current, ...patch }));
  const event = (name: string, properties: Record<string, string | number | boolean> = {}) =>
    void api.interactions.event({ event_name: name, entity_type: "onboarding", properties: { onboarding_version: ONBOARDING_VERSION, ...properties } }).catch(() => undefined);

  useEffect(() => { void devicePushStatus().then((status) => { if (status === "enabled") setPush("enabled"); }); }, []);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const next = async () => {
    if (step === 1) {
      if (!started.current) { started.current = true; event("onboarding_started"); }
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
    if (step === 3) { setStep(4); return; }
    try {
      await save.mutateAsync({ search_profile: { ...profile, notifications_enabled: push === "enabled", onboarding_version: ONBOARDING_VERSION, onboarding_completed_at: new Date().toISOString() } });
      event("onboarding_completed", { notifications_enabled: push === "enabled" });
      haptics.success();
      leave();
    } catch {
      toast.error("Couldn't finish setup. Try again.");
    }
  };

  const importFile = async () => {
    setResume({ state: "importing" });
    try {
      const imported = await pickAndImportResume(api);
      if (!imported) { setResume({ state: "idle" }); return; }
      const current = normalizeResumeProfile((await api.profile.get()).data);
      await saveResume.mutateAsync(applyImport(current, imported.profile, normalizeResumeProfile));
      setResume({ state: "done", summary: importSummary(imported.profile) || "Contact details" });
    } catch (error) {
      setResume({ state: "error", message: error instanceof ResumeImportFailure ? error.message : "Couldn't import that resume. Try again." });
    }
  };

  const turnOnAlerts = async () => {
    setEnabling(true);
    try {
      const result = await enableDevicePush(api);
      setPush(result);
      if (result === "enabled") await updatePush.mutateAsync(true);
    } catch {
      setPush("error");
    } finally {
      setEnabling(false);
    }
  };

  const titles = ["What are you looking for?", "Where can you work?", "Add your resume", "Hear about new jobs first"];
  return <View style={styles.root}>
    <View style={styles.header}>
      <View style={styles.back}>{step > 1 && <IconButton icon={CaretLeft} label="Back" onPress={() => setStep(step - 1)} />}</View>
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS, now: step, text: `Step ${step} of ${STEPS}` }}>
        {Array.from({ length: STEPS }, (_, index) => <View key={index} style={[styles.segment, index < step && styles.segmentOn]} />)}
      </View>
      <View style={styles.back} />
    </View>
    <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardDismissMode="interactive">
      <Animated.View key={step} entering={FadeIn.duration(220)}>
        <Stack gap="6">
          <Heading variant="display-lg">{titles[step - 1]}</Heading>
          {step === 1 && <><StageField profile={profile} onChange={change} /><RoleField profile={profile} onChange={change} /></>}
          {step === 2 && <><WorkFields profile={profile} onChange={change} /><MetroField profile={profile} onChange={change} /></>}
          {step === 3 && <>
            <Text tone="ink-2">It fills in applications for you. You can skip this and add it later.</Text>
            {resume.state === "done" ? <View style={styles.done}><Check size={18} weight="bold" color={theme.colors.good} /><Text tone="good">Imported {resume.summary}</Text></View>
              : <Button fullWidth icon={UploadSimple} pending={resume.state === "importing"} onPress={() => void importFile()}>{resume.state === "importing" ? "Reading your resume…" : "Import from PDF"}</Button>}
            {resume.state === "error" && <Text tone="bad">{resume.message}</Text>}
          </>}
          {step === 4 && <>
            <Text tone="ink-2">We'll send an alert when a new posting fits your search.</Text>
            {push === "enabled" ? <View style={styles.done}><Check size={18} weight="bold" color={theme.colors.good} /><Text tone="good">Alerts are on for this iPhone</Text></View>
              : push === "denied" || push === "unsupported" ? <Text tone="warn">Alerts are off for Pinkslip in Settings. You can turn them on later in You.</Text>
              : <Button fullWidth icon={BellRinging} pending={enabling} onPress={() => void turnOnAlerts()}>Turn on alerts</Button>}
            {push === "error" && <Text tone="bad">Couldn't turn on alerts. Try again, or later in You.</Text>}
          </>}
        </Stack>
      </Animated.View>
    </ScrollView>
    <View style={styles.footer}>
      <Button variant="primary" fullWidth pending={save.isPending} disabled={enabling || resume.state === "importing"} onPress={() => void next()}>
        {step === STEPS ? "Show my jobs" : step === 3 && resume.state !== "done" ? "Skip for now" : "Continue"}
      </Button>
      {step === 1 && <Button fullWidth onPress={leave}>Not now</Button>}
    </View>
  </View>;
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: rt.insets.top },
  center: { flex: 1, justifyContent: "center", backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space["2"], height: 56 },
  back: { width: 44 },
  progress: { flex: 1, flexDirection: "row", gap: theme.space["1"], paddingHorizontal: theme.space["2"] },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors["control-bg"] },
  segmentOn: { backgroundColor: theme.colors.accent },
  body: { padding: theme.gutter, paddingTop: theme.space["4"], paddingBottom: theme.space["10"] },
  done: { flexDirection: "row", alignItems: "center", gap: theme.space["2"] },
  footer: { gap: theme.space["2"], paddingHorizontal: theme.gutter, paddingTop: theme.space["3"], paddingBottom: rt.insets.bottom + theme.space["2"] },
}));
