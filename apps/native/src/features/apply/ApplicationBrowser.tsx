import { useApi } from "@pinkslip/data";
import * as Crypto from "expo-crypto";
import { X } from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * The application browser (6.10): the employer's form in a dismissible
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
  const pending = useRef(new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const events = useRef<Events | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const submittedCallback = useRef(onSubmitted);
  const closeCallback = useRef(onClose);
  submittedCallback.current = onSubmitted;
  closeCallback.current = onClose;

  const cancelScripts = useCallback((reason: string) => {
    for (const waiting of pending.current.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error(reason));
    }
    pending.current.clear();
  }, []);
  const finish = useCallback(() => {
    events.current?.onFinished();
    events.current = null;
    cancelScripts("Closed");
    setUrl(null);
  }, [cancelScripts]);

  const session = useMemo<ApplicationBrowserSession>(() => ({
    open: async (target, handlers) => {
      events.current = handlers;
      setUrl(target);
      return () => { events.current = null; };
    },
    run: (body) => new Promise<string>((resolve, reject) => {
      const id = Crypto.randomUUID();
      if (!web.current) { reject(new Error("The page isn't open")); return; }
      const timer = setTimeout(() => {
        pending.current.delete(id);
        reject(new Error("The page script timed out. Tap Fill to retry."));
      }, 30_000);
      pending.current.set(id, { resolve, reject, timer });
      web.current.injectJavaScript(wrap(id, body));
    }),
    setStatus: async (text) => setStatus(text),
  }), []);

  useEffect(() => {
    if (!request) return;
    let active = true;
    setStatus("");
    void autoApply(api, session, { ...request, onSubmitted: () => {
      if (active) submittedCallback.current();
    } }).then((result) => {
      if (active) closeCallback.current(result);
    }, () => {
      if (active) closeCallback.current("closed");
    });
    return () => { active = false; finish(); };
  }, [api, session, request, finish]);

  const onMessage = (event: WebViewMessageEvent) => {
    let data: { pinkslip?: string; ok?: boolean; value?: unknown; error?: string };
    try { data = JSON.parse(event.nativeEvent.data); } catch { return; }
    const waiting = data.pinkslip ? pending.current.get(data.pinkslip) : undefined;
    if (!waiting || !data.pinkslip) return;
    pending.current.delete(data.pinkslip);
    clearTimeout(waiting.timer);
    if (data.ok) waiting.resolve(String(data.value ?? ""));
    else waiting.reject(new Error(data.error ?? "The page script failed"));
  };
  return <Modal visible={request !== null} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={finish}>
    <View style={styles.root}>
      <View style={styles.bar}>
        <IconButton icon={X} label="Close application" onPress={finish} />
        <View style={styles.status} accessibilityLiveRegion="polite"><Text size="sm" weight="medium" tone="ink-2" truncate>{status || "Application"}</Text></View>
        <Button size="compact" disabled={!url} onPress={() => events.current?.onRefill()}>Fill</Button>
      </View>
      {url ? <WebView ref={web} source={{ uri: url }} style={styles.web} onMessage={onMessage}
        onLoadStart={() => { events.current?.onNavigating(); cancelScripts("The page changed"); }}
        onLoadEnd={(event) => { if (!event.nativeEvent.loading) events.current?.onLoaded(event.nativeEvent.url); }}
        sharedCookiesEnabled={false} incognito={false} allowsBackForwardNavigationGestures
        originWhitelist={["https://*", "http://*"]} setSupportMultipleWindows={false} /> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg, paddingTop: theme.space["3"], paddingBottom: rt.insets.bottom },
  bar: { flexDirection: "row", alignItems: "center", gap: theme.space["2"], paddingHorizontal: theme.space["2"], paddingBottom: theme.space["2"], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.line },
  status: { flex: 1, alignItems: "center" },
  web: { flex: 1 },
}));
