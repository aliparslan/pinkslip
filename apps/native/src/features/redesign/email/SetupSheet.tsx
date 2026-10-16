import {
  FORWARDING_PROVIDERS, forwardingIntros, forwardingProviderNames, JOB_MAIL_FILTER,
} from "@pinkslip/domain/email-tracking";
import type { ForwardingProvider, ForwardingScope, Inbox } from "@pinkslip/core/api";
import { useInbox, useSendForwardingSteps } from "@pinkslip/data";
import { useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { haptics } from "../../../platform/haptics";
import { Button, Choice, Choices, CopyField, SheetHeader, SheetModal, SheetStep, Text, useSheet } from "../../../ui";
import { rememberSetup, useEmailTrackingPrefs, type EmailTrackingPrefs } from "./email-prefs";

/** Where setup opens: the first question, or straight to the steps on the
 * computer (How to set it up, or after replacing the address). */
export type SetupStart = "provider" | "computer";

type Step = "provider" | "scope" | "computer" | "code" | "filter";

export interface EmailSetupActions {
  /** "Email me these steps": resolves with where they went. */
  sendSteps: (provider: ForwardingProvider, scope: ForwardingScope) => Promise<string>;
  /** Keeps the provider, what Gmail forwards, and that the address was added. */
  remember: typeof rememberSetup;
}

export interface EmailSetupSheetProps {
  open: boolean;
  onClosed: () => void;
  start?: SetupStart;
  inbox: Inbox | undefined;
  prefs: EmailTrackingPrefs;
  actions: EmailSetupActions;
}

/** Setting up email tracking, as a guided sheet (Paper "Email tracking ·
 * Oct 14", 2B, owner 2026-10-14): which mail you apply with, for Gmail what
 * to forward, the address to paste on a computer, then Gmail's code (it
 * shows up by itself) and, for only job mail, the filter. */
export function EmailSetupSheet({ open, onClosed, start = "provider", inbox, prefs, actions }: EmailSetupSheetProps) {
  return <SheetModal open={open} onClosed={onClosed}>
    <SetupSteps start={start} inbox={inbox} prefs={prefs} actions={actions} />
  </SheetModal>;
}

/** The sheet on the live inbox, which it rechecks while open so Gmail's code
 * appears when it arrives. */
export function LiveEmailSetupSheet({ open, onClosed, start }: Pick<EmailSetupSheetProps, "open" | "onClosed" | "start">) {
  const inbox = useInbox({ poll: open });
  const prefs = useEmailTrackingPrefs();
  const actions = useEmailSetupActions();
  return <EmailSetupSheet open={open} onClosed={onClosed} start={start} inbox={inbox.data} prefs={prefs} actions={actions} />;
}

export function useEmailSetupActions(): EmailSetupActions {
  const send = useSendForwardingSteps();
  return { sendSteps: async (provider, scope) => (await send.mutateAsync({ provider, scope })).to, remember: rememberSetup };
}

function SetupSteps({ start, inbox, prefs, actions }: { start: SetupStart; inbox: Inbox | undefined; prefs: EmailTrackingPrefs; actions: EmailSetupActions }) {
  const sheet = useSheet();
  const [step, setStep] = useState<Step>(start);
  const [provider, setProvider] = useState<ForwardingProvider>(prefs.provider ?? "gmail");
  const [scope, setScope] = useState<ForwardingScope>(prefs.scope);
  const [sending, setSending] = useState(false);
  /** Where the steps went: toasts sit under a sheet, so the button says it. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const gmail = provider === "gmail";

  if (step === "provider") {
    return <SheetStep id="provider">
      <SheetHeader title="Where do companies email you?" />
      <Choices>
        {FORWARDING_PROVIDERS.map((option) => <Choice key={option} title={forwardingProviderNames[option]}
          detail={option === "school" ? "Many block forwarding. Pinkslip checks first." : undefined}
          selected={provider === option} onPress={() => setProvider(option)} />)}
      </Choices>
      <Button variant="primary" fullWidth onPress={() => {
        actions.remember({ provider });
        setStep(gmail ? "scope" : "computer");
      }}>Continue</Button>
    </SheetStep>;
  }

  if (step === "scope") {
    return <SheetStep id="scope" inner>
      <SheetHeader title="What should Gmail forward?" />
      <Choices>
        <Choice title="Everything" detail="Simplest. Pinkslip opens only job mail and drops the rest unread."
          selected={scope === "everything"} onPress={() => setScope("everything")} />
        <Choice title="Only job mail" detail="A Gmail filter Pinkslip writes for you. A few emails may slip past it."
          selected={scope === "job"} onPress={() => setScope("job")} />
      </Choices>
      <Button variant="primary" fullWidth onPress={() => {
        actions.remember({ scope });
        setStep("computer");
      }}>Continue</Button>
    </SheetStep>;
  }

  if (step === "computer") {
    const emailSteps = async () => {
      setSending(true);
      try {
        setSentTo(await actions.sendSteps(provider, gmail ? scope : "everything"));
        haptics.success();
      } catch {
        Alert.alert("Couldn't send the steps", "Check your connection and try again.");
      } finally {
        setSending(false);
      }
    };
    return <SheetStep id="computer" inner={start !== "computer"}>
      <View style={styles.lead}>
        <SheetHeader title="Now on your computer" />
        <Text tone="ink-2">{forwardingIntros[provider]}</Text>
      </View>
      {inbox ? <CopyField value={inbox.address} label="address" /> : <Waiting />}
      <View style={styles.answers}>
        <Button variant="primary" fullWidth disabled={!inbox} onPress={() => {
          actions.remember({ started: true });
          haptics.success();
          if (gmail) setStep("code");
          else sheet.close();
        }}>I added it</Button>
        <Button variant="text" fullWidth pending={sending} disabled={sentTo !== null} onPress={() => void emailSteps()}>
          {sentTo ? `Sent to ${sentTo}` : "Email me these steps"}
        </Button>
      </View>
    </SheetStep>;
  }

  if (step === "code") {
    const code = inbox?.forwarding.code;
    if (!code) {
      return <SheetStep id="code-waiting" inner>
        <View style={styles.lead}>
          <SheetHeader title="Waiting for Gmail's code" />
          <Text tone="ink-2">Gmail sends it to your address in a minute or so. It shows up here.</Text>
        </View>
        <Waiting />
        <Button variant="text" fullWidth onPress={sheet.close}>Finish later</Button>
      </SheetStep>;
    }
    return <SheetStep id="code" inner>
      <View style={styles.lead}>
        <SheetHeader title="Gmail's code came in" />
        <Text tone="ink-2">{scope === "job"
          ? "Type it into Gmail, then make the filter."
          : "Type it into Gmail, then choose “Forward a copy” and Save."}</Text>
      </View>
      <CopyField value={code} text={code.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3")} label="code" display="code" />
      <Button variant="primary" fullWidth onPress={() => scope === "job" ? setStep("filter") : sheet.close()}>
        {scope === "job" ? "Next" : "Done"}
      </Button>
    </SheetStep>;
  }

  return <SheetStep id="filter" inner>
    <View style={styles.lead}>
      <SheetHeader title="Make the filter" />
      <Text tone="ink-2">In Gmail on your computer, paste this into the search bar, then Create filter › Forward it to your address.</Text>
    </View>
    <CopyField value={JOB_MAIL_FILTER} label="filter" display="block" />
    <Button variant="primary" fullWidth onPress={sheet.close}>I made it</Button>
  </SheetStep>;
}

function Waiting() {
  const { theme } = useUnistyles();
  return <View style={styles.waiting}><ActivityIndicator color={theme.ui.color["ink-3"]} /></View>;
}

const styles = StyleSheet.create((theme) => ({
  lead: { gap: theme.ui.space["2"] },
  answers: { gap: theme.ui.space["2"] },
  waiting: { minHeight: 56, alignItems: "center", justifyContent: "center" },
}));
