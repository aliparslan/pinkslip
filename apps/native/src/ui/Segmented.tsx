import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Text } from "./Text";

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  segments: ReadonlyArray<{ value: T; label: string; count?: number }>;
}

/** A segmented control (owner, 2026-10-13): a gray track 40 tall with the
 * chosen segment a raised `seg-on` thumb 4 inside it, 32 like a chip. A
 * segment can carry its count, as chips do. */
export function Segmented<T extends string>({ value, onChange, segments }: SegmentedProps<T>) {
  return <View style={styles.track} accessibilityRole="tablist">
    {segments.map((segment) => {
      const on = segment.value === value;
      return <Pressable key={segment.value} onPress={() => onChange(segment.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
        style={[styles.segment, on && styles.on]}>
        <Text role="subhead" weight="medium" tone={on ? "ink" : "ink-2"}>{segment.label}</Text>
        {segment.count !== undefined ? <Text role="subhead" tone="ink-3">{String(segment.count)}</Text> : null}
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  track: { flexDirection: "row", height: 40, padding: theme.ui.space["1"], borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color.fill },
  segment: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", borderRadius: theme.ui.radius.full },
  on: { backgroundColor: theme.ui.color["seg-on"], boxShadow: "0px 1px 3px rgba(0, 0, 0, 0.08)" },
}));
