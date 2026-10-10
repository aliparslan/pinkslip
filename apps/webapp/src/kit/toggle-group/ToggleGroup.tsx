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
  /** Undefined only with `onClear`: nothing chosen yet. */
  value: Value | undefined;
  onValueChange: (value: Value) => void;
  /** Pressing the chosen option again clears it ("unanswered"). Without
   * this, there's always a value. */
  onClear?: () => void;
  /** `chips` wraps pill buttons (feed filters); `segmented` is a compact
   * single-row switcher. */
  variant?: "chips" | "segmented";
}

/** Single choice from a few pressed-state buttons. Pressing the selected
 * option keeps it selected (or clears it, with `onClear`). */
export function ToggleGroup<Value extends string>({
  label, options, value, onValueChange, onClear, variant = "chips",
}: ToggleGroupProps<Value>) {
  return <BaseToggleGroup
    aria-label={label}
    className={styles.root}
    data-variant={variant}
    value={value === undefined ? [] : [value]}
    onValueChange={(next) => {
      const chosen = next[0] as Value | undefined;
      if (chosen === undefined) onClear?.();
      else if (chosen !== value) onValueChange(chosen);
    }}
  >
    {options.map((option) =>
      <Toggle key={option.value} value={option.value} disabled={option.disabled} className={cx(styles.item, variant === "chips" ? styles.chip : styles.segment)}>
        {option.label}
      </Toggle>)}
  </BaseToggleGroup>;
}

export interface MultiToggleGroupProps<Value extends string> {
  label: string;
  options: ReadonlyArray<ToggleOption<Value>>;
  value: readonly Value[];
  onValueChange: (value: Value[]) => void;
  /** Keeps at least this many pressed (the feed's career stages need one). */
  min?: number;
}

/** Several choices as chips, e.g. the feed's career stages. Values come back
 * in the options' order. */
export function MultiToggleGroup<Value extends string>({
  label, options, value, onValueChange, min = 0,
}: MultiToggleGroupProps<Value>) {
  return <BaseToggleGroup
    aria-label={label}
    className={styles.root}
    data-variant="chips"
    multiple
    value={[...value]}
    onValueChange={(next) => {
      if (next.length < min) return;
      onValueChange(options.map((option) => option.value).filter((option) => next.includes(option)));
    }}
  >
    {options.map((option) =>
      <Toggle key={option.value} value={option.value} disabled={option.disabled} className={cx(styles.item, styles.chip)}>
        {option.label}
      </Toggle>)}
  </BaseToggleGroup>;
}
