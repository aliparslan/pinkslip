import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import type { ReactNode } from "react";

type SFSymbol = Extract<MenuAction["image"], string>;

export interface MenuItem {
  id: string;
  title: string;
  /** An SF Symbol, as system menus use. */
  icon?: SFSymbol;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** The system menu (UIMenu) around a trigger. A tap opens it, or a long
 * press (`openOn="longPress"`) for context menus on rows that also navigate. */
export function Menu({ items, title, openOn = "press", fill, children }: {
  items: ReadonlyArray<MenuItem | false | null | undefined>;
  title?: string;
  openOn?: "press" | "longPress";
  /** Stretch to the container's width (field-shaped triggers, rows). */
  fill?: boolean;
  children: ReactNode;
}) {
  const actions = items.filter((item): item is MenuItem => Boolean(item));
  return <MenuView title={title} shouldOpenOnLongPress={openOn === "longPress"} style={fill ? { alignSelf: "stretch" } : undefined}
    actions={actions.map((item) => ({ id: item.id, title: item.title, image: item.icon, attributes: { destructive: item.destructive, disabled: item.disabled } }))}
    onPressAction={({ nativeEvent }) => actions.find((item) => item.id === nativeEvent.event)?.onSelect()}>
    {children}
  </MenuView>;
}
