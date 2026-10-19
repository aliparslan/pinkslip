import { useRequestCompany, useSubmitFeedback } from "@pinkslip/data";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { haptics } from "../../../platform/haptics";
import { Button, faces, ListGroup, ListItem, Segmented, toast, useUiFontsLoaded } from "../../../ui";
import { YouPage } from "./Page";

export type FeedbackKind = "idea" | "problem";

export interface HelpViewProps {
  actions: {
    /** Resolves with whether it was already in the queue. */
    send: (kind: FeedbackKind, subject: string, details: string) => Promise<{ duplicate: boolean }>;
    requestCompany: (name: string) => Promise<{ duplicate: boolean }>;
  };
}

/** Help and feedback (Paper "You · Oct 14", owner 2026-10-14): an idea or a
 * problem, a subject and what to say, Send; then Request a company, which
 * asks for its name in the iPhone's prompt. */
export function HelpView({ actions }: HelpViewProps) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const font = { fontFamily: fonts ? faces.text : undefined };
  const send = () => {
    setSending(true);
    actions.send(kind, subject.trim(), details.trim()).then(({ duplicate }) => {
      haptics.success();
      toast.success(duplicate ? "That one's already in the queue. Thanks!" : "Sent. Thank you!");
      router.back();
    }, () => {
      setSending(false);
      Alert.alert("Couldn't send that", "Check your connection and try again.");
    });
  };
  const request = () => Alert.prompt("Request a company", "Which company should Pinkslip follow?", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Request", isPreferred: true, onPress: (value?: string) => {
        const name = value?.trim();
        if (!name) return;
        actions.requestCompany(name).then(
          ({ duplicate }) => toast.success(duplicate ? `You've already asked for ${name}` : `Asked for ${name}`),
          () => toast.error("Couldn't send that request. Try again."),
        );
      },
    },
  ], "plain-text");
  return <YouPage title="Help and feedback"
    bar={<Button variant="primary" fullWidth disabled={subject.trim().length < 2} pending={sending} onPress={send}>Send</Button>}>
    <View style={styles.slot}>
      <Segmented value={kind} onChange={setKind} segments={[{ value: "idea", label: "An idea" }, { value: "problem", label: "A problem" }]} />
    </View>
    <View style={styles.slot}>
      <View style={styles.card}>
        <TextInput value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={theme.ui.color["ink-3"]} maxLength={160}
          returnKeyType="next" style={[styles.subject, font]} accessibilityLabel="Subject" />
        <View style={styles.separator} />
        <TextInput value={details} onChangeText={setDetails} multiline maxLength={2000} textAlignVertical="top"
          placeholder={kind === "idea" ? "What should Pinkslip do?" : "What happened?"} placeholderTextColor={theme.ui.color["ink-3"]}
          style={[styles.details, font]} accessibilityLabel="Details" />
      </View>
    </View>
    <ListGroup surface="fill">
      <ListItem title="Request a company" accessory="chevron" onPress={request} />
    </ListGroup>
  </YouPage>;
}

/** Help and feedback on the live account: both go to the admin inbox. */
export function HelpPage() {
  const submit = useSubmitFeedback();
  const requestCompany = useRequestCompany();
  return <HelpView actions={{
    send: async (kind, title, details) => {
      const result = await submit.mutateAsync({ type: kind === "idea" ? "feature_request" : "general_feedback", title, details });
      return { duplicate: Boolean(result.duplicate) };
    },
    requestCompany: async (name) => {
      const result = await requestCompany.mutateAsync({ name, careersUrl: "", details: "" });
      return { duplicate: Boolean(result.duplicate) };
    },
  }} />;
}

const styles = StyleSheet.create((theme) => ({
  slot: { paddingHorizontal: theme.ui.space["4"] },
  card: { paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  subject: { minHeight: 50, fontSize: 17, lineHeight: 22, color: theme.ui.color.ink },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.ui.color.separator },
  details: { minHeight: 150, paddingTop: 14, paddingBottom: 14, fontSize: 17, lineHeight: 22, color: theme.ui.color.ink },
}));
