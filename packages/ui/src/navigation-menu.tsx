import { NavigationMenu as BaseNavigationMenu } from "@base-ui/react/navigation-menu";
import { cn, styled } from "./lib/cn";
import { surface } from "./lib/surface";

/** Site navigation with panels that morph between triggers. For the public
 * web pages; the app itself uses tabs. */
export const NavigationMenu = {
  Root: styled(BaseNavigationMenu.Root, "relative", "NavigationMenu.Root"),
  List: styled(BaseNavigationMenu.List, "flex items-center gap-0.5", "NavigationMenu.List"),
  Item: BaseNavigationMenu.Item,
  Trigger: styled(
    BaseNavigationMenu.Trigger,
    "ps-bar-btn inline-flex h-control-sm cursor-pointer select-none items-center gap-1 rounded-inset px-3 text-meta font-medium focus-ring",
    "NavigationMenu.Trigger",
  ),
  Icon: styled(
    BaseNavigationMenu.Icon,
    "motion-turn flex text-ink-3 data-[popup-open]:rotate-180",
    "NavigationMenu.Icon",
  ),
  Content: styled(
    BaseNavigationMenu.Content,
    "motion-fade w-[min(28rem,calc(100vw-2rem))] p-2",
    "NavigationMenu.Content",
  ),
  Link: styled(
    BaseNavigationMenu.Link,
    "flex flex-col gap-0.5 rounded-item p-3 text-ink outline-none transition-colors hover:bg-control focus-visible:bg-control",
    "NavigationMenu.Link",
  ),
  Portal: BaseNavigationMenu.Portal,
  Positioner: styled(
    BaseNavigationMenu.Positioner,
    "z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom] dur-slow ease-out",
    "NavigationMenu.Positioner",
  ),
  Popup: styled(
    BaseNavigationMenu.Popup,
    cn(
      surface,
      "relative h-(--popup-height) w-(--popup-width) origin-(--transform-origin) transition-[opacity,scale,width,height] dur-slow ease-out data-[starting-style]:scale-96 data-[starting-style]:opacity-0 data-[ending-style]:scale-96 data-[ending-style]:opacity-0",
    ),
    "NavigationMenu.Popup",
  ),
  Viewport: styled(BaseNavigationMenu.Viewport, "relative h-full w-full overflow-hidden", "NavigationMenu.Viewport"),
};
