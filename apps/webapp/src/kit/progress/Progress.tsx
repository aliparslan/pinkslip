import { Progress as BaseProgress } from "@base-ui/react/progress";
import styles from "./Progress.module.css";

export interface ProgressProps {
  /** Accessible name, e.g. "Setup progress". */
  label: string;
  value: number;
  max: number;
  /** `steps` draws one segment per step (onboarding); `bar` is a thin
   * continuous track (usage meters). */
  variant?: "bar" | "steps";
  /** Read out instead of the percentage, e.g. "Step 2 of 4". */
  valueText?: string;
}

export function Progress({ label, value, max, variant = "bar", valueText }: ProgressProps) {
  return <BaseProgress.Root
    className={styles.root}
    data-variant={variant}
    value={value}
    min={0}
    max={max}
    aria-label={label}
    getAriaValueText={valueText ? () => valueText : undefined}
  >
    {variant === "bar"
      ? <BaseProgress.Track className={styles.track}><BaseProgress.Indicator className={styles.indicator} /></BaseProgress.Track>
      : Array.from({ length: max }, (_, index) =>
        <span key={index} className={styles.step} data-active={index < value || undefined} aria-hidden />)}
  </BaseProgress.Root>;
}
