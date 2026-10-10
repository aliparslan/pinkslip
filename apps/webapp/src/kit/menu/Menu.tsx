import { Menu as BaseMenu } from "@base-ui/react/menu";
import { useId, type ReactNode } from "react";
import { CaretDown, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { SelectCheck } from "../checkbox/Checkbox";
import { cx } from "../cx";
import type { IconSize } from "../icon/Icon";
import type { IconButtonSize } from "../icon-button/IconButton";
import iconButtonStyles from "../icon-button/IconButton.module.css";
import styles from "./Menu.module.css";

interface IconTrigger {
  icon: PhosphorIcon;
  /** Accessible name, e.g. "Actions for Frontend Engineer at Stripe". */
  label: string;
  size?: IconButtonSize;
  iconSize?: IconSize;
}

interface FieldTrigger {
  /** The current selection summary, shown like a select's value. */
  value?: string;
  placeholder: string;
  /** Id of the visible label; the trigger is named by it plus its value. */
  labelledBy?: string;
}

export interface MenuProps {
  trigger: IconTrigger | FieldTrigger;
  align?: "start" | "center" | "end";
  disabled?: boolean;
  /** Accessible name for the open menu. */
  label?: string;
  children: ReactNode;
}

function isIconTrigger(trigger: IconTrigger | FieldTrigger): trigger is IconTrigger {
  return "icon" in trigger;
}

/** A dropdown of actions or toggles, opened from an icon button (row
 * actions) or a select-style field (multi-select preferences). */
export function Menu({ trigger, align = "end", disabled, label, children }: MenuProps) {
  const valueId = useId();
  const field = !isIconTrigger(trigger);
  return <BaseMenu.Root>
    {isIconTrigger(trigger)
      ? <BaseMenu.Trigger className={iconButtonStyles.root} data-size={trigger.size ?? "default"} aria-label={trigger.label} disabled={disabled}>
        <trigger.icon size={trigger.iconSize ?? (trigger.size === "default" || !trigger.size ? 22 : 18)} weight="bold" aria-hidden focusable="false" />
      </BaseMenu.Trigger>
      : <BaseMenu.Trigger
        className={styles.fieldTrigger}
        disabled={disabled}
        aria-labelledby={trigger.labelledBy ? `${trigger.labelledBy} ${valueId}` : undefined}
      >
        <span id={valueId} className={styles.fieldValue} data-placeholder={trigger.value ? undefined : true}>
          {trigger.value || trigger.placeholder}
        </span>
        <span className={styles.chevron} aria-hidden><CaretDown size={15} weight="bold" /></span>
      </BaseMenu.Trigger>}
    <BaseMenu.Portal>
      <BaseMenu.Positioner className={styles.positioner} side="bottom" align={align} sideOffset={6} collisionPadding={12} positionMethod="fixed">
        <BaseMenu.Popup className={styles.popup} data-variant={field ? "field" : "actions"} aria-label={label}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  </BaseMenu.Root>;
}

export interface MenuItemProps {
  icon?: PhosphorIcon;
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}

export function MenuItem({ icon: Glyph, tone = "default", disabled, onSelect, children }: MenuItemProps) {
  return <BaseMenu.Item className={styles.item} data-tone={tone} disabled={disabled} onClick={onSelect}>
    {Glyph && <Glyph size={17} aria-hidden focusable="false" />}
    <span>{children}</span>
  </BaseMenu.Item>;
}

export interface MenuCheckboxItemProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}

/** A toggle row that keeps the menu open, so several can be picked. */
export function MenuCheckboxItem({ checked, onCheckedChange, disabled, children }: MenuCheckboxItemProps) {
  return <BaseMenu.CheckboxItem
    className={cx(styles.item, styles.checkItem)}
    checked={checked}
    onCheckedChange={(next) => onCheckedChange(next)}
    disabled={disabled}
    closeOnClick={false}
  >
    <span>{children}</span>
    <SelectCheck checked={checked} />
  </BaseMenu.CheckboxItem>;
}

export function MenuSeparator() {
  return <BaseMenu.Separator className={styles.separator} />;
}
