import { formatCompactSalaryText, formatJobLocation } from "@pinkslip/core/job-format";
import { isFreshJobTiming, jobTimingLabel } from "@pinkslip/core/job-timing";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Menu, SwipeRow, Text } from "../../kit";
import { CompanyLogo } from "./CompanyLogo";
import { rowActions } from "./row-actions";
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
  const { leading, trailing, menu } = rowActions(job, actions, viewed);
  return <SwipeRow id={job.id} leading={leading} trailing={trailing}>
    <Menu items={menu} openOn="longPress" fill>
      <Pressable onPress={() => onPress(job)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button" accessibilityLabel={`${job.title} at ${job.company_name}${fresh ? ", new" : ""}`}
        accessibilityActions={menu.map((action) => ({ name: action.id, label: action.title }))}
        onAccessibilityAction={(event) => menu.find((action) => action.id === event.nativeEvent.actionName)?.onSelect()}>
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
  </SwipeRow>;
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
