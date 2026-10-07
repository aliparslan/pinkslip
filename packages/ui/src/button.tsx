import { Button as BaseButton } from "@base-ui/react/button";
import { cn, mergeClassName } from "./lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

/* Layout lives here; fill, border, gradient, and shadow come from the skin
   (styles/skin.css). */
const base =
  "ps-btn ps-press inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium focus-ring data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45";

const variants: Record<ButtonVariant, string> = {
  primary: "ps-btn--primary",
  secondary: "ps-btn--secondary",
  ghost: "ps-btn--ghost",
  danger: "ps-btn--secondary ps-btn--danger",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-control-sm px-3 text-meta",
  md: "h-control px-4 text-ui",
  lg: "h-control-lg px-5 text-body",
  icon: "size-control text-ui",
  "icon-sm": "size-control-sm text-meta",
};

export function buttonClass({
  variant = "secondary",
  size = "md",
}: { variant?: ButtonVariant; size?: ButtonSize } = {}) {
  return cn(base, variants[variant], sizes[size]);
}

export interface ButtonProps extends BaseButton.Props {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <BaseButton {...props} className={mergeClassName(buttonClass({ variant, size }), className)} />;
}
