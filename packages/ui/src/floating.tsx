import { Popover as BasePopover } from "@base-ui/react/popover";
import { PreviewCard as BasePreviewCard } from "@base-ui/react/preview-card";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn, styled } from "./lib/cn";
import { surface } from "./lib/surface";

export const Popover = {
  Root: BasePopover.Root,
  Trigger: BasePopover.Trigger,
  Portal: BasePopover.Portal,
  Positioner: styled(BasePopover.Positioner, "z-50 outline-none", "Popover.Positioner"),
  Popup: styled(BasePopover.Popup, cn(surface, "motion-pop w-[min(20rem,calc(100vw-2rem))] p-4"), "Popover.Popup"),
  Title: styled(BasePopover.Title, "text-ui font-semibold text-ink", "Popover.Title"),
  Description: styled(BasePopover.Description, "text-meta text-ink-2", "Popover.Description"),
  Close: BasePopover.Close,
};

/** Short labels for icon-only controls. Inverted so they never read as content. */
export const Tooltip = {
  Provider: BaseTooltip.Provider,
  Root: BaseTooltip.Root,
  Trigger: BaseTooltip.Trigger,
  Portal: BaseTooltip.Portal,
  Positioner: styled(BaseTooltip.Positioner, "z-50 outline-none", "Tooltip.Positioner"),
  Popup: styled(
    BaseTooltip.Popup,
    "ps-tooltip motion-pop rounded-item px-2 py-1 text-meta",
    "Tooltip.Popup",
  ),
};

/** A peek at what a link leads to, shown on hover. */
export const PreviewCard = {
  Root: BasePreviewCard.Root,
  Trigger: BasePreviewCard.Trigger,
  Portal: BasePreviewCard.Portal,
  Positioner: styled(BasePreviewCard.Positioner, "z-50 outline-none", "PreviewCard.Positioner"),
  Popup: styled(BasePreviewCard.Popup, cn(surface, "motion-pop w-[min(20rem,calc(100vw-2rem))] p-4"), "PreviewCard.Popup"),
};
