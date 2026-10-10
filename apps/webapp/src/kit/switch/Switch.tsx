import { Switch as BaseSwitch } from "@base-ui/react/switch";
import styles from "./Switch.module.css";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name. Rows show the same text visibly beside the switch. */
  label: string;
  /** `accent` keeps the pink track on phones, for screens where the switch
   * is the main control (notification settings). */
  tone?: "default" | "accent";
  disabled?: boolean;
  name?: string;
}

export function Switch({ checked, onCheckedChange, label, tone = "default", disabled, name }: SwitchProps) {
  return <BaseSwitch.Root
    className={styles.root}
    data-tone={tone}
    checked={checked}
    onCheckedChange={(next) => onCheckedChange(next)}
    aria-label={label}
    disabled={disabled}
    name={name}
  >
    <BaseSwitch.Thumb className={styles.thumb} />
  </BaseSwitch.Root>;
}
