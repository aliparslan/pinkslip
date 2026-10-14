import { useSession } from "@pinkslip/data";
import * as WebBrowser from "expo-web-browser";
import { ArrowSquareOut, LockSimple, WarningCircle } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, EmptyState, Inline, Spinner, Stack, Text } from "../../kit";

/** Admin screens render only for an admin session; anyone else who lands on
 * one (a stale link) sees why instead of an empty page. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.isPending) return <Centered><Spinner label="Loading" /></Centered>;
  if (!session.data?.me?.is_admin) return <Centered><EmptyState icon={LockSimple} title="Admin only" message="Sign in with an admin account to use these tools." /></Centered>;
  return <>{children}</>;
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

/** A section title with an optional count on the right. */
export function SectionHead({ title, count }: { title: string; count?: string }) {
  return <Inline justify="between">
    <Text size="xs" weight="semibold" tone="ink-4">{title}</Text>
    {count ? <Text size="xs" tone="ink-4">{count}</Text> : null}
  </Inline>;
}

/** One inbox-style entry: content above a row of actions. */
export function Entry({ children }: { children: ReactNode }) {
  return <View style={styles.entry}><Stack gap="2">{children}</Stack></View>;
}

/** Entries stacked in one grouped surface, with an empty message. */
export function Entries({ empty, children }: { empty: string; children: ReactNode[] }) {
  if (children.length === 0) return <View style={styles.group}><Text size="sm" tone="ink-3">{empty}</Text></View>;
  return <View style={styles.list}>
    {children.map((child, index) => <View key={index}>{index > 0 && <View style={styles.separator} />}{child}</View>)}
  </View>;
}

export function Actions({ children }: { children: ReactNode }) {
  return <Inline gap="2" justify="end" wrap>{children}</Inline>;
}

/** Opens an outside page in the in-app browser sheet, so admin work stays in
 * the app. `app` hands the link to the system instead, so a LinkedIn profile
 * opens in the LinkedIn app, where the admin is signed in. */
export function LinkOut({ label, href, app }: { label: string; href: string; app?: boolean }) {
  const { theme } = useUnistyles();
  return <Pressable accessibilityRole="link" accessibilityLabel={label} hitSlop={8} style={styles.link}
    onPress={() => void (app
      ? Linking.openURL(href)
      : WebBrowser.openBrowserAsync(href, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, controlsColor: theme.colors.accent }))}>
    <ArrowSquareOut size={15} color={theme.colors.accent} />
    <Text size="sm" tone="accent">{label}</Text>
  </Pressable>;
}

export function Failure({ title, onRetry, retrying }: { title: string; onRetry: () => void; retrying?: boolean }) {
  return <EmptyState icon={WarningCircle} title={title} message="Check your connection and try again."
    actions={<Button pending={retrying} onPress={onRetry}>Try again</Button>} />;
}

const styles = StyleSheet.create((theme) => ({
  center: { flex: 1, justifyContent: "center", backgroundColor: theme.colors.bg },
  group: { padding: theme.space["4"], borderRadius: theme.radius.lg, borderCurve: "continuous", backgroundColor: theme.colors["bg-elev"] },
  list: { borderRadius: theme.radius.lg, borderCurve: "continuous", backgroundColor: theme.colors["bg-elev"], overflow: "hidden" },
  entry: { padding: theme.space["4"] },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: theme.space["4"], backgroundColor: theme.colors.line },
  link: { flexDirection: "row", alignItems: "center", gap: theme.space["1"], alignSelf: "flex-start", minHeight: 32 },
}));
