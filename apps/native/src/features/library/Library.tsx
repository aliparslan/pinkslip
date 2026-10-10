import { useState } from "react";
import { Screen, SegmentedControl, Text } from "../../kit";

/** 6-A scaffold; 6.6 builds the lists. */
export function Library({ initialView }: { initialView: "saved" | "applied" }) {
  const [view, setView] = useState(initialView);
  return <Screen>
    <SegmentedControl segments={[{ value: "saved", label: "Saved" }, { value: "applied", label: "Applied" }]} value={view} onValueChange={setView} />
    <Text tone="ink-3">{view === "saved" ? "Saved jobs" : "Applied jobs"}</Text>
  </Screen>;
}
