import { formatCompactSalaryText, formatJobLocation } from "@pinkslip/core/job-format";
import { isFreshJobTiming, jobTimingLabel } from "@pinkslip/core/job-timing";
import { BookmarkSimple, CheckCircle, EyeSlash, X, ArrowCounterClockwise, type Icon as PhosphorIcon } from "phosphor-react-native";
import { useRef } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { Pressable as GesturePressable } from "react-native-gesture-handler";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Menu, Text, type MenuItem } from "../../kit";
import { CompanyLogo } from "./CompanyLogo";
import type { JobActions, RowJob } from "./useJobActions";

export interface JobRowProps {
  job: RowJob;
  viewed?: boolean;
  /** Replaces the timing label, e.g. "Applied 3d ago" in Library. */
  contextLabel?: string;
  onPress: (job: RowJob) => void;
  actions: JobActions;
}

interface SwipeAction { label: string; icon: PhosphorIcon; tone: "accent" | "bad" | "neutral"; run: () => void }

/**
 * The job row (`JobRow.svelte`): logo, company and timing, title, location
 * and salary. Read rows step down the ink ramp; a fresh unread job gets the
 * pink dot. iOS adds swipes (right: save or applied; left: hide or remove)
 * and a long-press menu with every action.
 */
export function JobRow({ job, viewed = false, contextLabel, onPress, actions }: JobRowProps) {
  const { theme } = useUnistyles();
  const swipeable = useRef<SwipeableMethods>(null);
  const location = formatJobLocation(job.location);
  const salary = formatCompactSalaryText(job.salary?.trim() ? job.salary : null);
  const fresh = !contextLabel && !viewed && isFreshJobTiming(job);
  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const { save, unsave, markApplied, unmarkApplied, toggleRead, hide, block } = actions;

  const leading: SwipeAction | null = save && !saved ? { label: "Save", icon: BookmarkSimple, tone: "accent", run: () => save(job) }
    : markApplied && !applied ? { label: "Applied", icon: CheckCircle, tone: "accent", run: () => markApplied(job) } : null;
  const trailing: SwipeAction | null = hide ? { label: "Hide", icon: EyeSlash, tone: "bad", run: () => hide(job) }
    : unsave && saved ? { label: "Remove", icon: X, tone: "bad", run: () => unsave(job) }
    : unmarkApplied && applied ? { label: "Didn't apply", icon: ArrowCounterClockwise, tone: "neutral", run: () => unmarkApplied(job) } : null;

  const menu: (MenuItem | false | undefined)[] = [
    save && !saved && { id: "save", title: "Save", icon: "bookmark", onSelect: () => save(job) },
    unsave && saved && { id: "unsave", title: "Remove from saved", icon: "bookmark.slash", onSelect: () => unsave(job) },
    markApplied && !applied && { id: "applied", title: "Mark as applied", icon: "checkmark.circle", onSelect: () => markApplied(job) },
    unmarkApplied && applied && { id: "unapplied", title: "I didn't apply", icon: "arrow.uturn.backward", onSelect: () => unmarkApplied(job) },
    toggleRead && { id: "read", title: viewed ? "Mark as unread" : "Mark as read", icon: viewed ? "envelope.badge" : "envelope.open", onSelect: () => toggleRead(job, !viewed) },
    hide && { id: "hide", title: "Hide", icon: "eye.slash", onSelect: () => hide(job) },
    block && { id: "block", title: "Block for everyone", icon: "nosign", destructive: true, onSelect: () => block(job) },
  ];

  // Inside the swipeable, only gesture-handler's Pressable receives taps.
  const renderAction = (action: SwipeAction | null, side: "left" | "right") => action ? () => <GesturePressable accessibilityRole="button"
    onPress={() => { swipeable.current?.close(); action.run(); }}
    style={[styles.action, side === "left" ? styles.actionLeft : styles.actionRight, styles.tone(action.tone)]}>
    <action.icon size={20} weight="bold" color={action.tone === "neutral" ? theme.colors.ink : theme.colors["accent-ink"]} />
    <RNText style={[styles.actionLabel, { color: action.tone === "neutral" ? theme.colors.ink : theme.colors["accent-ink"] }]}>{action.label}</RNText>
  </GesturePressable> : undefined;

  const a11yActions = [leading, trailing].filter((action): action is SwipeAction => Boolean(action));
  return <ReanimatedSwipeable ref={swipeable} friction={1.6} overshootFriction={8}
    renderLeftActions={renderAction(leading, "left")} renderRightActions={renderAction(trailing, "right")}>
    <Menu items={menu} openOn="longPress" fill>
      <Pressable onPress={() => onPress(job)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button" accessibilityLabel={`${job.title} at ${job.company_name}${fresh ? ", new" : ""}`}
        accessibilityActions={a11yActions.map((action) => ({ name: action.label, label: action.label }))}
        onAccessibilityAction={(event) => a11yActions.find((action) => action.label === event.nativeEvent.actionName)?.run()}>
        <CompanyLogo name={job.company_name} domain={job.company_domain} size={24} />
        <View style={styles.body}>
          <View style={styles.meta}>
            <Text size="xs" weight="medium" tone={viewed ? "ink-4" : "ink-3"} truncate>{job.company_name} · {contextLabel ?? jobTimingLabel(job)}</Text>
            {fresh && <View style={styles.newDot} />}
          </View>
          <Text weight="medium" tone={viewed ? "ink-3" : "ink"} lines={2}>{job.title}</Text>
          {(location || salary) && <Text size="sm" tone={viewed ? "ink-4" : "ink-3"} truncate>{[location, salary].filter(Boolean).join(" · ")}</Text>}
        </View>
      </Pressable>
    </Menu>
  </ReanimatedSwipeable>;
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.space["3"],
    paddingHorizontal: theme.gutter,
    paddingVertical: theme.space["3"],
    backgroundColor: theme.colors.bg,
  },
  pressed: { backgroundColor: theme.colors["bg-elev"] },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: theme.space["2"] },
  newDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.accent },
  action: { width: 88, alignItems: "center", justifyContent: "center", gap: 4 },
  actionLeft: {},
  actionRight: {},
  actionLabel: { fontSize: theme.fontSize["2xs"], fontWeight: "600" },
  tone: (tone: "accent" | "bad" | "neutral") => ({
    backgroundColor: tone === "accent" ? theme.colors["accent-fill"] : tone === "bad" ? theme.colors.bad : theme.colors["control-selected-bg"],
  }),
}));
