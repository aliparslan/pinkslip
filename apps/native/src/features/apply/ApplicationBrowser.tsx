import { useApi } from "@pinkslip/data";
import { ui } from "@pinkslip/tokens/native";
import * as Crypto from "expo-crypto";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Linking, Modal, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { PressableScale } from "../../kit/PressableScale";
import { GlyphMenu, Icon, IconButton, Text, type IconName } from "../../ui";
import { autoApply, type ApplicationBrowserSession, type AutoApplyResult, type FillProgress } from "../../platform/autofill/auto-apply";
import { runAutoApply } from "../../platform/autofill/auto-apply-loop";
import { SAMPLE_FORM, sampleApplyApi } from "./sample-form";

export interface ApplicationRequest {
  jobId: string;
  url: string;
  autoSubmit: boolean;
  /** For the header: "Apply at Stripe". */
  company?: string;
  /** The kit's sample form, filled by the real loop with a plan made on the phone. */
  sample?: boolean;
}

type Events = Parameters<ApplicationBrowserSession["open"]>[1];

/** iOS 26 draws real Liquid Glass; earlier versions get solid paper. */
const GLASS = isLiquidGlassAvailable();
/** How long after Submit is pressed, with no confirmation seen, before asking. */
const ASK_AFTER_MS = 6_000;

/** Wraps a function body so its result comes back through postMessage,
 * tagged with an id only the app knows. */
function wrap(id: string, body: string): string {
  return `(async () => {
  const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ pinkslip: ${JSON.stringify(id)} }, message)));
  try { post({ ok: true, value: await (async () => { ${body} })() }); }
  catch (error) { post({ ok: false, error: String((error && error.message) || error) }); }
})(); true;`;
}

/** The element a fill step stamped with this ref. */
const byRef = (ref: string) => `[...document.querySelectorAll("[data-pinkslip-ref]")].find((el) => el.getAttribute("data-pinkslip-ref") === ${JSON.stringify(ref)})`;

/** What Pinkslip filled in soft pink, what needs you outlined in pink (Paper 2.1, 2.2). */
function markScript(open: string[], mine: string[], colors: { soft: string; line: string; accent: string }) {
  return `(() => {
  let style = document.getElementById("pinkslip-marks");
  if (!style) { style = document.createElement("style"); style.id = "pinkslip-marks"; document.head.appendChild(style); }
  style.textContent = '[data-pinkslip-mark="filled"]{background-color:${colors.soft} !important;border-color:${colors.line} !important}'
    + '[data-pinkslip-mark="need"]{outline:2px solid ${colors.accent} !important;outline-offset:0 !important}';
  const open = new Set(${JSON.stringify(open)}), mine = new Set(${JSON.stringify(mine)});
  for (const el of document.querySelectorAll("[data-pinkslip-ref]")) {
    const ref = el.getAttribute("data-pinkslip-ref");
    if (open.has(ref)) el.setAttribute("data-pinkslip-mark", "need");
    else if (mine.has(ref)) el.setAttribute("data-pinkslip-mark", "filled");
    else el.removeAttribute("data-pinkslip-mark");
  }
})(); true;`;
}

/** Brings a blank into view and puts the cursor in it. A select only comes
 * into view: focused from a script it opens nothing on iOS. */
const focusScript = (ref: string) => `(() => { const el = ${byRef(ref)}; if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  if (el.tagName !== "SELECT") { try { el.focus({ preventScroll: true }); } catch {} } })(); true;`;

/** The board's own Submit, found and shown, never pressed: Pinkslip doesn't submit for you here. */
const SUBMIT_BUTTON = `(document.querySelector('button[type=submit], input[type=submit]')
  || [...document.querySelectorAll('button, [role=button], input[type=button]')].find((b) => /submit|apply/i.test((b.textContent || b.value || "").trim())))`;
const showSubmitScript = (accent: string) => `(() => { const b = ${SUBMIT_BUTTON}; if (!b) return;
  b.scrollIntoView({ block: "center", behavior: "smooth" });
  b.style.outline = "3px solid ${accent}"; b.style.outlineOffset = "2px"; setTimeout(() => { b.style.outline = ""; }, 1800); })(); true;`;

/** Tells the app when Submit is pressed, so it can ask if no confirmation
 * follows, and when you're typing in a field, when iOS's own form bar
 * takes the bottom (Paper 2.3: the fill bar steps out of the way). */
