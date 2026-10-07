import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import { Separator as BaseSeparator } from "@base-ui/react/separator";
import { styled } from "./lib/cn";

/** Company marks are squared off; people would be round. */
export const Avatar = {
  Root: styled(
    BaseAvatar.Root,
    "ps-avatar inline-flex size-10 shrink-0 select-none items-center justify-center overflow-hidden rounded-control align-middle",
    "Avatar.Root",
  ),
  Image: styled(BaseAvatar.Image, "size-full object-cover", "Avatar.Image"),
  Fallback: styled(BaseAvatar.Fallback, "font-heading text-ui", "Avatar.Fallback"),
};

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
