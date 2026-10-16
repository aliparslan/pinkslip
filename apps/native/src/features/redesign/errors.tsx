import { ApiError } from "@pinkslip/core/api";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { EmptyState, Icon, StampedSlip, Text } from "../../ui";

/**
 * Error screens and states (owner, 2026-10-15, Paper "Errors · Oct 15";
 * design-system.md, "Empty and error states"): only a screen with nothing on
 * it becomes an error screen; with things on screen, keep them and say only
 * what failed, where. What happened, then the fix; never "we".
 */

/** The phone has no connection: the request never reached Pinkslip. */
export function isOffline(error: unknown): boolean {
  if (error instanceof ApiError) return error.code === "network_unavailable";
  return error instanceof TypeError && /network/i.test(error.message);
}

/** Pinkslip answered, but with its own trouble (a 5xx). */
export function isDown(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 500 && error.code !== "network_unavailable";
}

/** While offline, try again every few seconds, so a screen with no button
 * loads by itself once the connection is back. */
export function useRetryWhileOffline(offline: boolean, retry: () => void, every = 5000) {
  // The latest retry, so a re-render doesn't restart the clock.
  const latest = useRef(retry);
  latest.current = retry;
  useEffect(() => {
    if (!offline) return;
    const timer = setInterval(() => latest.current(), every);
    return () => clearInterval(timer);
  }, [offline, every]);
}

/** Launch couldn't reach Pinkslip (W5, and W1's offline at launch). */
export function LaunchFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const offline = isOffline(error);
  useRetryWhileOffline(offline, onRetry);
  return <View style={styles.launch}>
    {offline
      ? <EmptyState title="You're offline" message="Pinkslip opens when you're back." />
      : <EmptyState art={<StampedSlip stacked stamp="BACK SOON" detail="ON IT" />}
        title="Pinkslip is down for a bit" message="Your jobs and applications are safe."
        action={{ label: "Try again", variant: "secondary", onPress: onRetry }} />}
  </View>;
}

/** P1: offline with things already on screen, beside the large title. */
export function OfflinePill() {
  return <View style={styles.pill} accessibilityLabel="Offline">
    <Icon name="offline" size={16} tone="ink-2" />
    <Text role="footnote" weight="medium" tone="ink-2">Offline</Text>
  </View>;
}

/** P3: the next page didn't load, at the list's end. */
export function LoadMoreFailed({ onRetry }: { onRetry: () => void }) {
  return <View style={styles.more}>
    <Text role="subhead" tone="ink-3">Couldn't load more</Text>
    <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
      <Text role="subhead" weight="medium">Try again</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  launch: { flex: 1, justifyContent: "center", paddingBottom: 64, backgroundColor: theme.ui.color.bg },
  pill: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.ui.space["1"],
    paddingHorizontal: theme.ui.space["3"],
    borderRadius: theme.ui.radius.full,
    backgroundColor: theme.ui.color.fill,
  },
  more: { flexDirection: "row", justifyContent: "center", gap: theme.ui.space["2"], paddingVertical: theme.ui.space["6"] },
  pressed: { opacity: 0.6 },
}));
