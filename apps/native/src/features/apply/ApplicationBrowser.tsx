import { useApi } from "@pinkslip/data";
import * as Crypto from "expo-crypto";
import { X } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { Button, IconButton, Text } from "../../kit";
import { autoApply, type ApplicationBrowserSession, type AutoApplyResult } from "../../platform/autofill/auto-apply";

export interface ApplicationRequest { jobId: string; url: string; autoSubmit: boolean }

type Events = Parameters<ApplicationBrowserSession["open"]>[1];

/** Wraps a function body so its result comes back through postMessage,
 * tagged with an id only the app knows. */
function wrap(id: string, body: string): string {
  return `(async () => {
  const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ pinkslip: ${JSON.stringify(id)} }, message)));
  try { post({ ok: true, value: await (async () => { ${body} })() }); }
  catch (error) { post({ ok: false, error: String((error && error.message) || error) }); }
})(); true;`;
}

/**
 * The application browser (6.10): the employer's form in a full-screen
 * WebView, read and filled by the auto-apply loop through injected scripts,
 * with a status line, Fill (run again) and Close. Only fill instructions
 * reach the page, never the Pinkslip session.
 */
export function ApplicationBrowser({ request, onClose, onSubmitted }: {
  request: ApplicationRequest | null;
  onClose: (result: AutoApplyResult) => void;
  onSubmitted: () => void;
}) {
  const api = useApi();
  const web = useRef<WebView>(null);
  const pending = useRef(new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>());
  const events = useRef<Events | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const session = useMemo<ApplicationBrowserSession>(() => ({
    open: async (target, handlers) => {
      events.current = handlers;
      setUrl(target);
      return () => { events.current = null; };
    },
    run: (body) => new Promise<string>((resolve, reject) => {
      const id = Crypto.randomUUID();
      pending.current.set(id, { resolve, reject });
      if (!web.current) { pending.current.delete(id); reject(new Error("The page isn't open")); return; }
      web.current.injectJavaScript(wrap(id, body));
    }),
    setStatus: async (text) => setStatus(text),
  }), []);

  useEffect(() => {
    if (!request) return;
    setStatus("");
    void autoApply(api, session, { ...request, onSubmitted }).then(onClose, () => onClose("closed"));
    // A request starts one session; closing ends it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const onMessage = (event: WebViewMessageEvent) => {
    let data: { pinkslip?: string; ok?: boolean; value?: unknown; error?: string };
    try { data = JSON.parse(event.nativeEvent.data); } catch { return; }
    const waiting = data.pinkslip ? pending.current.get(data.pinkslip) : undefined;
    if (!waiting || !data.pinkslip) return;
    pending.current.delete(data.pinkslip);
    if (data.ok) waiting.resolve(String(data.value ?? ""));
    else waiting.reject(new Error(data.error ?? "The page script failed"));
  };
  const close = () => {
    for (const waiting of pending.current.values()) waiting.reject(new Error("Closed"));
    pending.current.clear();
    events.current?.onFinished();
    setUrl(null);
  };

  return <Modal visible={request !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <View style={styles.root}>
      <View style={styles.bar}>
        <IconButton icon={X} label="Close application" onPress={close} />
        <View style={styles.status} accessibilityLiveRegion="polite"><Text size="sm" weight="medium" tone="ink-2" truncate>{status || "Application"}</Text></View>
        <Button size="compact" onPress={() => events.current?.onRefill()}>Fill</Button>
      </View>
      {url ? <WebView ref={web} source={{ uri: url }} style={styles.web} onMessage={onMessage}
        onLoadEnd={(event) => { if (!event.nativeEvent.loading) events.current?.onLoaded(event.nativeEvent.url); }}
        sharedCookiesEnabled={false} incognito={false} allowsBackForwardNavigationGestures
        originWhitelist={["https://*", "http://*"]} setSupportMultipleWindows={false} /> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: rt.insets.top },
  bar: { flexDirection: "row", alignItems: "center", gap: theme.space["2"], paddingHorizontal: theme.space["2"], paddingBottom: theme.space["2"], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.line },
  status: { flex: 1, alignItems: "center" },
  web: { flex: 1 },
}));
