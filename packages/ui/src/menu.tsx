import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Menubar as BaseMenubar } from "@base-ui/react/menubar";
import { cn, styled } from "./lib/cn";
import { checkItem, groupLabel, item, itemIndicator, separator, surface } from "./lib/surface";

const popup = cn(surface, "motion-pop min-w-52 p-1");
const danger = "ps-item--danger";

export const menuItemDanger = danger;

export const Menu = {
  Root: BaseMenu.Root,
  Trigger: BaseMenu.Trigger,
  Portal: BaseMenu.Portal,
  Positioner: styled(BaseMenu.Positioner, "z-50 outline-none", "Menu.Positioner"),
  Popup: styled(BaseMenu.Popup, popup, "Menu.Popup"),
  Item: styled(BaseMenu.Item, item, "Menu.Item"),
  LinkItem: styled(BaseMenu.LinkItem, item, "Menu.LinkItem"),
  Group: BaseMenu.Group,
  GroupLabel: styled(BaseMenu.GroupLabel, groupLabel, "Menu.GroupLabel"),
  Separator: styled(BaseMenu.Separator, separator, "Menu.Separator"),
  CheckboxItem: styled(BaseMenu.CheckboxItem, checkItem, "Menu.CheckboxItem"),
  CheckboxItemIndicator: styled(BaseMenu.CheckboxItemIndicator, itemIndicator, "Menu.CheckboxItemIndicator"),
  RadioGroup: BaseMenu.RadioGroup,
  RadioItem: styled(BaseMenu.RadioItem, checkItem, "Menu.RadioItem"),
  RadioItemIndicator: styled(BaseMenu.RadioItemIndicator, itemIndicator, "Menu.RadioItemIndicator"),
  SubmenuRoot: BaseMenu.SubmenuRoot,
  SubmenuTrigger: styled(
    BaseMenu.SubmenuTrigger,
    cn(item, "justify-between"),
    "Menu.SubmenuTrigger",
  ),
};

/** Right-click on desktop, long-press on touch. Same surface as Menu. */
export const ContextMenu = {
  Root: BaseContextMenu.Root,
  Trigger: BaseContextMenu.Trigger,
  Portal: BaseContextMenu.Portal,
  Positioner: styled(BaseContextMenu.Positioner, "z-50 outline-none", "ContextMenu.Positioner"),
  Popup: styled(BaseContextMenu.Popup, popup, "ContextMenu.Popup"),
  Item: styled(BaseContextMenu.Item, item, "ContextMenu.Item"),
  Separator: styled(BaseContextMenu.Separator, separator, "ContextMenu.Separator"),
  Group: BaseContextMenu.Group,
  GroupLabel: styled(BaseContextMenu.GroupLabel, groupLabel, "ContextMenu.GroupLabel"),
};

export const Menubar = styled(
  BaseMenubar,
  "ps-bar inline-flex items-center gap-0.5 rounded-control p-1",
  "Menubar",
);

/** The top-level trigger inside a Menubar. */
export const MenubarTrigger = styled(
  BaseMenu.Trigger,
  "ps-bar-btn inline-flex h-control-sm cursor-pointer select-none items-center rounded-inset px-3 text-meta font-medium outline-none",
  "MenubarTrigger",
);
