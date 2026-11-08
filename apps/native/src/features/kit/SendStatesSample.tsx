import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ApplyButton, Button, JobRow, SheetModal, SwipeRow, Text, toast, type ApplyState } from "../../ui";
import { StackedLogos } from "../redesign/apply-flow/AskFirst";
import { LiveBar, type LiveQueue, type LiveState } from "../redesign/apply-flow/WhileItRuns";
import { CodeSheet, NeedsSheet, WaitingSheet } from "../redesign/sends/SendSheets";
import { companyNames, untilWords } from "../redesign/today-facts";
import { refusal } from "../redesign/send-facts";
import { KitPage } from "./KitPage";
import { NEEDS_SAMPLE, SEND_SAMPLE_JOB, WAITING_SAMPLE } from "./send-sample";

/** Each state with Paper's caption (S2 and the eight approved Oct 14). */
const STATES: { caption: string; state: ApplyState }[] = [
  { caption: "2 · Apply for me · the caret holds Check first and Apply myself", state: { kind: "applyForMe" } },
  { caption: "4 · Applying · the form opening", state: { kind: "opening" } },
  { caption: "4 · Applying · the button fills as the form does", state: { kind: "applying", filled: 11, of: 17 } },
  { caption: "4 · Applying · Submit being pressed", state: { kind: "sending", company: "Stripe" } },
  { caption: "5 · Needs you · opens the questions", state: { kind: "needsYou", questions: 3 } },
  { caption: "6 · Sent · no confirmation showed; opens what it sent", state: { kind: "sent", company: "Stripe" } },
  { caption: "7 · Applied · the thank-you page confirmed it", state: { kind: "applied", date: "Oct 24" } },
  { caption: "9 · Checked · opens Ready to send", state: { kind: "checked" } },
  { caption: "10 · Code · opens Greenhouse's code", state: { kind: "code" } },
  { caption: "11 · Captcha · opens assisted apply, filled", state: { kind: "finishOnPhone", reason: "captcha" } },
  { caption: "12 · Didn't send · starts it again", state: { kind: "didntSend" } },
  { caption: "13 · Closed", state: { kind: "apply", closed: true } },
];

/** The live bar above the tab bar (Paper "4 · While it runs", 4.3). */
const LIVE: { caption: string; state: LiveState }[] = [
  { caption: "One application · counts its fields", state: { kind: "sending", company: "Toast", count: "11 of 17", share: 11 / 17 } },
  { caption: "Several · counts applications", state: { kind: "sending", company: "Ramp", count: "3 of 9", share: 2 / 9 } },
  { caption: "Needs you · the rest keep going", state: { kind: "needs", company: "Toast", words: "Toast needs 1 answer", action: "Answer" } },
  { caption: "Done · leaves after 4 seconds", state: { kind: "done", words: "3 sent", detail: "2 confirmed so far", count: 3 } },
];

/** One send going out and SENT landing on it (Paper "Signature moments ·
 * Nov 8", 2), replayed with a tap. With the switch off, today's done. */
const RAMP = { id: "ramp", company: "Ramp", domain: "ramp.com", title: "Software Engineer, New Grad" };
const LANDING: Extract<LiveState, { kind: "done" }> = {
  kind: "done", words: "Sent to Ramp", detail: "Confirmed", count: 1, job: RAMP,
  from: { kind: "sending", company: "Ramp", count: "17 of 17", share: 16 / 17 },
};

function LandingSample() {
  const [take, setTake] = useState(0);
  const [sent, setSent] = useState(false);
  const send = () => {
    setSent(false);
    setTake((count) => count + 1);
    setTimeout(() => setSent(true), 900);
  };
  return <View style={styles.item}>
    <Text role="footnote" weight="medium" tone="ink-2">Live bar · SENT lands as it goes</Text>
    {sent ? <LiveBar key={`done-${take}`} state={LANDING} queue={LIVE_QUEUE} onDismiss={() => setSent(false)} />
      : <LiveBar key={`live-${take}`} state={LANDING.from!} queue={LIVE_QUEUE} />}
    <Button variant="secondary" size="small" onPress={send}>Send it</Button>
  </View>;
}
const LIVE_QUEUE: LiveQueue = {
  now: { id: "ramp", company: "Ramp", domain: "ramp.com", title: "Software Engineer, New Grad" },
  next: [{ id: "notion", company: "Notion", domain: "notion.so", title: "Software Engineer, Early Career" }],
  sent: [{ job: { id: "stripe", company: "Stripe", domain: "stripe.com", title: "Backend Engineer, New Grad" }, confirmed: true }],
};

/** The refusals the button can still meet (S7). */
const REFUSALS: { caption: string; code: string; data?: { limit: number } }[] = [
  { caption: "Already sent", code: "already_sent" },
  { caption: "Closed when the send checked", code: "gone" },
  { caption: "Pro's 10 for the day", code: "limit_reached", data: { limit: 10 } },
  { caption: "Didn't start", code: "sends_unavailable" },
];

/**
 * The send screens on samples (Paper "Send screens · the missing states ·
 * Oct 24"): every button state, its sheets and pages, and the toasts.
 * Nothing is sent.
 */
