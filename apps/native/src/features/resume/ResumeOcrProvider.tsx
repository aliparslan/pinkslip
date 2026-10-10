import { MAX_OCR_PAGES } from "@pinkslip/core/resume-ocr";
import { Asset } from "expo-asset";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { ResumeImportFailure } from "./import-policy";

export interface OcrPage { base64: string; width: number; height: number }
type Render = (uri: string, signal?: AbortSignal) => Promise<OcrPage[]>;
interface Request { id: string; pdf: string; started: boolean; pages: OcrPage[]; resolve(pages: OcrPage[]): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; cleanup(): void }
const Renderer = createContext<Render | null>(null);
let bundledHtml: Promise<string> | undefined;
function loadHtml() {
  return bundledHtml ??= Asset.fromModule(require("../../../assets/resume-renderer.html")).downloadAsync()
    .then((asset) => new File(asset.localUri!).text()).catch((error) => { bundledHtml = undefined; throw error; });
}

/** Mounted only during scanned-PDF import. The local renderer has no API
 * access, cookies or external assets. Unmounting ends an outstanding render. */
export function ResumeOcrProvider({ children }: { children: ReactNode }) {
  const web = useRef<WebView>(null);
  const active = useRef<Request | null>(null);
  const mounted = useRef(true);
  const [source, setSource] = useState<{ id: string; html: string } | null>(null);
  const finish = (error?: Error) => {
    const request = active.current;
    if (!request) return;
    active.current = null;
    clearTimeout(request.timer);
    request.cleanup();
    if (mounted.current) setSource(null);
    if (error) request.reject(error); else request.resolve(request.pages);
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; finish(new ResumeImportFailure("conversion_unavailable")); };
  }, []);
  const render: Render = async (uri, signal) => {
    if (signal?.aborted || !mounted.current) throw new ResumeImportFailure("conversion_unavailable");
    if (active.current) throw new ResumeImportFailure("conversion_unavailable");
    const id = Crypto.randomUUID();
    return new Promise<OcrPage[]>((resolve, reject) => {
      const abort = () => { if (active.current?.id === id) finish(new ResumeImportFailure("conversion_unavailable")); };
      active.current = { id, pdf: "", started: false, pages: [], resolve, reject,
        cleanup: () => signal?.removeEventListener("abort", abort),
        timer: setTimeout(() => finish(new ResumeImportFailure("conversion_unavailable")), 60_000) };
      signal?.addEventListener("abort", abort, { once: true });
      void Promise.all([loadHtml(), new File(uri).base64()]).then(([html, pdf]) => {
        if (active.current?.id !== id) return;
        active.current.pdf = pdf;
        setSource({ id, html });
      }, () => { if (active.current?.id === id) finish(new ResumeImportFailure("conversion_unavailable")); });
    });
  };
  const message = (event: WebViewMessageEvent) => {
    const request = active.current;
    if (!request) return;
    try {
      const data = JSON.parse(event.nativeEvent.data) as { id?: string; kind?: string; code?: string; count?: number; number?: number } & OcrPage;
      if (data.kind === "ready") {
        if (request.started) return;
        request.started = true;
        web.current?.injectJavaScript(`void window.pinkslipRenderPdf(${JSON.stringify(request.pdf)}, ${JSON.stringify(request.id)}); true;`);
      } else if (data.id === request.id && data.kind === "page") {
        if (request.pages.length >= MAX_OCR_PAGES || data.number !== request.pages.length + 1
          || typeof data.base64 !== "string" || data.base64.length > 5 * 1024 * 1024
          || !Number.isInteger(data.width) || !Number.isInteger(data.height)
          || data.width < 1 || data.height < 1 || data.width > 1801 || data.height > 1801
          || data.width * data.height > 2_505_000) throw new Error("Invalid rendered page");
        request.pages.push({ base64: data.base64, width: data.width, height: data.height });
      } else if (data.id === request.id && data.kind === "done") {
        if (!request.pages.length || data.count !== request.pages.length) throw new Error("Missing rendered pages");
        finish();
      } else if (data.id === request.id && data.kind === "error") {
        finish(new ResumeImportFailure(data.code === "protected_pdf" || data.code === "invalid_pdf" ? data.code : "conversion_unavailable"));
      }
    } catch { finish(new ResumeImportFailure("conversion_unavailable")); }
  };
  return <Renderer.Provider value={render}>
    {children}
    {source && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}>
      <WebView key={source.id} ref={web} source={{ html: source.html, baseUrl: "about:blank" }} originWhitelist={["*"]}
        sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} incognito
        onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
        onMessage={(event) => { if (active.current?.id === source.id) message(event); }}
        onError={() => { if (active.current?.id === source.id) finish(new ResumeImportFailure("conversion_unavailable")); }}
        onContentProcessDidTerminate={() => { if (active.current?.id === source.id) finish(new ResumeImportFailure("conversion_unavailable")); }} />
    </View>}
  </Renderer.Provider>;
}

export function useResumeRenderer(): Render {
  const render = useContext(Renderer);
  if (!render) throw new Error("Resume import needs ResumeOcrProvider");
  return render;
}
