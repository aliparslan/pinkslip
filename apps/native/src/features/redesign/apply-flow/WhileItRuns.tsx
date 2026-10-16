import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Children, Fragment, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import {
  Button, CompanyLogo, Icon, SHEET_GROUP_RADIUS, SheetHeader, SheetModal, SheetStep, Text, useSheet, useTabBarSpace,
} from "../../../ui";
import { logoUri } from "../../jobs/CompanyLogo";
import type { AskJob } from "./AskFirst";

const GLASS = isLiquidGlassAvailable();

export interface Run {
  now: AskJob;
  next: AskJob[];
  sent: { job: AskJob; confirmed: boolean }[];
  /** "3 of 9". */
  done: number;
  total: number;
  paused?: boolean;
}

/**
 * 4.1, the live bar: a slim pill above the tab bar, the bot mark in a white
 * circle, what it's doing and how far, one solid bar filling behind it, and
 * a round pause. Tapping it opens the queue.
 */
export function LiveBar({ run, onPause, roomGiven = false }: {
  run: Run;
  onPause: () => void;
  /** The page already leaves the tab bar's room (a page in You's stack). */
  roomGiven?: boolean;
}) {
  const tabSpace = useTabBarSpace();
  const [queue, setQueue] = useState(false);
  const progress = run.done / Math.max(run.total, 1);
  return <>
    <View pointerEvents="box-none" style={[styles.slot, { bottom: (roomGiven ? 0 : tabSpace) - 4 }]}>
      <Pressable onPress={() => setQueue(true)} accessibilityRole="button" accessibilityLabel={`${run.paused ? "Paused" : `Applying to ${run.now.company}`}, ${run.done} of ${run.total}`}>
        <GlassView glassEffectStyle="regular" style={[styles.bar, !GLASS && styles.paper]}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          <View style={styles.mark}><Icon name="autoApply" size={18} /></View>
          <View style={styles.flex}>
            <Text role="subhead" lines={1}>
              <Text role="subhead" weight="medium">{run.paused ? "Paused" : `Applying to ${run.now.company}`}</Text>
              <Text role="subhead" tone="ink-3">{`  ${run.done} of ${run.total}`}</Text>
            </Text>
          </View>
          <Pressable onPress={onPause} accessibilityRole="button" accessibilityLabel={run.paused ? "Resume" : "Pause"} hitSlop={6} style={styles.pause}>
            <PauseMark paused={Boolean(run.paused)} />
          </Pressable>
        </GlassView>
      </Pressable>
    </View>
    <QueueSheet open={queue} run={run} onClosed={() => setQueue(false)} onPause={onPause} />
  </>;
}

function PauseMark({ paused }: { paused: boolean }) {
  if (paused) return <Icon name="refresh" size={14} />;
  return <View style={styles.pauseBars}><View style={styles.pauseBar} /><View style={styles.pauseBar} /></View>;
}

/** 4.2, the queue: Now, Up next and Sent (Confirmed once the board or its
 * email says so), then Pause. */
function QueueSheet({ open, run, onClosed, onPause }: { open: boolean; run: Run; onClosed: () => void; onPause: () => void }) {
  return <SheetModal open={open} onClosed={onClosed}>{open ? <Queue run={run} onPause={onPause} /> : null}</SheetModal>;
}

function Queue({ run, onPause }: { run: Run; onPause: () => void }) {
  const sheet = useSheet();
  const shownNext = run.next.slice(0, 2);
  // A glance you swipe away, so a grab bar rather than the close button (owner, 2026-10-16).
  return <SheetStep id="queue">
    <SheetHeader title="Applying for you" />
    <Section label="Now">
      <QueueRow job={run.now} trailing={<Text role="subhead" tone="ink-3">{run.paused ? "Paused" : "Applying"}</Text>} />
    </Section>
    {run.next.length > 0 ? <Section label="Up next" count={run.next.length}>
      {shownNext.map((job) => <QueueRow key={job.id} job={job} />)}
      {run.next.length > shownNext.length ? <View style={styles.moreRow}>
        <Text role="subhead" tone="ink-2" flex>{`${run.next.length - shownNext.length} more`}</Text>
        <Icon name="disclosure" size={12} tone="ink-4" />
      </View> : null}
    </Section> : null}
    {run.sent.length > 0 ? <Section label="Sent" count={run.sent.length}>
      {run.sent.map(({ job, confirmed }) => <QueueRow key={job.id} job={job} trailing={confirmed
        ? <View style={styles.confirmed}><Icon name="applied" size={14} tone="ink-3" /><Text role="subhead" tone="ink-3">Confirmed</Text></View>
        : <Text role="subhead" tone="ink-3">Sent</Text>} />)}
    </Section> : null}
    <Button fullWidth onPress={() => { onPause(); sheet.close(); }}>{run.paused ? "Resume" : "Pause"}</Button>
  </SheetStep>;
}

