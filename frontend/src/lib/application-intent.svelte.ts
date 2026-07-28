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
const MAX_INTENT_AGE_MS = 12 * 60 * 60 * 1000;

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
    if (!job.url) return;

    this.clearReturnListeners();
    const intent: ApplicationIntent = {
      jobId: job.id,
      title: job.title,
      company: job.company_name,
      url: job.url,
      openedAt: Date.now(),
    };
    this.storeIntent(intent);

    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Browser")) {
        this.browserListener = await Browser.addListener("browserFinished", () => {
          this.browserListener?.remove();
          this.browserListener = null;
          this.present(intent);
        });
        await Browser.open({
          url: intent.url,
          presentationStyle: "fullscreen",
        });
        return;
      }

      this.watchForWebReturn(intent);
      const externalWindow = window.open(intent.url, "_blank");
      if (externalWindow) {
        externalWindow.opener = null;
      } else {
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
