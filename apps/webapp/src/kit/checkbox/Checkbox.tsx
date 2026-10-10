import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { useId, type ReactNode } from "react";
import { Check } from "@phosphor-icons/react";
import styles from "./Checkbox.module.css";

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label; the whole row toggles the box. */
  children: ReactNode;
  disabled?: boolean;
  name?: string;
}

export function Checkbox({ checked, onCheckedChange, children, disabled, name }: CheckboxProps) {
  // Base UI's checkbox is a span with role="checkbox", which a wrapping
  // <label> doesn't name, so point it at the text explicitly.
  const labelId = useId();
  return <label className={styles.label}>
    <BaseCheckbox.Root
      className={styles.box}
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      disabled={disabled}
      name={name}
      aria-labelledby={labelId}
    >
      <BaseCheckbox.Indicator className={styles.check}>
        <Check size={14} weight="bold" aria-hidden focusable="false" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
    <span id={labelId}>{children}</span>
  </label>;
}

/** The checkbox's box alone, for rows whose own role carries the checked
 * state (menu checkbox items, multi-select filter options). */
export function SelectCheck({ checked }: { checked: boolean }) {
  return <span className={styles.box} data-checked={checked || undefined} aria-hidden>
    {checked && <span className={styles.check}><Check size={14} weight="bold" /></span>}
  </span>;
}
