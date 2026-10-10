import { router } from "expo-router";
import { Sparkle, X } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, IconButton, Text } from "../../kit";
import { storage } from "../../platform/storage";

const DISMISSED = "setup-dismissed";

/** Until onboarding is done, the feed offers it; it never blocks browsing. */
export function SetupPrompt() {
  const { theme } = useUnistyles();
  const [dismissed, setDismissed] = useState(() => storage.getBoolean(DISMISSED) === true);
  if (dismissed) return null;
  return <View style={styles.card}>
    <Sparkle size={20} weight="fill" color={theme.colors.accent} />
    <View style={styles.copy}><Text weight="medium">Get jobs that fit you</Text></View>
    <Button variant="primary" size="compact" onPress={() => router.push("/welcome")}>Set up</Button>
    <IconButton icon={X} label="Dismiss" size="sm" iconSize={16} onPress={() => { storage.set(DISMISSED, true); setDismissed(true); }} />
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: "row", alignItems: "center", gap: theme.space["3"], paddingLeft: theme.space["4"], paddingRight: theme.space["2"],
    paddingVertical: theme.space["2"], borderRadius: theme.radius.lg, backgroundColor: theme.colors["accent-soft"],
  },
  copy: { flex: 1 },
}));