const WATCH_PAGE = `(() => { if (window.__pinkslipWatch) return; window.__pinkslipWatch = true;
  const send = (event) => window.ReactNativeWebView.postMessage(JSON.stringify({ pinkslipEvent: event }));
  const tell = () => send("submit");
  // Typing fields only: a select opens a menu, not the keyboard and its bar.
  const field = (el) => el && el.matches && el.matches("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable=true]");
  document.addEventListener("focusin", (event) => { if (field(event.target)) send("typing"); }, true);
  document.addEventListener("focusout", () => setTimeout(() => { if (!field(document.activeElement)) send("done-typing"); }, 50), true);
  document.addEventListener("submit", tell, true);
  // A form's own Submit counts once the form really submits (after the
  // board's checks pass); a script-driven one counts on the press.
  document.addEventListener("click", (event) => {
    const button = event.target && event.target.closest && event.target.closest("button, [role=button], input[type=submit]");
    if (!button || (button.form && button.type === "submit")) return;
    if (/submit|apply/i.test((button.textContent || button.value || "").trim())) tell();
  }, true);
})(); true;`;

const hostOf = (url: string | null) => {
  if (!url) return "";
  try { return new URL(url).host; } catch { return ""; }
};

/**
 * The in-app browser (Paper "2 · The in-app browser and fill bar"): the
 * board's form in a page sheet, read and filled by the auto-apply loop
 * while you watch. A glass bar at the bottom, like the toast and the tab
 * bar, says how far it got: filling, then what's filled and what needs you
 * (pink, with arrows to each blank), then Go to Submit once it's all
 * filled. Pinkslip never presses Submit here. When the board's
 * confirmation shows, the job is applied; if you pressed Submit and none
 * showed, the bar asks. Only fill instructions reach the page, never the
 * Pinkslip session.
 */
