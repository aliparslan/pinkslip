import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Children, Fragment, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  Button, CompanyLogo, Icon, SHEET_GROUP_RADIUS, SheetHeader, SheetModal, SheetStep, Text, useSheet,
} from "../../../ui";
import { logoUri } from "../../jobs/CompanyLogo";

const GLASS = isLiquidGlassAvailable();

/** A job in the live bar's queue. */
export interface LiveJob {
  id: string;
  company: string;
  domain?: string | null;
  title: string;
}

/** What the live bar says (Paper "4 · While it runs", 4.3). */
export type LiveState =
  /** "Applying to Ramp 3 of 9": the bar fills, gray, as the run does. */
  | { kind: "sending"; company: string; count: string; share: number }
  | { kind: "paused"; count: string; share: number }
  /** One job needs you; the rest keep going, and `detail` says how many.
   * Its action opens the job; for several (`group`), Today's one sheet. */
  | { kind: "needs"; company: string; domain?: string | null; words: string; action: string; detail?: string; group?: boolean }
  /** It stays a few seconds, then leaves on its own. */
  | { kind: "done"; words: string; detail?: string };

/** The queue sheet's lists (4.2). */
export interface LiveQueue {
  now: LiveJob | null;
  next: LiveJob[];
  sent: { job: LiveJob; confirmed: boolean }[];
}

/**
 * 4.1, the live bar: a slim pill above the tab bar on every tab, the bot mark
 * in a white circle, what it's doing and how far, one solid gray bar filling
 * behind it, and, once sends can pause, a round pause. Tapping it opens the
 * queue. Its place is the tab bar's `above` slot.
 */
export function LiveBar({ state, queue, onAction, onDismiss, onPause, onStop, onOpenJob }: {
  state: LiveState;
  queue: LiveQueue;
  /** The needs-you state's button: opens the job. */
  onAction?: () => void;
  onDismiss?: () => void;
  /** Leave out until sends can pause (backend phase C). */
  onPause?: () => void;
  /** Stops what's applying and what's next, from the queue (owner, 2026-11-08). */
  onStop?: () => void;
  onOpenJob?: (job: LiveJob) => void;
}) {
  const [open, setOpen] = useState(false);
  const share = state.kind === "sending" || state.kind === "paused" ? state.share : 0;
  const label = state.kind === "sending" ? `Applying to ${state.company}, ${state.count}`
    : state.kind === "paused" ? `Paused, ${state.count}`
    : state.kind === "needs" ? [state.words, state.detail, state.action].filter(Boolean).join(". ") : [state.words, state.detail].filter(Boolean).join(", ");
  return <>
    <Pressable onPress={() => state.kind === "needs" ? onAction?.() : setOpen(true)} accessibilityRole="button" accessibilityLabel={label}>
      <GlassView glassEffectStyle="regular" style={[styles.bar, !GLASS && styles.paper]}>
        {share > 0 ? <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} /> : null}
        {state.kind === "needs" && !state.group
          ? <View style={styles.markSlot}>
            <CompanyLogo name={state.company} uri={logoUri(state.domain ?? null)} size="card" />
            <View style={styles.dot} />
          </View>
          : <View style={styles.mark}><Icon name={state.kind === "done" ? "done" : "autoApply"} size={18} tone={state.kind === "done" ? "good" : "ink"} /></View>}
        <View style={styles.flex}>
          <Text role="subhead" lines={1}>
            <Text role="subhead" weight="medium">{state.kind === "sending" ? `Applying to ${state.company}`
              : state.kind === "paused" ? "Paused" : state.words}</Text>
            {state.kind === "sending" || state.kind === "paused" ? <Text role="subhead" tone="ink-3">{`  ${state.count}`}</Text>
              : (state.kind === "done" || state.kind === "needs") && state.detail ? <Text role="subhead" tone="ink-3">{`  ${state.detail}`}</Text> : null}
          </Text>
        </View>
        {/* In its own box: a hugging button aligns to the top of a row. */}
        {state.kind === "needs" ? <View><Button variant="primary" size="small" onPress={onAction}>{state.action}</Button></View>
          : state.kind === "done" ? <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={6} style={styles.round}>
            <Icon name="close" size={14} tone="ink-2" />
          </Pressable>
          : onPause ? <Pressable onPress={onPause} accessibilityRole="button" accessibilityLabel={state.kind === "paused" ? "Resume" : "Pause"} hitSlop={6} style={styles.round}>
            <PauseMark paused={state.kind === "paused"} />
          </Pressable> : null}
      </GlassView>
    </Pressable>
    <SheetModal open={open} onClosed={() => setOpen(false)}>
      {open ? <Queue queue={queue} paused={state.kind === "paused"} onPause={onPause} onStop={onStop} onOpenJob={onOpenJob} /> : null}
    </SheetModal>
  </>;
}

/** Pause's two bars, or once paused the play triangle (Paper 4.3), both
 * filled in ink so they weigh the same. */