export function SendStatesSample() {
  const [sheet, setSheet] = useState<"needs" | "code" | "waiting" | null>(null);
  const press = (state: ApplyState) => {
    switch (state.kind) {
      case "needsYou": return () => setSheet("needs");
      case "code": return () => setSheet("code");
      case "checked": return () => router.push({ pathname: "/you/kit-sent", params: { ready: "1" } });
      case "sent": return () => router.push("/you/kit-sent");
      case "finishOnPhone":
      case "applyForMe":
      case "didntSend": return () => toast.show({ message: "A sample: nothing was sent", icon: "autoApply" });
      default: return undefined;
    }
  };
  const showRefusal = (code: string, data?: { limit: number }) => {
    const outcome = refusal(code, "Stripe", data);
    if (outcome.kind !== "toast") return;
    if (outcome.error) toast.error(outcome.message, { action: { label: "Try again", run: () => undefined } });
    else toast.show({ message: outcome.message, icon: outcome.icon });
  };
  return <KitPage title="Send states" contentStyle={styles.content}>
    {STATES.map(({ caption, state }) => <View key={caption} style={styles.item}>
      <Text role="footnote" weight="medium" tone="ink-2">{caption}</Text>
      <ApplyButton state={state} saved={false} onSave={() => undefined} onPress={press(state)}
        onApplyMyself={state.kind === "applyForMe" ? () => toast.show({ message: "Apply myself opens assisted apply" }) : undefined}
        onCheckFirst={state.kind === "applyForMe" ? () => router.push({ pathname: "/you/kit-sent", params: { ready: "1" } }) : undefined} />
    </View>)}
    {LIVE.map(({ caption, state }) => <View key={caption} style={styles.item}>
      <Text role="footnote" weight="medium" tone="ink-2">{`Live bar · ${caption}`}</Text>
      <LiveBar state={state} queue={LIVE_QUEUE} onAction={() => setSheet("needs")} onDismiss={() => undefined} />
    </View>)}
    <LandingSample />
    <View style={styles.item}>
      <Text role="footnote" weight="medium" tone="ink-2">Stopped sends · W3 and W4, the row and its swipe</Text>
      <View style={styles.bleed}>
        <SwipeRow id="waiting-sample" trailing={[{ id: "drop", label: "Don't send", icon: "close", tone: "neutral", run: () => toast.show({ message: "A sample: nothing was dropped" }) }]}>
          <JobRow headline="news" needsYou company={companyNames(WAITING_SAMPLE.sends.map((send) => send.company))}
            title={`Answer ${WAITING_SAMPLE.questions.length} questions to finish`}
            facts={`${WAITING_SAMPLE.sends.length} applications · until ${untilWords(WAITING_SAMPLE.until, new Date())}`} age="16m"
            leading={<StackedLogos ring="bg"
              first={{ name: WAITING_SAMPLE.sends[0]!.company, domain: WAITING_SAMPLE.sends[0]!.domain }}
              second={{ name: WAITING_SAMPLE.sends[1]!.company, domain: WAITING_SAMPLE.sends[1]!.domain }} />}
            onPress={() => setSheet("waiting")} />
        </SwipeRow>
      </View>
      <Button variant="secondary" onPress={() => setSheet("waiting")}>Open the sheet (W5 to W7)</Button>
    </View>
    <View style={styles.item}>
      <Text role="footnote" weight="medium" tone="ink-2">When a send can't start</Text>
      {REFUSALS.map((item) => <Text key={item.code} weight="medium" onPress={() => showRefusal(item.code, item.data)}>{item.caption}</Text>)}
    </View>
    <SheetModal open={sheet === "needs"} onClosed={() => setSheet(null)}>
      <NeedsSheet job={SEND_SAMPLE_JOB} needs={NEEDS_SAMPLE} dryRun={false} pending={false}
        onSend={() => { setSheet(null); toast.show({ message: "A sample: answers kept, nothing sent", icon: "autoApply" }); }} />
    </SheetModal>
    <SheetModal open={sheet === "waiting"} onClosed={() => setSheet(null)}>
      <WaitingSheet waiting={WAITING_SAMPLE} pending={false} onKeep={() => undefined}
        onSendAll={() => { setSheet(null); toast.show({ message: "A sample: answers kept, nothing sent", icon: "autoApply" }); }} />
    </SheetModal>
    <SheetModal open={sheet === "code"} onClosed={() => setSheet(null)}>
      <CodeSheet job={SEND_SAMPLE_JOB} email="jordan@lee.dev" pending={false} failed={false}
        onSend={() => { setSheet(null); toast.show({ message: "A sample: nothing was sent", icon: "autoApply" }); }} />
    </SheetModal>
  </KitPage>;
}

const styles = StyleSheet.create((theme) => ({
  content: { gap: theme.ui.space["6"], paddingHorizontal: theme.ui.size.gutter },
  item: { gap: theme.ui.space["2"] },
  // A row runs edge to edge, as it does on Today.
  bleed: { marginHorizontal: -theme.ui.size.gutter },
}));
