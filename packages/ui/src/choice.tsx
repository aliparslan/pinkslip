import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { CheckboxGroup as BaseCheckboxGroup } from "@base-ui/react/checkbox-group";
import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps, ReactNode } from "react";
import { CheckIcon, DashIcon } from "./icons";
import { cn, mergeClassName, styled } from "./lib/cn";

/* Checked always means a pink fill with pale ink, across checkbox, radio,
   and switch, so a chosen state reads the same wherever it appears. */

const markBase =
  "ps-mark group inline-flex size-4.5 shrink-0 cursor-pointer items-center justify-center focus-ring data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45";


export function Checkbox({ className, ...props }: BaseCheckbox.Root.Props) {
  return (
    <BaseCheckbox.Root {...props} className={mergeClassName(cn(markBase, "rounded-mark"), className)}>
      <BaseCheckbox.Indicator className="motion-mark flex">
        <CheckIcon size={12} strokeWidth={2.2} className="group-data-[indeterminate]:hidden" />
        <DashIcon size={12} strokeWidth={2.2} className="hidden group-data-[indeterminate]:block" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}

export const CheckboxGroup = styled(BaseCheckboxGroup, "flex flex-col gap-3", "CheckboxGroup");

export function RadioGroup({ className, ...props }: BaseRadioGroup.Props) {
  return <BaseRadioGroup {...props} className={mergeClassName("flex flex-col gap-3", className)} />;
}

export function Radio({ className, ...props }: BaseRadio.Root.Props) {
  return (
    <BaseRadio.Root {...props} className={mergeClassName(cn(markBase, "rounded-pill"), className)}>
      <BaseRadio.Indicator className="motion-mark size-1.5 rounded-pill bg-accent-ink" />
    </BaseRadio.Root>
  );
}

/** A clickable row: control, label, and an optional line of help. */
export function ChoiceLabel({
  control,
  label,
  description,
  className,
  ...props
}: Omit<ComponentProps<"label">, "children"> & { control: ReactNode; label: ReactNode; description?: ReactNode }) {
  return (
    <label {...props} className={cn("flex cursor-pointer items-start gap-3", className)}>
      <span className="flex h-5 items-center">{control}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-ui text-ink">{label}</span>
        {description ? <span className="text-meta text-ink-3">{description}</span> : null}
      </span>
    </label>
  );
}

export function Switch({ className, ...props }: BaseSwitch.Root.Props) {
  return (
    <BaseSwitch.Root
      {...props}
      className={mergeClassName(
        "ps-switch group relative inline-flex h-6.5 w-11 shrink-0 cursor-pointer items-center rounded-pill p-0.75 focus-ring data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
        className,
      )}
    >
      {/* Pressing stretches the thumb toward the middle, the way a fingertip
          flattens it; releasing slides it across. */}
      <BaseSwitch.Thumb className="ps-thumb motion-glide size-5 rounded-pill data-[checked]:translate-x-4.5 group-active:not-data-[disabled]:w-6 data-[checked]:group-active:not-data-[disabled]:translate-x-3.5" />
    </BaseSwitch.Root>
  );
}
