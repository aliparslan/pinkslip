import { Button, ControlGroup, Host, Image, Label, Menu, RNHostView, Section } from "@expo/ui/swift-ui";
import { accessibilityLabel, controlSize } from "@expo/ui/swift-ui/modifiers";
import { Icon as RouterIcon, Label as RouterLabel, Link } from "expo-router";
import * as Updates from "expo-updates";
import type { ReactNode } from "react";

/** The build before the menu icons (TestFlight 1.3.4) has no `menu-*`
 * images, so its menus keep their words and no icons until it's replaced. */
const BUILD_WITHOUT_ICONS = "54e998eaf68938f6142e50cf6b1ec7c2be997c89";
export const menuIconsAvailable = Updates.runtimeVersion !== BUILD_WITHOUT_ICONS;

/**
 * Phosphor icons for iOS's own menus (owner, 2026-10-16, Paper "Menus ·
 * Oct 16"). They're template images in the app's asset catalog
 * (`ios/Pinkslip/Images.xcassets/menu-*`, drawn at the kit's line), so iOS
 * tints them like its own and they follow dark mode. A new one needs a
 * native build.
 */
export type MenuGlyph =
  | "save" | "saved" | "applied" | "undo" | "read" | "unread" | "hide" | "block"
  | "email" | "tailor" | "company" | "report" | "move" | "remove" | "date" | "open" | "share";

/** The asset catalog name for a menu icon. */
export const menuAsset = (glyph: MenuGlyph) => `menu-${glyph}`;

export interface GlyphMenuItem {
  id: string;
  title: string;
  glyph: MenuGlyph;
  destructive?: boolean;
  onSelect: () => void;
}

/** A menu's three groups: icons only across the top, then rows, then a last group. */
export interface GlyphMenuSpec {
  top?: GlyphMenuItem[];
  items: GlyphMenuItem[];
  last?: GlyphMenuItem[];
}

/**
 * The menu a tap opens (the job page's ⋯, M2): `top` is a row of icons
 * without words (Save and Hide), then `items` with an icon each, then `last`
 * in a group of its own (Block). The trigger is the children.
 */
export function GlyphMenu({ top = [], items, last = [], children }: GlyphMenuSpec & { children: ReactNode }) {
  const button = (item: GlyphMenuItem) => <Button key={item.id} role={item.destructive ? "destructive" : undefined} onPress={item.onSelect}>
    <Label title={item.title} icon={<Image assetName={menuAsset(item.glyph)} />} />
  </Button>;
  if (!menuIconsAvailable) {
    return <Host matchContents ignoreSafeArea="all">
      <Menu label={<RNHostView matchContents><>{children}</></RNHostView>}>
        {[...top, ...items].map((item) => <Button key={item.id} label={item.title} onPress={item.onSelect} />)}
        {last.length > 0 ? <Section>{last.map((item) => <Button key={item.id} label={item.title} role={item.destructive ? "destructive" : undefined} onPress={item.onSelect} />)}</Section> : null}
      </Menu>
    </Host>;
  }
  // The top row is icons alone; VoiceOver still hears the name.
  const iconButton = (item: GlyphMenuItem) => <Button key={item.id} onPress={item.onSelect} modifiers={[accessibilityLabel(item.title)]}>
    <Image assetName={menuAsset(item.glyph)} />
  </Button>;
  return <Host matchContents ignoreSafeArea="all">
    <Menu label={<RNHostView matchContents><>{children}</></RNHostView>}>
      {top.length > 0 ? <ControlGroup modifiers={[controlSize("small")]}>{top.map(iconButton)}</ControlGroup> : null}
      {items.map(button)}
      {last.length > 0 ? <Section>{last.map(button)}</Section> : null}
    </Menu>
  </Host>;
}

/** An item in a long-press menu (`Link.Menu`, M1) with its icon. A
 * function, not a component: `Link.Menu` keeps only its own item elements. */
export function glyphMenuAction(item: GlyphMenuItem, isOn?: boolean) {
  return <Link.MenuAction key={item.id} destructive={item.destructive} isOn={isOn} onPress={item.onSelect} imageRenderingMode="template">
    {menuIconsAvailable ? <RouterIcon xcasset={menuAsset(item.glyph)} /> : null}
    <RouterLabel>{item.title}</RouterLabel>
  </Link.MenuAction>;
}
