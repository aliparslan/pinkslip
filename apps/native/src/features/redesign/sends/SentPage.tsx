import type { ApplySend, SentAnswer } from "@pinkslip/core/api";
import { useApi, useApplySend } from "@pinkslip/data";
import { useQuery } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { router, Stack, useIsFocused, useSegments } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, EmptyState, Icon, PageBar, Text, useTabBarStepsAside } from "../../../ui";
import { BAR, ErrorPage, TOP_BAR, usePinnedBarToastLift } from "../JobPage";
import { answerSource, splitResume } from "../send-facts";

/** The answers shown before "All n answers" opens the rest. */
const FIRST_ANSWERS = 4;

type Shot = "form" | "confirmation";

interface ProofStep {
  label: string;
  when: string | null;
  /** The picture it opens. */
  shot?: Shot;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayAndTime = (iso: string) => `${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time(iso)}`;

/** Proof as a quiet log, newest first (W3): what confirmed it, then the send
 * itself, which opens the filled form as it went. */
function proofSteps(send: ApplySend): ProofStep[] {
  const sentAt = send.finished_at ?? send.created_at;
  const sent: ProofStep = { label: "Sent by Pinkslip", when: dayAndTime(sentAt), shot: send.form_shot ? "form" : undefined };
  if (send.status === "submitted") {
    return [{ label: "Thank-you page", when: time(sentAt), shot: send.proof_shot ? "confirmation" : undefined }, sent];
  }
  return [{ label: `Waiting for ${send.company ?? "the company"}`, when: null }, sent];
}

/**
 * What Pinkslip sent (W3, picked Oct 15; Paper "Send screens · Oct 24", S5
 * and S6). After a send: proof, the resume, then each answer with its
 * question small above it, and a line under the ones the person didn't
 * give. After Check first it's "Ready to send", without proof, and Send is
 * pinned at the bottom.
 */
export function SentView({ send, onSend, sending, onShot }: {
  send: ApplySend;
  /** Check first's Send to {company}. */
  onSend?: () => void;
  sending?: boolean;
  onShot?: (shot: Shot) => void;
}) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  // A page of its own over the job: the tab bar stays aside, as on the job.
  useTabBarStepsAside(useIsFocused());
  const [all, setAll] = useState(false);
  const ready = send.status === "ready";
  const wentOut = send.status === "submitted" || send.status === "unconfirmed";
  const { resume, answers } = splitResume(send.sent);
  const shown = all ? answers : answers.slice(0, FIRST_ANSWERS);
  const company = send.company ?? "the company";
  const pinned = ready && onSend;
  return <View style={styles.fill}>
    <ScrollView style={styles.fill} contentContainerStyle={[styles.page, {
      paddingTop: insets.top + TOP_BAR + theme.ui.space["2"],
      paddingBottom: (pinned ? BAR : 0) + insets.bottom + theme.ui.space["8"],
    }]}>
      <View style={styles.head}>
        <Text role="largeTitle" accessibilityRole="header">{ready ? "Ready to send" : "What Pinkslip sent"}</Text>
        <Text role="subhead" tone="ink-2">{[send.company, send.title].filter(Boolean).join(" · ")}</Text>
      </View>
      {wentOut ? <View style={styles.block}>
        <Text role="footnote" weight="medium" tone="ink-2">Proof</Text>
        <View>
          {proofSteps(send).map((step, index, steps) => <Pressable key={step.label} disabled={!step.shot || !onShot}
            onPress={() => step.shot && onShot?.(step.shot)} accessibilityRole={step.shot ? "button" : undefined}
            style={({ pressed }) => [styles.proof, pressed && styles.pressed]}>
            <View style={styles.rail}>
              <View style={[styles.dot, index === 0 && styles.dotNow]} />
              {index < steps.length - 1 ? <View style={styles.railLine} /> : null}
            </View>
            <Text weight={index === 0 ? "medium" : "regular"} tone={index === 0 ? "ink" : "ink-2"} flex>{step.label}</Text>
            {step.when ? <Text role="subhead" tone="ink-3">{step.when}</Text> : null}
            <View style={styles.chevron}>{step.shot && onShot ? <Icon name="disclosure" size={12} tone="ink-4" /> : null}</View>
          </Pressable>)}
        </View>
      </View> : null}
      {resume ? <View style={styles.block}>
        <Text role="footnote" weight="medium" tone="ink-2">Resume</Text>
        <View style={styles.file}>
          <View style={styles.fileIcon}><Icon name="resume" size={20} tone="ink-2" /></View>
          <Text flex lines={1}>{resume.value}</Text>
        </View>
      </View> : null}
      {answers.length > 0 ? <View style={styles.block}>
        <Text role="footnote" weight="medium" tone="ink-2">Answers</Text>
        <View>
          {shown.map((answer, index) => <Answer key={`${answer.label}-${index}`} answer={answer} ats={send.ats} />)}
          {!all && answers.length > FIRST_ANSWERS ? <Pressable onPress={() => setAll(true)} accessibilityRole="button"
            style={({ pressed }) => [styles.allAnswers, pressed && styles.pressed]}>
            <Text role="subhead" weight="medium" tone="ink-2" flex>{`All ${answers.length} answers`}</Text>
            <Icon name="disclosure" size={12} tone="ink-4" />
          </Pressable> : null}
        </View>
      </View> : null}
    </ScrollView>
    <PageBar />
    {pinned ? <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.ui.space["4"]) }]}>
      <Button variant="primary" fullWidth pending={sending} onPress={onSend}>{`Send to ${company}`}</Button>
    </View> : null}
  </View>;
}

