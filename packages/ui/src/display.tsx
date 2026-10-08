import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import { Separator as BaseSeparator } from "@base-ui/react/separator";
import type { ComponentProps } from "react";
import { cn, mergeClassName, styled } from "./lib/cn";

export type AvatarSize = "sm" | "md" | "lg";

/* Company marks are squared off; people would be round. Corners grow with
   the mark so a small one doesn't read as a circle and a large one doesn't
   read as a tile. */
const avatarSizes: Record<AvatarSize, string> = {
  sm: "size-6 rounded-mark text-caption",
  md: "size-10 rounded-control text-ui",
  lg: "size-14 rounded-surface text-lead",
};

function AvatarRoot({ size = "md", className, ...props }: BaseAvatar.Root.Props & { size?: AvatarSize }) {
  return (
    <BaseAvatar.Root
      {...props}
      className={mergeClassName(
        cn("ps-avatar inline-flex shrink-0 select-none items-center justify-center overflow-hidden align-middle", avatarSizes[size]),
        className,
      )}
    />
  );
}

export const Avatar = {
  Root: AvatarRoot,
  Image: styled(BaseAvatar.Image, "size-full object-cover", "Avatar.Image"),
  Fallback: styled(BaseAvatar.Fallback, "font-heading", "Avatar.Fallback"),
};

export type BadgeTone = "neutral" | "accent" | "good" | "warn" | "bad";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "",
  accent: "ps-badge--accent",
  good: "ps-badge--good",
  warn: "ps-badge--warn",
  bad: "ps-badge--bad",
};

/** A short status or fact attached to something: Closed, Evergreen,
 * Sponsorship available, Hidden. Never an action. */
export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      {...props}
      className={cn(
        "ps-badge inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-mark px-1.5 text-caption font-medium",
        badgeTones[tone],
        className,
      )}
    />
  );
}

export const Separator = styled(
  BaseSeparator,
  "shrink-0 bg-line data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
  "Separator",
);

export const ScrollArea = {
  Root: styled(BaseScrollArea.Root, "relative overflow-hidden", "ScrollArea.Root"),
  Viewport: styled(BaseScrollArea.Viewport, "h-full overscroll-contain outline-none focus-ring", "ScrollArea.Viewport"),
  Content: BaseScrollArea.Content,
  Scrollbar: styled(
    BaseScrollArea.Scrollbar,
    "m-1 flex w-1 justify-center rounded-pill opacity-0 transition-opacity data-[hovering]:opacity-100 data-[scrolling]:opacity-100",
    "ScrollArea.Scrollbar",
  ),
  Thumb: styled(BaseScrollArea.Thumb, "w-full rounded-pill bg-line-2", "ScrollArea.Thumb"),
};
