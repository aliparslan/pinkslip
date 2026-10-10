import type { ReactNode } from "react";
import { Modal, ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Heading } from "./Heading";
import { IconButton } from "./IconButton";
import { Text } from "./Text";
import { X } from "phosphor-react-native";

/** A native page sheet (swipe down to close) with a title, a close button,
 * a scrolling body and an optional pinned footer. */
export function Sheet({ open, onOpenChange, title, subtitle, footer, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onOpenChange(false)}>
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Heading variant="display-sm">{title}</Heading>
          {subtitle ? <Text size="sm" tone="ink-3">{subtitle}</Text> : null}
        </View>
        <IconButton icon={X} label="Close" onPress={() => onOpenChange(false)} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">{children}</ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors["bg-elev"] },
  header: { flexDirection: "row", alignItems: "flex-start", gap: theme.space["3"], paddingHorizontal: theme.gutter, paddingTop: theme.space["5"], paddingBottom: theme.space["3"] },
  titles: { flex: 1, gap: 2 },
  body: { padding: theme.gutter, paddingTop: theme.space["2"], gap: theme.space["6"], paddingBottom: theme.space["10"] },
  footer: { paddingHorizontal: theme.gutter, paddingTop: theme.space["3"], paddingBottom: rt.insets.bottom + theme.space["3"], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.line },
}));
