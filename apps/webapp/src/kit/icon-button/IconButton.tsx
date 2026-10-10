import { Button as BaseButton } from "@base-ui/react/button";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { IconSize } from "../icon/Icon";
import { Tooltip } from "../tooltip/Tooltip";
import styles from "./IconButton.module.css";

export type IconButtonSize = "default" | "sm" | "xs";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "children" | "type" | "aria-label"> {
  icon: PhosphorIcon;
  /** Required: the button has no visible text. */
  label: string;
  /** Also show the label as a hover tooltip (desktop only). */
  tooltip?: boolean;
  size?: IconButtonSize;
  /** Bordered, elevated background for buttons that float over content. */
  surface?: boolean;
  /** Toggle buttons (save, follow): accent color and a filled icon when on. */
  pressed?: boolean;
  iconSize?: IconSize;
  type?: "button" | "submit";
  ref?: Ref<HTMLButtonElement>;
}

const defaultIconSize: Record<IconButtonSize, IconSize> = { default: 20, sm: 18, xs: 16 };

/** Props pass through so the button can be a menu, popover or tooltip trigger. */
export function IconButton({
  icon: Glyph, label, tooltip, size = "default", surface, pressed, iconSize, type = "button", ...rest
}: IconButtonProps) {
  const button = <BaseButton
    {...rest}
    type={type}
    aria-label={label}
    aria-pressed={pressed}
    className={styles.root}
    data-size={size}
    data-surface={surface || undefined}
    data-pressed={pressed || undefined}
  >
    <Glyph size={iconSize ?? defaultIconSize[size]} weight={pressed ? "fill" : "bold"} aria-hidden focusable="false" />
  </BaseButton>;
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}

export interface IconButtonAnchorProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "style" | "children" | "aria-label"> {
  icon: PhosphorIcon;
  label: string;
  size?: IconButtonSize;
  iconSize?: IconSize;
  /** `strong` draws the icon in full ink, for primary navigation like Back. */
  tone?: "default" | "strong";
  ref?: Ref<HTMLAnchorElement>;
}

/** An icon-only link with the icon button's look (the screen bar's Back). */
export function IconButtonAnchor({ icon: Glyph, label, size = "default", iconSize, tone = "default", ...rest }: IconButtonAnchorProps) {
  return <a {...rest} aria-label={label} className={styles.root} data-size={size} data-tone={tone}>
    <Glyph size={iconSize ?? defaultIconSize[size]} weight="bold" aria-hidden focusable="false" />
  </a>;
}
