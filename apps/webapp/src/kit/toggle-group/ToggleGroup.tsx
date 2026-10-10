import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./ToggleGroup.module.css";

export interface ToggleOption<Value extends string> {
  value: Value;
  label: ReactNode;
  disabled?: boolean;
}

export interface ToggleGroupProps<Value extends string> {
  /** Accessible name for the group. */
  label: string;
  options: ReadonlyArray<ToggleOption<Value>>;
  value: Value;
  onValueChange: (value: Value) => void;
  /** `chips` wraps pill buttons (feed filters); `segmented` is a compact
   * single-row switcher. */
  variant?: "chips" | "segmented";
}

/** Single choice from a few pressed-state buttons. Pressing the selected
 * option keeps it selected, so there's always a value. */
export function ToggleGroup<Value extends string>({
  label, options, value, onValueChange, variant = "chips",
}: ToggleGroupProps<Value>) {
  return <BaseToggleGroup
    aria-label={label}
    className={styles.root}
    data-variant={variant}
    value={[value]}
    onValueChange={(next) => {
      const chosen = next[0] as Value | undefined;
      if (chosen !== undefined && chosen !== value) onValueChange(chosen);
    }}
  >
    {options.map((option) =>
      <Toggle key={option.value} value={option.value} disabled={option.disabled} className={cx(styles.item, variant === "chips" ? styles.chip : styles.segment)}>
        {option.label}
      </Toggle>)}
  </BaseToggleGroup>;
}
