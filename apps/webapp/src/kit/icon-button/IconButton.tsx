import { Button as BaseButton } from "@base-ui/react/button";
import type { MouseEventHandler } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { IconSize } from "../icon/Icon";
import styles from "./IconButton.module.css";

export type IconButtonSize = "default" | "sm" | "xs";

export interface IconButtonProps {
  icon: PhosphorIcon;
  /** Required: the button has no visible text. */
  label: string;
  size?: IconButtonSize;
  /** Bordered, elevated background for buttons that float over content. */
  surface?: boolean;
  /** Toggle buttons (save, follow): accent color and a filled icon when on. */
  pressed?: boolean;
  iconSize?: IconSize;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

const defaultIconSize: Record<IconButtonSize, IconSize> = { default: 20, sm: 18, xs: 16 };

export function IconButton({
  icon: Glyph, label, size = "default", surface, pressed, iconSize, disabled, type = "button", onClick,
}: IconButtonProps) {
  return <BaseButton
    type={type}
    disabled={disabled}
    onClick={onClick}
    aria-label={label}
    aria-pressed={pressed}
    className={styles.root}
    data-size={size}
    data-surface={surface || undefined}
    data-pressed={pressed || undefined}
  >
    <Glyph size={iconSize ?? defaultIconSize[size]} weight={pressed ? "fill" : "bold"} aria-hidden focusable="false" />
  </BaseButton>;
}
