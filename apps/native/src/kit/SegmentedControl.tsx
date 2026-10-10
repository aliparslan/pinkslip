import { SegmentedControl as NativeSegmentedControl } from "@expo/ui/community/segmented-control";
import { useUnistyles } from "react-native-unistyles";

export interface Segment<Value extends string> { value: Value; label: string }

/** The system segmented control (UISegmentedControl), as for Saved/Applied. */
export function SegmentedControl<Value extends string>({ segments, value, onValueChange }: {
  segments: ReadonlyArray<Segment<Value>>;
  value: Value;
  onValueChange: (value: Value) => void;
}) {
  const { theme } = useUnistyles();
  return <NativeSegmentedControl values={segments.map((segment) => segment.label)}
    selectedIndex={Math.max(0, segments.findIndex((segment) => segment.value === value))}
    appearance={theme.mode === "light" || theme.mode === "lightContrast" ? "light" : "dark"}
    onChange={(event) => { const next = segments[event.nativeEvent.selectedSegmentIndex]; if (next) onValueChange(next.value); }}
    style={{ height: 36 }} />;
}
