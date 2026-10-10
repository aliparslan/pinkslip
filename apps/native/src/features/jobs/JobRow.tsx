import { formatCompactSalaryText, formatJobLocation } from "@pinkslip/core/job-format";
import { isFreshJobTiming, jobTimingLabel } from "@pinkslip/core/job-timing";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Menu, NativeSwipeRow, Text, type MenuItem, type NativeSwipeAction } from "../../kit";
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

/**
 * The job row (`JobRow.svelte`): logo, company and timing, title, location
 * and salary. Read rows step down the ink ramp; a fresh unread job gets the
 * pink dot. iOS adds one full swipe per side (right: save, unsave or
 * applied; left: hide, remove or didn't apply) and a long-press menu with
 * every action.
 */
export function JobRow({ job, viewed = false, contextLabel, onPress, actions }: JobRowProps) {
  const location = formatJobLocation(job.location);
  const salary = formatCompactSalaryText(job.salary?.trim() ? job.salary : null);
  const fresh = !contextLabel && !viewed && isFreshJobTiming(job);
  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const { save, unsave, markApplied, unmarkApplied, toggleRead, hide, block } = actions;

  // The feed's right swipe toggles Save; Library's moves a saved job to applied.
  const leading: NativeSwipeAction | null = save && !saved ? { label: "Save", icon: "bookmark", tone: "accent", run: () => save(job) }
    : save && unsave && saved ? { label: "Unsave", icon: "bookmark.slash", tone: "neutral", run: () => unsave(job) }
    : markApplied && !applied ? { label: "Applied", icon: "checkmark.circle", tone: "accent", run: () => markApplied(job) } : null;
  const trailing: NativeSwipeAction | null = hide ? { label: "Hide", icon: "eye.slash", tone: "bad", run: () => hide(job) }
    : unsave && saved ? { label: "Remove", icon: "xmark", tone: "bad", run: () => unsave(job) }
    : unmarkApplied && applied ? { label: "Didn't apply", icon: "arrow.uturn.backward", tone: "neutral", run: () => unmarkApplied(job) } : null;

  const menu: (MenuItem | false | undefined)[] = [
    save && !saved && { id: "save", title: "Save", icon: "bookmark", onSelect: () => save(job) },
    unsave && saved && { id: "unsave", title: "Remove from saved", icon: "bookmark.slash", onSelect: () => unsave(job) },
    markApplied && !applied && { id: "applied", title: "Mark as applied", icon: "checkmark.circle", onSelect: () => markApplied(job) },
    unmarkApplied && applied && { id: "unapplied", title: "I didn't apply", icon: "arrow.uturn.backward", onSelect: () => unmarkApplied(job) },
    toggleRead && { id: "read", title: viewed ? "Mark as unread" : "Mark as read", icon: viewed ? "envelope.badge" : "envelope.open", onSelect: () => toggleRead(job, !viewed) },
    hide && { id: "hide", title: "Hide", icon: "eye.slash", onSelect: () => hide(job) },
    block && { id: "block", title: "Block for everyone", icon: "nosign", destructive: true, onSelect: () => block(job) },
  ];

  const a11yActions = menu.filter((item): item is MenuItem => Boolean(item));
  return <NativeSwipeRow leading={leading} trailing={trailing}>
    <Menu items={menu} openOn="longPress" fill>
      <Pressable onPress={() => onPress(job)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button" accessibilityLabel={`${job.title} at ${job.company_name}${fresh ? ", new" : ""}`}
        accessibilityActions={a11yActions.map((action) => ({ name: action.id, label: action.title }))}
        onAccessibilityAction={(event) => a11yActions.find((action) => action.id === event.nativeEvent.actionName)?.onSelect()}>
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
  </NativeSwipeRow>;
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
}));
