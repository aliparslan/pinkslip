import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Floating, TopEdgeFade } from "./Floating";
import { Icon, type IconName } from "./Icon";

/** The bar's own height under the status bar: a 44 button. A page's content
 * starts `insets.top + PAGE_BAR + 8` down, so its title sits 8 under Back. */
export const PAGE_BAR = 44;

/**
 * Every pushed page's top (owner, 2026-10-19, option A in
 * `consistency-audit-2026-10-19.md`): Back on the left and the page's actions
 * on the right, pinned and floating in glass over the page, which fades out
 * under them. The page's title stays big in the page and scrolls away; the
 * bar has no title of its own (owner: less text). Swipe-back still works:
 * the stack is the system's.
 */
export function PageBar({ actions, onBack }: { actions?: ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return <>
    <TopEdgeFade height={insets.top + PAGE_BAR + 12} />
    <View style={[styles.bar, { paddingTop: insets.top }]} pointerEvents="box-none">
      <PageBarButton icon="back" label="Back" onPress={onBack ?? (() => router.back())} />
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  </>;
}

/** One round floating action in the bar (refresh, add, share). Two that go
 * together (share and ⋯) share a `Floating` pill of `PageBarSlot`s. */
export function PageBarButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Floating><PageBarSlot icon={icon} label={label} onPress={onPress} /></Floating>;
}

export function PageBarSlot({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.slot}>
    <Icon name={icon} size={icon === "more" ? 22 : 20} />
  </Pressable>;
}

/** A quiet word in the bar that isn't a button ("3 of 12"), on its own glass. */
export function PageBarNote({ children }: { children: ReactNode }) {
  return <Floating style={styles.note}>{children}</Floating>;
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.ui.size.gutter,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  slot: { width: theme.ui.size.iconButton, height: theme.ui.size.iconButton, alignItems: "center", justifyContent: "center" },
  note: { height: theme.ui.size.iconButton, justifyContent: "center", paddingHorizontal: theme.ui.space["4"] },
}));