function PauseMark({ paused }: { paused: boolean }) {
  const { theme } = useUnistyles();
  if (paused) {
    return <Svg width={14} height={14} viewBox="0 0 14 14" accessible={false}>
      <Path d="M4 2.2v9.6a.8.8 0 0 0 1.2.7l7.6-4.8a.8.8 0 0 0 0-1.4L5.2 1.5A.8.8 0 0 0 4 2.2z" fill={theme.ui.color.ink} />
    </Svg>;
  }
  return <View style={styles.pauseBars}><View style={styles.pauseBar} /><View style={styles.pauseBar} /></View>;
}

/** 4.2, the queue: Now, Up next and Sent (Confirmed once the board's
 * thank-you page or its email says so), then Pause once sends can pause. */
function Queue({ queue, paused, onPause, onStop, onOpenJob }: { queue: LiveQueue; paused: boolean; onPause?: () => void; onStop?: () => void; onOpenJob?: (job: LiveJob) => void }) {
  const sheet = useSheet();
  const shownNext = queue.next.slice(0, 2);
  const open = onOpenJob ? (job: LiveJob) => () => { sheet.close(); setTimeout(() => onOpenJob(job), 320); } : undefined;
  // A glance you swipe away, so a grab bar rather than the close button (owner, 2026-10-16).
  return <SheetStep id="queue">
    <SheetHeader title="Applying for you" />
    {queue.now ? <Section label="Now">
      <QueueRow job={queue.now} onPress={open?.(queue.now)} trailing={<Text role="subhead" tone="ink-3">{paused ? "Paused" : "Applying"}</Text>} />
    </Section> : null}
    {queue.next.length > 0 ? <Section label="Up next" count={queue.next.length}>
      {shownNext.map((job) => <QueueRow key={job.id} job={job} onPress={open?.(job)} />)}
      {queue.next.length > shownNext.length ? <View style={styles.moreRow}>
        <Text role="subhead" tone="ink-2" flex>{`${queue.next.length - shownNext.length} more`}</Text>
        <Icon name="disclosure" size={12} tone="ink-4" />
      </View> : null}
    </Section> : null}
    {queue.sent.length > 0 ? <Section label="Sent" count={queue.sent.length}>
      {queue.sent.map(({ job, confirmed }) => <QueueRow key={job.id} job={job} onPress={open?.(job)} trailing={confirmed
        ? <View style={styles.confirmed}><Icon name="applied" size={14} tone="ink-3" /><Text role="subhead" tone="ink-3">Confirmed</Text></View>
        : <Text role="subhead" tone="ink-3">Sent</Text>} />)}
    </Section> : null}
    {onPause ? <Button fullWidth onPress={() => { onPause(); sheet.close(); }}>{paused ? "Resume" : "Pause"}</Button> : null}
    {/* Where Pause goes: nothing more is sent, and what's queued is let go. */}
    {onStop ? <Button fullWidth onPress={() => { onStop(); sheet.close(); }}>Stop applying</Button> : null}
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

function QueueRow({ job, trailing, onPress }: { job: LiveJob; trailing?: React.ReactNode; onPress?: () => void }) {
  return <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <CompanyLogo name={job.company} uri={logoUri(job.domain ?? null)} />
    <View style={styles.flex}>
      <View style={styles.line}>
        <Text weight="medium" lines={1} flex>{job.company}</Text>
        {trailing}
      </View>
      <Text role="subhead" tone="ink-2" lines={1}>{job.title}</Text>
    </View>
  </Pressable>;
}

/** How tall the bar is, for the tab bar to leave room above the pill. */
export const LIVE_BAR_HEIGHT = 54;

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1, minWidth: 0 },
  bar: { height: LIVE_BAR_HEIGHT, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingHorizontal: 9, borderRadius: 27, overflow: "hidden" },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: theme.ui.color.fill },
  mark: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color["bg-grouped"] },
  markSlot: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  // The needs-you dot on the logo's corner (Paper 4.3).
  dot: { position: "absolute", top: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: theme.ui.color["bg-elev"], backgroundColor: theme.ui.color.accent },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  pauseBars: { flexDirection: "row", gap: 3 },
  pauseBar: { width: 3, height: 11, borderRadius: 1.5, backgroundColor: theme.ui.color.ink },
  section: { gap: theme.ui.space["1"] },
  sectionLabel: { flexDirection: "row", alignItems: "baseline", gap: 6, paddingHorizontal: theme.ui.space["4"] },
  group: { paddingHorizontal: theme.ui.space["4"], borderRadius: SHEET_GROUP_RADIUS, borderCurve: "continuous", backgroundColor: theme.ui.color["sheet-group"] },
  row: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"] },
  pressed: { opacity: 0.6 },
  rowRule: { height: StyleSheet.hairlineWidth, marginLeft: 52, backgroundColor: theme.ui.color.separator },
  line: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["2"] },
  moreRow: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingLeft: 52 },
  confirmed: { flexDirection: "row", alignItems: "center", gap: 4 },
}));
