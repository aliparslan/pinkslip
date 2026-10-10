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

/** The system menu (UIMenu) around a trigger; tap opens it. */
export function Menu({ items, title, children }: { items: ReadonlyArray<MenuItem | false | null | undefined>; title?: string; children: ReactNode }) {
  const actions = items.filter((item): item is MenuItem => Boolean(item));
  return <MenuView title={title} shouldOpenOnLongPress={false}
    actions={actions.map((item) => ({ id: item.id, title: item.title, image: item.icon, attributes: { destructive: item.destructive, disabled: item.disabled } }))}
    onPressAction={({ nativeEvent }) => actions.find((item) => item.id === nativeEvent.event)?.onSelect()}>
    {children}
  </MenuView>;
}