function Answer({ answer, ats }: { answer: SentAnswer; ats: ApplySend["ats"] }) {
  const source = answerSource(answer, ats);
  return <View style={styles.answer}>
    <Text role="subhead" tone="ink-3">{answer.label}</Text>
    <Text>{answer.value}</Text>
    {source ? <Text role="footnote" tone="ink-3">{source}</Text> : null}
  </View>;
}

/** The send's own page (`sends/[sendId]`): what it sent, or, after Check
 * first, what it would send, with Send to {company} pinned. */
export function SendScreen({ sendId, onSend, sending }: { sendId: string; onSend?: (send: ApplySend) => void; sending?: boolean }) {
  usePinnedBarToastLift();
  const send = useApplySend(sendId);
  const tab = (useSegments() as readonly string[])[1] ?? "(jobs)";
  if (!send.data) {
    return send.isPending ? <ErrorPage><ActivityIndicator /></ErrorPage>
      : <ErrorPage><EmptyState title="This didn't load" message="Check your connection and try again."
        action={{ label: "Try again", variant: "secondary", onPress: () => void send.refetch() }} /></ErrorPage>;
  }
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <SentView send={send.data} sending={sending} onSend={onSend ? () => onSend(send.data!) : undefined}
      onShot={(shot) => router.push({ pathname: `/(tabs)/${tab}/sends/[sendId]/[shot]` as "/(tabs)/(jobs)/sends/[sendId]/[shot]", params: { sendId, shot } })} />
  </>;
}

/** A send's picture, kept on the phone once fetched: the session reads it,
 * so it's saved to the cache and shown from there. */
function useShotFile(sendId: string, shot: Shot) {
  const api = useApi();
  return useQuery({
    queryKey: ["personal", "sends", sendId, "shot", shot],
    queryFn: async () => {
      const file = new File(Paths.cache, `send-${sendId}-${shot}.jpg`);
      if (!file.exists) file.write(new Uint8Array(await (await api.apply.sendShot(sendId, shot)).arrayBuffer()));
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => Image.getSize(file.uri, (width, height) => resolve({ width, height }), reject));
      return { uri: file.uri, ...size };
    },
    staleTime: Infinity,
  });
}

/** The filled form, or the thank-you page, as Pinkslip's browser saw it:
 * full width, scrolling, since a form can be tall. */
export function ShotScreen({ sendId, shot }: { sendId: string; shot: Shot }) {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const picture = useShotFile(sendId, shot);
  return <View style={styles.fill}>
    <Stack.Screen options={{ headerShown: false }} />
    {picture.data ? <ScrollView style={styles.fill} contentContainerStyle={{ paddingTop: insets.top + TOP_BAR + theme.ui.space["2"], paddingBottom: insets.bottom + theme.ui.space["6"] }}>
      <View style={styles.head}>
        <Text role="largeTitle" accessibilityRole="header">{shot === "form" ? "The filled form" : "Thank-you page"}</Text>
      </View>
      <Image source={{ uri: picture.data.uri }} accessibilityLabel={shot === "form" ? "The form as Pinkslip filled it" : "The page after Submit"}
        style={[styles.shot, { aspectRatio: picture.data.width / Math.max(picture.data.height, 1) }]} resizeMode="contain" />
    </ScrollView> : <View style={styles.center}>
      {picture.isError ? <EmptyState title="The picture didn't load" message="Check your connection and try again."
        action={{ label: "Try again", variant: "secondary", onPress: () => void picture.refetch() }} /> : <ActivityIndicator />}
    </View>}
    <PageBar />
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  page: { gap: theme.ui.space["6"], paddingHorizontal: theme.ui.size.gutter },
  head: { gap: theme.ui.space["1"], paddingHorizontal: 0 },
  block: { gap: theme.ui.space["2"] },
  proof: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  rail: { width: 8, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.ui.color["ink-4"] },
  dotNow: { backgroundColor: theme.ui.color.ink },
  railLine: { position: "absolute", top: 26, bottom: -22, width: 1.5, backgroundColor: theme.ui.color["ink-4"] },
  // A value with no chevron keeps the chevron's 12 space, so times line up.
  chevron: { width: 12, alignItems: "flex-end" },
  file: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["1"] },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  answer: { gap: 2, paddingVertical: theme.ui.space["3"], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.ui.color.separator },
  allAnswers: { minHeight: 44, flexDirection: "row", alignItems: "center" },
  pressed: { opacity: 0.6 },
  shot: { width: "100%", marginTop: theme.ui.space["4"], borderRadius: theme.ui.radius.md, backgroundColor: theme.ui.color.fill },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: theme.ui.space["3"],
    paddingHorizontal: theme.ui.size.gutter,
    backgroundColor: theme.ui.color.bg,
  },
}));
