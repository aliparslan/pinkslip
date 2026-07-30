import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import type { PluginListenerHandle } from "@capacitor/core";
import type { Job } from "./api";

export interface ApplicationIntent {
  jobId: string;
  title: string;
  company: string;
  url: string;
  openedAt: number;
}

const STORAGE_KEY = "pinkslip:application-intent";
const RETURN_GUARD_MS = 750;
/** Upper bound on waiting for the native browser to release a stale controller. */
const NATIVE_RESET_TIMEOUT_MS = 600;
const MAX_INTENT_AGE_MS = 12 * 60 * 60 * 1000;

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

class ApplicationIntentController {
  pending = $state<ApplicationIntent | null>(null);

  private browserListener: PluginListenerHandle | null = null;
  private webCleanup: (() => void) | null = null;

  initialize(): () => void {
    const stored = this.readStoredIntent();
    if (stored && Date.now() - stored.openedAt >= RETURN_GUARD_MS) {
      this.pending = stored;
    }
    return () => this.clearReturnListeners();
  }

  async open(job: Job): Promise<void> {
    const targetUrl = normalizeUrl(job.url ?? "");
    if (!targetUrl) return;

    this.clearReturnListeners();
    const intent: ApplicationIntent = {
      jobId: job.id,
      title: job.title,
      company: job.company_name,
      url: targetUrl,
      openedAt: Date.now(),
    };
    this.storeIntent(intent);

    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Browser")) {
        this.clearReturnListeners();
        await this.resetNativeBrowser();

        this.browserListener = await Browser.addListener("browserFinished", () => {
          this.browserListener?.remove();
          this.browserListener = null;
          this.present(intent);
        });

        try {
          await Browser.open({ url: intent.url, presentationStyle: "fullscreen" });
          return;
        } catch (e) {
          // If native plugin open failed (e.g. plugin not available in native binary), clear listener
          this.clearReturnListeners();
          console.warn("Capacitor Browser plugin failed to open URL, falling back to window.open", e);
        }
      }

      this.watchForWebReturn(intent);
      const externalWindow = window.open(intent.url, "_blank");
      if (externalWindow) {
        externalWindow.opener = null;
      } else if (!Capacitor.isNativePlatform()) {
        // Only navigate in pure web mode if window.open was blocked; never overwrite native app WebView
        window.location.assign(intent.url);
      }
    } catch (error) {
      this.clearReturnListeners();
      this.clearStoredIntent();
      throw error;
    }
  }

  dismiss(): void {
    this.pending = null;
    this.clearStoredIntent();
  }

  /**
   * Clear any SFSafariViewController the native plugin is still holding.
   *
   * Bounded on purpose: `Browser.close()` resolves from inside UIKit's
   * dismissal completion, which is never called when the controller is not
   * actually presented — the precise situation this repairs. An unbounded await
   * would hang there and the apply button would do nothing at all.
   */
  private async resetNativeBrowser(): Promise<void> {
    await Promise.race([
      Browser.close().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, NATIVE_RESET_TIMEOUT_MS)),
    ]);
  }

  private present(intent: ApplicationIntent): void {
    if (this.pending?.jobId === intent.jobId) return;
    this.pending = intent;
  }

  private watchForWebReturn(intent: ApplicationIntent): void {
    let armed = false;
    let leftApp = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
      if (leftApp && document.visibilityState === "visible") maybePresent();
    }, RETURN_GUARD_MS);

    const maybePresent = () => {
      if (!armed || document.visibilityState === "hidden") return;
      cleanup();
      this.present(intent);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        leftApp = true;
      } else {
        maybePresent();
      }
    };
    const onBlur = () => {
      leftApp = true;
    };
    const cleanup = () => {
      window.clearTimeout(armTimer);
      window.removeEventListener("focus", maybePresent);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      if (this.webCleanup === cleanup) this.webCleanup = null;
    };

    window.addEventListener("focus", maybePresent);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    this.webCleanup = cleanup;
  }

  private clearReturnListeners(): void {
    this.webCleanup?.();
    this.webCleanup = null;
    if (this.browserListener) {
      void this.browserListener.remove();
      this.browserListener = null;
    }
  }

  private readStoredIntent(): ApplicationIntent | null {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      if (!value) return null;
      const parsed = JSON.parse(value) as Partial<ApplicationIntent>;
      if (
        typeof parsed.jobId !== "string"
        || typeof parsed.title !== "string"
        || typeof parsed.company !== "string"
        || typeof parsed.url !== "string"
        || typeof parsed.openedAt !== "number"
        || Date.now() - parsed.openedAt > MAX_INTENT_AGE_MS
      ) {
        this.clearStoredIntent();
        return null;
      }
      return parsed as ApplicationIntent;
    } catch {
      this.clearStoredIntent();
      return null;
    }
  }

  private storeIntent(intent: ApplicationIntent): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
    } catch {
      // Session storage may be unavailable in locked-down browser contexts.
    }
  }

  private clearStoredIntent(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing else to clean up.
    }
  }
}

export const applicationIntent = new ApplicationIntentController();