export function ApplicationBrowser({ request, onClose, onSubmitted, onConfirmApplied, onDismissed }: {
  request: ApplicationRequest | null;
  onClose: (result: AutoApplyResult) => void;
  onSubmitted: () => void;
  /** "I applied" when no confirmation showed. */
  onConfirmApplied?: () => void;
  /** Once the sheet has left the screen, so another modal can show. */
  onDismissed?: () => void;
}) {
  const api = useApi();
  const { theme } = useUnistyles();
  const web = useRef<WebView>(null);
  const pending = useRef(new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const events = useRef<Events | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [page, setPage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<FillProgress | null>(null);
  /** The blank the arrows last went to; -1 before the first. */
  const [blank, setBlank] = useState(-1);
  const [pressedAt, setPressedAt] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const [typing, setTyping] = useState(false);
  const loading = useSharedValue(0);
  const submittedCallback = useRef(onSubmitted);
  const closeCallback = useRef(onClose);
  submittedCallback.current = onSubmitted;
  closeCallback.current = onClose;
  // A board's page is light whatever the app's theme, so its marks are too.
  const marks = { soft: ui.color.light["accent-soft"], line: ui.color.light.separator, accent: ui.color.light.accent };

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
      setPage(target);
      return () => { events.current = null; };
    },
    run: (body) => new Promise<string>((resolve, reject) => {
      const id = Crypto.randomUUID();
      if (!web.current) { reject(new Error("The page isn't open")); return; }
      const timer = setTimeout(() => {
        pending.current.delete(id);
        reject(new Error("The page script timed out. Fill again from ⋯."));
      }, 30_000);
      pending.current.set(id, { resolve, reject, timer });
      web.current.injectJavaScript(wrap(id, body));
    }),
    setStatus: async (text) => setStatus(text),
    setProgress: async (next) => setProgress((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next),
  }), []);

  useEffect(() => {
    if (!request) return;
    let active = true;
    setStatus("");
    setProgress(null);
    setPressedAt(null);
    setAsking(false);
    const options = { ...request, onSubmitted: () => { if (active) submittedCallback.current(); } };
    const run = request.sample ? runAutoApply(sampleApplyApi, session, options, async () => null) : autoApply(api, session, options);
    void run.then((result) => {
      if (active) closeCallback.current(result);
    }, () => {
      if (active) closeCallback.current("closed");
    });
    return () => { active = false; finish(); };
  }, [api, session, request, finish]);

  // The page shows what Pinkslip filled and what needs you.
  const form = progress?.phase === "form" ? progress : null;
  const open = form?.open ?? [];
  const openKey = open.join(",");
  const mineKey = form?.byPinkslip.join(",") ?? "";
  useEffect(() => {
    if (!form) return;
    web.current?.injectJavaScript(markScript(open, form.byPinkslip, marks));
    // Repaint only when what's marked changes.
  }, [openKey, mineKey]);
  useEffect(() => { if (blank >= open.length) setBlank(-1); }, [open.length, blank]);

  // Pressed Submit and no confirmation came: ask, and only then.
  const applied = progress?.phase === "applied";
  useEffect(() => {
    if (pressedAt === null || applied) return;
    const timer = setTimeout(() => setAsking(true), ASK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [pressedAt, applied]);

  const onMessage = (event: WebViewMessageEvent) => {
    let data: { pinkslip?: string; pinkslipEvent?: string; ok?: boolean; value?: unknown; error?: string };
    try { data = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (data.pinkslipEvent === "submit") { setPressedAt(Date.now()); return; }
    if (data.pinkslipEvent === "typing" || data.pinkslipEvent === "done-typing") { setTyping(data.pinkslipEvent === "typing"); return; }
    const waiting = data.pinkslip ? pending.current.get(data.pinkslip) : undefined;
    if (!waiting || !data.pinkslip) return;
    pending.current.delete(data.pinkslip);
    clearTimeout(waiting.timer);
    if (data.ok) waiting.resolve(String(data.value ?? ""));
    else waiting.reject(new Error(data.error ?? "The page script failed"));
  };
  const jump = (step: 1 | -1) => {
    if (open.length === 0) return;
    const next = blank < 0 ? (step === 1 ? 0 : open.length - 1) : (blank + step + open.length) % open.length;
    setBlank(next);
    web.current?.injectJavaScript(focusScript(open[next]!));
  };
  const line = useAnimatedStyle(() => ({ width: `${loading.value * 100}%`, opacity: loading.value > 0 && loading.value < 1 ? 1 : 0 }));

  const bar: ReactNode = applied || typing ? null
    : asking ? <FillBar title="Did that go through?">
      <BarButton label="I applied" pink onPress={() => { setAsking(false); onConfirmApplied?.(); finish(); }} />
    </FillBar>
    : progress?.phase === "filling" ? <FillBar title="Filling the form" detail={`${progress.done} of ${progress.of}`}>
      <View style={styles.spinner}><ActivityIndicator color={theme.ui.color["ink-2"]} /></View>
      <BarButton label="Done" onPress={finish} />
    </FillBar>
    : form && open.length > 0 ? <FillBar title={`${form.filled} of ${form.total} filled`} detail={`${open.length} need${open.length === 1 ? "s" : ""} you`} detailTone="accent">
      <View style={styles.arrows}>
        <BarIcon icon="up" label="Previous blank" onPress={() => jump(-1)} />
        <BarIcon icon="down" label="Next blank" onPress={() => jump(1)} />
      </View>
      <BarButton label="Done" onPress={finish} />
    </FillBar>
    : form ? <FillBar title={form.filled === form.total ? `All ${form.total} filled` : `${form.filled} of ${form.total} filled`} detail="Submit is at the bottom">
      <BarButton label="Go to Submit" icon="down" pink onPress={() => web.current?.injectJavaScript(showSubmitScript(marks.accent))} />
    </FillBar>
    : status ? <FillBar title={status}><BarButton label="Done" onPress={finish} /></FillBar>
    : null;

  return <Modal visible={request !== null} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={finish}
    onDismiss={onDismissed}>
    <View style={styles.root}>
      <View style={styles.top}>
        <IconButton icon="close" label="Close" onPress={finish} />
        <View style={styles.title}>
          <Text role="subhead" weight="medium" lines={1}>{request?.company ? `Apply at ${request.company}` : "Apply"}</Text>
          {hostOf(page) ? <View style={styles.host}>
            <Icon name="secure" size={11} tone="ink-3" />
            <Text role="footnote" tone="ink-3" lines={1}>{hostOf(page)}</Text>
          </View> : null}
        </View>
        <GlyphMenu items={[
          { id: "fill", title: "Fill again", glyph: "tailor", onSelect: () => events.current?.onRefill() },
          ...(page && !request?.sample ? [{ id: "safari", title: "Open in Safari", glyph: "open" as const, onSelect: () => void Linking.openURL(page) }] : []),
        ]}>
          <View style={styles.more} accessibilityRole="button" accessibilityLabel="More"><Icon name="more" size={20} tone="ink-2" /></View>
        </GlyphMenu>
      </View>
      <View style={styles.track}><Animated.View style={[styles.line, line]} /></View>
      {url ? <WebView ref={web} source={request?.sample ? { html: SAMPLE_FORM, baseUrl: url } : { uri: url }} style={styles.web} onMessage={onMessage}
        injectedJavaScript={WATCH_PAGE} contentInset={{ bottom: 88 }}
        onLoadStart={() => { events.current?.onNavigating(); cancelScripts("The page changed"); setProgress(null); setTyping(false); }}
        onLoadProgress={(event) => { loading.value = withTiming(event.nativeEvent.progress, { duration: 150 }); }}
        onLoadEnd={(event) => {
          if (event.nativeEvent.loading) return;
          setPage(event.nativeEvent.url);
          events.current?.onLoaded(event.nativeEvent.url);
        }}
        sharedCookiesEnabled={false} incognito={false} allowsBackForwardNavigationGestures
        originWhitelist={["https://*", "http://*"]} setSupportMultipleWindows={false} /> : null}
      {bar ? <View style={styles.barSlot} pointerEvents="box-none">{bar}</View> : null}
    </View>
  </Modal>;
}

/** The fill bar: a glass capsule, what's happening on the left, its buttons on the right. */
function FillBar({ title, detail, detailTone = "ink-3", children }: {
  title: string;
  detail?: string;
  detailTone?: "ink-3" | "accent";
  children: ReactNode;
}) {
  // Liquid Glass lightens over a board's white page; in dark mode it's
  // tinted with the raised dark so the dark theme's words stay readable.
  const { theme, rt } = useUnistyles();
  const dark = !rt.themeName?.startsWith("light");
  return <GlassView glassEffectStyle="regular" colorScheme={dark ? "dark" : "light"} tintColor={dark ? theme.ui.color["bg-elev"] : undefined}
    style={[styles.bar, !GLASS && styles.paper]} accessibilityLiveRegion="polite">
    <View style={styles.words}>
      <Text role="subhead" weight="medium" lines={1}>{title}</Text>
      {detail ? <Text role="footnote" weight={detailTone === "accent" ? "medium" : "regular"} tone={detailTone} lines={1}>{detail}</Text> : null}
    </View>
    {children}
  </GlassView>;
}

function BarButton({ label, icon, pink, onPress }: { label: string; icon?: IconName; pink?: boolean; onPress: () => void }) {
  return <PressableScale accessibilityRole="button" onPress={onPress} contentStyle={[styles.barButton, pink && styles.pink]}>
    <Text weight="medium" tone={pink ? "accent-ink" : "ink"}>{label}</Text>
    {icon ? <Icon name={icon} size={16} tone={pink ? "accent-ink" : "ink"} /> : null}
  </PressableScale>;
}

function BarIcon({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} contentStyle={styles.barIcon}>
    <Icon name={icon} size={18} />
  </PressableScale>;
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.ui.color.bg },
  // Paper: 44 circles either side of the title, 12 above and 10 below.
  top: {
    flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"],
    paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["3"], paddingBottom: 10,
  },
  title: { flex: 1, alignItems: "center", gap: 1 },
  host: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"] },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  track: { height: 2 },
  line: { height: 2, backgroundColor: theme.ui.color.accent },
  web: { flex: 1 },
  barSlot: { position: "absolute", left: theme.ui.size.gutter, right: theme.ui.size.gutter, bottom: Math.max(rt.insets.bottom, theme.ui.space["4"]) },
  bar: {
    flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"],
    paddingVertical: 6, paddingLeft: theme.ui.space["5"], paddingRight: 6, borderRadius: theme.ui.radius.full,
  },
  paper: { backgroundColor: theme.ui.color["bg-elev"], boxShadow: theme.ui.shadow.pill },
  words: { flex: 1, minWidth: 0 },
  spinner: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  arrows: { flexDirection: "row", gap: theme.ui.space["1"] },
  barButton: {
    height: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18,
    borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color.pill,
  },
  pink: { backgroundColor: theme.ui.color["accent-fill"] },
  barIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.pill },
}));
