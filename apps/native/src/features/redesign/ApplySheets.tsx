import { useAnswers, useResumeProfile } from "@pinkslip/data";
import { companySourceLabel, isCompanySourceType } from "@pinkslip/domain/company-sources";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, Choices, CompanyLogo, Icon, SheetStep, Text, useSheet } from "../../ui";
import type { DetailJob } from "../job-detail/useJobPage";
import { logoUri } from "../jobs/CompanyLogo";
import { useLocalResumeFile } from "../../platform/resume-file";
import { plainText } from "./job-facts";

/**
 * "Did you apply?", after the posting closes (Paper "Apply 2"). No ticket:
 * you just came from the posting and the job page is right behind the sheet.
 * Yes tears the stub off into Tracker.
 */
export function DidYouApply({ onYes }: { onYes: () => void }) {
  const { close } = useSheet();
  return <SheetStep id="asked" grabber={false}>
    <View style={styles.header}>
      <View style={styles.title}>
        <Text role="title1" accessibilityRole="header">Did you apply?</Text>
        <Text role="subhead" tone="ink-2">It goes to Tracker so you can follow up.</Text>
      </View>
      <CloseButton />
    </View>
    <View style={styles.actions}>
      <Button variant="primary" fullWidth onPress={() => { onYes(); close(); }}>Yes, I applied</Button>
      <Button fullWidth onPress={close}>Not yet</Button>
    </View>
  </SheetStep>;
}

/**
 * Before an assisted application (Paper "Apply 1"): what Pinkslip will fill
 * the form with, each row opening where you change it. Only shown when
 * Pinkslip fills the form; otherwise Apply goes straight to the posting.
 */
export function ApplyPrep({ job, onOpen, onAlreadyApplied }: { job: DetailJob; onOpen: () => void; onAlreadyApplied: () => void }) {
  const { close } = useSheet();
  const resume = useResumeProfile().data?.data;
  // The PDF that gets attached is the one kept on this iPhone, not the saved resume.
  const pdf = useLocalResumeFile();
  const answers = useAnswers().data;
  const contact = resume?.contact;
  const source = job.source_type && job.source_type !== "custom" && isCompanySourceType(job.source_type) ? companySourceLabel(job.source_type) : null;
  const change = (href: Href) => {
    close();
    setTimeout(() => router.push(href), 320);
  };
  return <SheetStep id="prep" grabber={false}>
    <View style={styles.prepTop}>
      <CompanyLogo name={job.company_name} uri={logoUri(job.company_domain)} size="page" />
      <CloseButton />
    </View>
    <View style={styles.title}>
      <Text role="title1" accessibilityRole="header">Apply at {plainText(job.company_name)}</Text>
      {source ? <Text role="subhead" tone="ink-2">Opens on {source}</Text> : null}
    </View>
    <Choices>
      <PrepRow label="Resume" value={pdf?.name ?? "Add your PDF"} onPress={() => change("/you/resume")} />
      <PrepRow label="Email" value={contact?.email || "Not added"} onPress={() => change("/you/resume")} />
      <PrepRow label="LinkedIn" value={contact?.linkedin ? contact.linkedin.replace(/^https?:\/\/(www\.)?/, "") : "Not added"} onPress={() => change("/you/resume")} />
      <PrepRow label="Answers" value={answers ? `${answers.length} saved` : "—"} onPress={() => change("/you/answers")} />
    </Choices>
    <View style={styles.actions}>
      <Button variant="primary" fullWidth icon="apply" iconAfter onPress={() => { close(); onOpen(); }}>Open application</Button>
      <Button variant="plain" fullWidth onPress={() => { onAlreadyApplied(); close(); }}>I already applied</Button>
    </View>
  </SheetStep>;
}

function PrepRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}. Change`}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.rowText}>
      <Text role="footnote" tone="ink-3">{label}</Text>
      <Text weight="medium" lines={1}>{value}</Text>
    </View>
    <Icon name="disclosure" size={12} tone="ink-4" />
  </Pressable>;
}

function CloseButton() {
  const { close } = useSheet();
  return <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={6} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
    <Icon name="close" size={16} tone="ink-2" />
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  header: { flexDirection: "row", alignItems: "flex-start", gap: theme.ui.space["3"] },
  prepTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  title: { flex: 1, gap: theme.ui.space["1"] },
  actions: { gap: theme.ui.space["2"] },
  row: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"] },
  rowText: { flex: 1, gap: 2 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  pressed: { opacity: 0.6 },
}));
