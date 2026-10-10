import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { ResumeImportResult } from "@pinkslip/core/api";
import {
  DataProvider,
  clearPersonalQueries,
  createAppQueryClient,
  queryKeys,
  useApi,
  useFeed,
  useOwnerChangeCleanup,
  useSession,
} from "@pinkslip/data";
import { color, fontSize, radius, space } from "@pinkslip/tokens/native";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import {
  deleteResumeFile,
  importResume,
  pickResumeFile,
  stageFixture,
  type LocalResumeFile,
  type ResumeFixture,
} from "./src/resume";
import {
  API_URL,
  initializeSession,
  rotateSession,
  useDevBearerToken,
  type ApiClient,
} from "./src/session";

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

/** Prototype UI (Quarantine): proves session, Query, tokens and the resume
 * import/file lifecycle. Nothing here is a product screen. */
function Prototype() {
  const api = useApi();
  const queryClient = useQueryClient();
  const scheme = useColorScheme() === "light" ? "light" : "dark";
  const theme = color[scheme];
  const session = useSession();
  const jobs = useFeed({});
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<LocalResumeFile | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ResumeImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
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

  const runImport = async (file: LocalResumeFile) => {
    setResumeFile(file);
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      setImportResult(await importResume(api, file));
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setImporting(false);
    }
  };

  const importFixture = async (name: ResumeFixture) => {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      await runImport(await stageFixture(name));
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : String(cause));
      setImporting(false);
    }
  };

  const pickAndImport = async () => {
    const file = await pickResumeFile();
    if (file) await runImport(file);
  };

  const deleteLocal = () => {
    if (!resumeFile) return;
    deleteResumeFile(resumeFile);
    setResumeFile(null);
    setImportResult(null);
    setImportError(null);
  };

  // Deep-link harness for headless runs:
  //   exp://<host>/--/import/text|notext|malformed, /pick, /delete,
  //   /auth?token=…, /guest
  const commandRef = useRef<(url: string) => void>(() => undefined);
  commandRef.current = (url: string) => {
    const marker = url.indexOf("/--/");
    const raw = marker >= 0 ? url.slice(marker + 4) : new URL(url).pathname.replace(/^\//, "");
    const [name, argument] = raw.split("?")[0].split("/").filter(Boolean);
    const fixtures: ResumeFixture[] = ["text", "notext", "malformed"];
    if (name === "import" && fixtures.includes(argument as ResumeFixture)) {
      void importFixture(argument as ResumeFixture);
    } else if (name === "pick") {
      void pickAndImport();
    } else if (name === "delete") {
      deleteLocal();
    } else if (name === "auth") {
      const token = new URL(url).searchParams.get("token");
      if (token) {
        void useDevBearerToken(token).then(() => queryClient.invalidateQueries());
      }
    } else if (name === "guest") {
      void rotate();
    }
  };
  useEffect(() => {
    const run = (url: string) => commandRef.current(url);
    void Linking.getInitialURL().then((url) => {
      if (url) run(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => run(url));
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: space["4"], gap: space["2"] }}>
        <Text style={{ color: theme.ink, fontSize: fontSize.xl, fontWeight: "600" }}>
          Pinkslip native prototype
        </Text>
        <Text style={{ color: theme["ink-3"], fontSize: fontSize.sm }}>
          session: {session.isPending ? "loading" : session.isError ? "error" : session.data?.state}
        </Text>
        <Text style={{ color: theme["ink-4"], fontSize: fontSize.xs }}>api: {API_URL}</Text>
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

        <View style={{ marginTop: space["4"], gap: space["2"] }}>
          <Text style={{ color: theme.ink, fontSize: fontSize.lg, fontWeight: "600" }}>Resume import</Text>
          <Text style={{ color: theme["ink-3"], fontSize: fontSize.sm }}>
            local file: {resumeFile ? `${resumeFile.name} (${resumeFile.size} B)` : "none"}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space["2"] }}>
            <PrototypeButton label="Pick PDF" background={theme["control-selected-bg"]} foreground={theme["control-selected-ink"]} onPress={() => void pickAndImport()} />
            <PrototypeButton label="Import text fixture" background={theme["control-selected-bg"]} foreground={theme["control-selected-ink"]} onPress={() => void importFixture("text")} />
            <PrototypeButton label="Import no-text fixture" background={theme["control-selected-bg"]} foreground={theme["control-selected-ink"]} onPress={() => void importFixture("notext")} />
            <PrototypeButton label="Import malformed" background={theme["control-selected-bg"]} foreground={theme["control-selected-ink"]} onPress={() => void importFixture("malformed")} />
            <PrototypeButton label="Delete local copy" background={theme["control-selected-bg"]} foreground={theme["control-selected-ink"]} onPress={deleteLocal} />
          </View>
          {importing ? <ActivityIndicator /> : null}
          {importError
            ? <Text style={{ color: theme.bad, fontSize: fontSize.sm }}>import failed: {importError}</Text>
            : null}
          {importResult
            ? <Text style={{ color: theme["ink-2"], fontSize: fontSize.sm }}>
                {`name: ${importResult.profile.contact.name || "—"}\nemail: ${importResult.profile.contact.email || "—"}\ncounts: ${JSON.stringify(importResult.counts)}\nwarnings: ${importResult.warnings.length}`}
              </Text>
            : null}
        </View>

        <View style={{ marginTop: space["4"], gap: space["1"] }}>
          <Text style={{ color: theme.ink, fontSize: fontSize.lg, fontWeight: "600" }}>Jobs</Text>
          <Text style={{ color: theme["ink-4"], fontSize: fontSize.xs }}>
            query: {jobs.status}/{jobs.fetchStatus}
          </Text>
          {jobs.isPending ? <ActivityIndicator /> : null}
          {jobs.isError
            ? <Text style={{ color: theme.bad, fontSize: fontSize.sm }}>{(jobs.error as Error).message}</Text>
            : null}
          {jobs.data?.pages[0]?.jobs.slice(0, 25).map((job) => (
            <Text key={job.id} style={{ color: theme["ink-2"], fontSize: fontSize.sm }}>{job.title}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PrototypeButton({ label, background, foreground, onPress }: {
  label: string;
  background: string;
  foreground: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: background, borderRadius: radius.md, paddingHorizontal: space["3"], paddingVertical: space["2"] }}
    >
      <Text style={{ color: foreground, fontSize: fontSize.xs, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  startupError: { color: "#ff736d", fontSize: 14, paddingHorizontal: 16, textAlign: "center" },
});
