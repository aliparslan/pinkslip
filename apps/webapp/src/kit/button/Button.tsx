import { Button as BaseButton } from "@base-ui/react/button";
import type { AnchorHTMLAttributes, MouseEventHandler, ReactNode, Ref } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Spinner } from "../spinner/Spinner";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "default" | "compact";

interface ButtonLookProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Leading icon, drawn at the label's size. */
  icon?: PhosphorIcon;
}

export interface ButtonProps extends ButtonLookProps {
  type?: "button" | "submit";
  disabled?: boolean;
  /** Disables the button and swaps the icon for a spinner while the action
   * runs. The button stays focusable so focus isn't lost mid-submit. */
  pending?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  form?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

function iconSize(size: ButtonSize) {
  return size === "compact" ? 16 : 18;
}

function Leading({ icon: Glyph, size, pending }: { icon?: PhosphorIcon; size: ButtonSize; pending?: boolean }) {
  if (pending) return <Spinner size={size === "compact" ? 14 : 16} />;
  return Glyph ? <Glyph size={iconSize(size)} weight="bold" aria-hidden focusable="false" /> : null;
}

/** The app's text button. `primary` is the pink call to action. */
export function Button({
  variant = "primary", size = "default", fullWidth, icon, type = "button", disabled, pending, children, ...rest
}: ButtonProps) {
  return <BaseButton
    {...rest}
    type={type}
    disabled={disabled || pending}
    focusableWhenDisabled={pending}
    aria-busy={pending || undefined}
    className={styles.root}
    data-variant={variant}
    data-size={size}
    data-full-width={fullWidth || undefined}
  >
    <Leading icon={icon} size={size} pending={pending} />
    {children}
  </BaseButton>;
}

type ButtonAnchorProps = ButtonLookProps & AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement> };

export function ButtonAnchor({ variant = "secondary", size = "default", fullWidth, icon, children, ...rest }: ButtonAnchorProps) {
  return <a
    {...rest}
    className={styles.root}
    data-variant={variant}
    data-size={size}
    data-full-width={fullWidth || undefined}
  >
    <Leading icon={icon} size={size} />
    {children}
  </a>;
}