function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return <View style={styles.section}>
    <View style={styles.sectionLabel}>
      <Text role="footnote" weight="medium" tone="ink-2">{label}</Text>
      {count !== undefined ? <Text role="footnote" tone="ink-3">{String(count)}</Text> : null}
    </View>
    <View style={styles.group}>{Children.toArray(children).filter(Boolean).map((child, index) => <Fragment key={index}>
      {index > 0 ? <View style={styles.rowRule} /> : null}
      {child}
    </Fragment>)}</View>
  </View>;
}

function QueueRow({ job, trailing }: { job: AskJob; trailing?: React.ReactNode }) {
  return <View style={styles.row}>
    <CompanyLogo name={job.company} uri={logoUri(job.domain)} />
    <View style={styles.flex}>
      <View style={styles.line}>
        <Text weight="medium" lines={1} flex>{job.company}</Text>
        {trailing}
      </View>
      <Text role="subhead" tone="ink-2" lines={1}>{job.title}</Text>
    </View>
  </View>;
}

/** W3, what Pinkslip sent: proof as a quiet log, newest first, small grey
 * dots and only the latest step in ink; the resume as a file row; each
 * answer with its question small above it. */
export function WhatPinkslipSent({ company, title, proof, answers, total }: {
  company: string;
  title: string;
  proof: { label: string; when: string }[];
  answers: { question: string; answer: string }[];
  total: number;
}) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.page, { paddingBottom: insets.bottom + 32 }]}>
    <View style={styles.pageHead}>
      <Text role="title1" accessibilityRole="header">What Pinkslip sent</Text>
      <Text role="subhead" tone="ink-2">{`${company} · ${title}`}</Text>
    </View>
    <View style={styles.block}>
      <Text role="footnote" weight="medium" tone="ink-2">Proof</Text>
      {proof.map((step, index) => <View key={step.label} style={styles.proof}>
        <View style={styles.rail}>
          <View style={[styles.proofDot, index === 0 && styles.proofDotNow]} />
          {index < proof.length - 1 ? <View style={styles.railLine} /> : null}
        </View>
        <Text weight={index === 0 ? "medium" : "regular"} tone={index === 0 ? "ink" : "ink-2"} flex>{step.label}</Text>
        <Text role="subhead" tone="ink-3">{step.when}</Text>
        <Icon name="disclosure" size={12} tone="ink-4" />
      </View>)}
    </View>
    <View style={styles.block}>
      <Text role="footnote" weight="medium" tone="ink-2">Resume</Text>
      <View style={styles.file}>
        <View style={styles.fileIcon}><Icon name="resume" size={18} tone="ink-2" /></View>
        <View style={styles.flex}>
          <Text>Jordan_Lee.pdf</Text>
          <Text role="subhead" tone="ink-3">1 page</Text>
        </View>
        <Icon name="disclosure" size={12} tone="ink-4" />
      </View>
    </View>
    <View style={styles.block}>
      <Text role="footnote" weight="medium" tone="ink-2">Answers</Text>
      {answers.map((item) => <View key={item.question} style={styles.answer}>
        <Text role="subhead" tone="ink-3">{item.question}</Text>
        <Text>{item.answer}</Text>
      </View>)}
      <View style={styles.allAnswers}>
        <Text role="subhead" weight="medium" tone="ink-2" flex>{`All ${total} answers`}</Text>
        <Icon name="disclosure" size={12} tone="ink-4" />
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1, minWidth: 0 },
  slot: { position: "absolute", left: theme.ui.size.gutter, right: theme.ui.size.gutter },
  bar: { height: 54, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingHorizontal: 9, borderRadius: 27, overflow: "hidden" },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: theme.ui.color.fill },
  mark: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color["bg-grouped"] },
  pause: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  pauseBars: { flexDirection: "row", gap: 3 },
  pauseBar: { width: 3, height: 11, borderRadius: 1.5, backgroundColor: theme.ui.color.ink },
  section: { gap: theme.ui.space["1"] },
  sectionLabel: { flexDirection: "row", alignItems: "baseline", gap: 6, paddingHorizontal: theme.ui.space["4"] },
  group: { paddingHorizontal: theme.ui.space["4"], borderRadius: SHEET_GROUP_RADIUS, borderCurve: "continuous", backgroundColor: theme.ui.color["sheet-group"] },
  row: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"] },
  rowRule: { height: StyleSheet.hairlineWidth, marginLeft: 52, backgroundColor: theme.ui.color.separator },
  line: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["2"] },
  moreRow: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingLeft: 52 },
  confirmed: { flexDirection: "row", alignItems: "center", gap: 4 },
  page: { flex: 1, gap: theme.ui.space["6"], paddingHorizontal: theme.ui.size.gutter, backgroundColor: theme.ui.color.bg },
  pageHead: { gap: theme.ui.space["1"] },
  block: { gap: theme.ui.space["2"] },
  proof: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  rail: { width: 8, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  proofDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.ui.color["ink-4"] },
  proofDotNow: { backgroundColor: theme.ui.color.ink },
  railLine: { position: "absolute", top: 26, bottom: -22, width: 1.5, backgroundColor: theme.ui.color["ink-4"] },
  file: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["1"] },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  answer: { gap: 2, paddingVertical: theme.ui.space["2"], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.ui.color.separator },
  allAnswers: { minHeight: 44, flexDirection: "row", alignItems: "center" },
}));
