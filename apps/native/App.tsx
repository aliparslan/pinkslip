import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import {
  DataProvider,
  clearPersonalQueries,
  createAppQueryClient,
  queryKeys,
  useJobsList,
  useOwnerChangeCleanup,
  useSession,
} from "@pinkslip/data";
import { color, fontSize, radius, space } from "@pinkslip/tokens/native";
import { initializeSession, rotateSession, type ApiClient } from "./src/session";

export default function App() {
  const [queryClient] = useState(() => createAppQueryClient());
  const [api, setApi] = useState<ApiClient | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    initializeSession()
      .then(setApi)
      .catch((cause) => setStartupError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {api
        ? <DataProvider api={api}><Prototype /></DataProvider>
        : <SafeAreaView style={styles.centered}>
            <ActivityIndicator />
            {startupError ? <Text style={styles.startupError}>{startupError}</Text> : null}
          </SafeAreaView>}
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}

/** Prototype UI (Quarantine): proves session, Query and token wiring, nothing
 * here is a product screen. */
function Prototype() {
  const queryClient = useQueryClient();
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const theme = color[scheme];
  const session = useSession();
  const jobs = useJobsList();
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  useOwnerChangeCleanup();

  const rotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      // Mint the new bearer first so the reset refetches belong to the new owner.
      await rotateSession();
      await clearPersonalQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.session() });
    } catch (cause) {
      setRotateError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRotating(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: space["4"], gap: space["2"] }}>
        <Text style={{ color: theme.ink, fontSize: fontSize.xl, fontWeight: "600" }}>
          Pinkslip native prototype
        </Text>
        <Text style={{ color: theme["ink-3"], fontSize: fontSize.sm }}>
          session: {session.isPending ? "loading" : session.isError ? "error" : session.data?.state}
        </Text>
        <Pressable
          onPress={() => void rotate()}
          disabled={rotating}
          style={{
            alignSelf: "flex-start",
            backgroundColor: theme["control-selected-bg"],
            borderRadius: radius.md,
            paddingHorizontal: space["4"],
            paddingVertical: space["2"],
          }}
        >
          <Text style={{ color: theme["control-selected-ink"], fontSize: fontSize.sm, fontWeight: "500" }}>
            {rotating ? "Rotating…" : "Rotate token"}
          </Text>
        </Pressable>
        {rotateError
          ? <Text style={{ color: theme.bad, fontSize: fontSize.sm }}>rotate failed: {rotateError}</Text>
          : null}

        <View style={{ marginTop: space["4"], gap: space["1"] }}>
          <Text style={{ color: theme.ink, fontSize: fontSize.lg, fontWeight: "600" }}>Jobs</Text>
          <Text style={{ color: theme["ink-4"], fontSize: fontSize.xs }}>
            query: {jobs.status}/{jobs.fetchStatus}
          </Text>
          {jobs.isPending ? <ActivityIndicator /> : null}
          {jobs.isError
            ? <Text style={{ color: theme.bad, fontSize: fontSize.sm }}>{(jobs.error as Error).message}</Text>
            : null}
          {jobs.data?.jobs.slice(0, 25).map((job) => (
            <Text key={job.id} style={{ color: theme["ink-2"], fontSize: fontSize.sm }}>{job.title}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  startupError: { color: "#ff736d", fontSize: 14, paddingHorizontal: 16, textAlign: "center" },
});
