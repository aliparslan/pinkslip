import type { CapacitorConfig } from "@capacitor/cli";

// Local live-reload: point the WebView at the Vite dev server instead of the
// live origin. The simulator reaches the Mac's localhost, Vite proxies /api to
// `wrangler dev` (:8787), and cookies stay first-party to localhost:5173.
//
//   cd .. && wrangler dev                 # worker on :8787  (terminal 1)
//   cd frontend && bun run dev            # vite on :5173     (terminal 2)
//   CAP_SERVER_URL=http://localhost:5173 bunx cap copy ios   # then rebuild
//
// The committed default (no env var) keeps the production origin, so a plain
// `cap copy ios` / release build is always pointed at prod.
const serverUrl = process.env.CAP_SERVER_URL || "https://pinkslip.alip.dev";

const config: CapacitorConfig = {
  appId: "dev.alip.pinkslip",
  appName: "pinkslip",
  // `dist` (frontend/dist) is the bundled web build, used as an offline fallback.
  webDir: "dist",
  server: {
    // Run the WebView against the live origin so the existing cookie session,
    // SSE tailoring, and client-side PDF export all work unchanged. Loading the
    // production origin (not capacitor://localhost) keeps cookies first-party.
    url: serverUrl,
    // Allow http only when explicitly pointed at a local dev server.
    cleartext: serverUrl.startsWith("http://"),
  },
  ios: {
    // Run edge-to-edge; the web app handles status bar / home-indicator spacing
    // itself via CSS env(safe-area-inset-*).
    contentInset: "never",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      // Resize the WebView when the keyboard appears so focused inputs aren't
      // covered. CSS hides the mobile tab bar while a field has focus.
      resize: "native",
    },
  },
};

export default config;
